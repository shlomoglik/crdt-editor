const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { URL } = require('node:url')
const WebSocket = require('ws')
const { setupWSConnection, getPersistence, docs } = require('y-websocket/bin/utils')

const host = process.env.HOST || 'localhost'
const port = Number(process.env.PORT || 1234)
const dataDirectory = process.env.YPERSISTENCE || './.data'
const dataPath = path.join(dataDirectory, 'merhav.json')
const documentIdPattern = /^[a-zA-Z0-9_-]{1,100}$/
const sessionCookie = 'merhav_session'
const sessions = new Map()
const deletingDocuments = new Set()
const pendingPersistenceBinds = new Map()

const configuredPersistence = getPersistence()
if (configuredPersistence) {
  const bindState = configuredPersistence.bindState
  configuredPersistence.bindState = (documentId, document) => {
    const binding = Promise.resolve(bindState(documentId, document))
    pendingPersistenceBinds.set(documentId, binding)
    binding.then(
      () => { if (pendingPersistenceBinds.get(documentId) === binding) pendingPersistenceBinds.delete(documentId) },
      () => { if (pendingPersistenceBinds.get(documentId) === binding) pendingPersistenceBinds.delete(documentId) },
    )
    return binding
  }
}

fs.mkdirSync(dataDirectory, { recursive: true })
const data = loadData()

function loadData() {
  let contents
  try {
    contents = fs.readFileSync(dataPath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return { users: [], documents: [] }
    throw error
  }
  const parsed = JSON.parse(contents)
  if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.documents)) throw new Error('The account and document data file is invalid.')
  return {
    users: parsed.users.filter(user => typeof user.id === 'string' && typeof user.username === 'string' && typeof user.salt === 'string' && typeof user.passwordHash === 'string'),
    documents: parsed.documents.filter(document => typeof document.id === 'string' && typeof document.ownerId === 'string' && Array.isArray(document.sharedWith)),
  }
}

function persistData() {
  const temporaryPath = `${dataPath}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(data), { mode: 0o600 })
  fs.renameSync(temporaryPath, dataPath)
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  response.end(JSON.stringify(value))
}

function hasSameOrigin(request) {
  const origin = request.headers.origin
  if (!origin) return true
  const requestHost = request.headers['x-forwarded-host'] || request.headers.host
  try { return new URL(origin).host === requestHost } catch { return false }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', chunk => {
      body += chunk
      if (body.length > 16_384) reject(new Error('Request body too large'))
    })
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) } catch { reject(new Error('Invalid JSON')) }
    })
    request.on('error', reject)
  })
}

function getSessionToken(request) {
  const cookie = request.headers.cookie || ''
  const entry = cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`))
  return entry ? entry.slice(sessionCookie.length + 1) : ''
}

function currentUser(request) {
  const token = getSessionToken(request)
  const tokenHash = token && hash(token)
  const userId = tokenHash && sessions.get(tokenHash)
  return data.users.find(user => user.id === userId) || null
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function createSession(user, response) {
  const token = crypto.randomBytes(32).toString('base64url')
  sessions.set(hash(token), user.id)
  response.setHeader('Set-Cookie', `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
}

function clearSession(request, response) {
  const token = getSessionToken(request)
  if (token) sessions.delete(hash(token))
  response.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
}

function publicUser(user) {
  return { id: user.id, username: user.username }
}

function ownedOrSharedDocuments(user) {
  return data.documents
    .filter(document => !document.deleting && (document.ownerId === user.id || document.sharedWith?.includes(user.id)))
    .map(document => ({
      id: document.id,
      title: document.title,
      updatedAt: document.updatedAt,
      ownerId: document.ownerId,
      ownerUsername: data.users.find(entry => entry.id === document.ownerId)?.username ?? 'Unknown',
      access: document.ownerId === user.id ? 'owner' : 'shared',
      sharedWithCount: document.sharedWith.length,
    }))
}

function findDocument(id) {
  return data.documents.find(document => document.id === id)
}

function hasAccess(document, user) {
  return document && !document.deleting && (document.ownerId === user.id || document.sharedWith?.includes(user.id))
}

function disconnectUser(userId, documentId) {
  const rooms = documentId ? [docs.get(documentId)].filter(Boolean) : docs.values()
  for (const room of rooms) {
    for (const connection of room.conns.keys()) {
      if (connection.merhavUserId === userId) connection.close(4001, 'Access changed')
    }
  }
}

async function handleApi(request, response, url) {
  const route = url.pathname
  if (request.method !== 'GET' && !hasSameOrigin(request)) return sendJson(response, 403, { error: 'Cross-origin requests are not allowed.' })
  if (request.method === 'GET' && route === '/api/session') {
    const user = currentUser(request)
    return sendJson(response, 200, { user: user ? publicUser(user) : null })
  }

  if (request.method === 'POST' && (route === '/api/register' || route === '/api/login')) {
    const body = await readJson(request)
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length < 10 || password.length > 200) {
      return sendJson(response, 400, { error: 'Choose a username (3–24 letters, numbers, or underscores) and a password of at least 10 characters.' })
    }

    let user
    if (route === '/api/register') {
      if (data.users.some(entry => entry.username === username)) return sendJson(response, 409, { error: 'That username is already taken.' })
      const salt = crypto.randomBytes(16).toString('hex')
      const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex')
      user = { id: crypto.randomUUID(), username, salt, passwordHash }
      data.users.push(user)
      persistData()
    } else {
      user = data.users.find(entry => entry.username === username)
      if (!user) return sendJson(response, 401, { error: 'Incorrect username or password.' })
      const passwordHash = crypto.scryptSync(password, user.salt, 64)
      if (!crypto.timingSafeEqual(passwordHash, Buffer.from(user.passwordHash, 'hex'))) return sendJson(response, 401, { error: 'Incorrect username or password.' })
    }
    const previousUser = currentUser(request)
    createSession(user, response)
    if (previousUser && previousUser.id !== user.id) disconnectUser(previousUser.id)
    return sendJson(response, 200, { user: publicUser(user) })
  }

  if (request.method === 'POST' && route === '/api/logout') {
    const user = currentUser(request)
    if (user) disconnectUser(user.id)
    clearSession(request, response)
    return sendJson(response, 200, { ok: true })
  }

  const user = currentUser(request)
  if (!user) return sendJson(response, 401, { error: 'Sign in to continue.' })

  if (request.method === 'GET' && route === '/api/documents') {
    return sendJson(response, 200, { documents: ownedOrSharedDocuments(user) })
  }

  if (request.method === 'POST' && route === '/api/documents') {
    const body = await readJson(request)
    const id = crypto.randomUUID()
    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : 'Untitled document'
    const document = { id, title, updatedAt: Date.now(), ownerId: user.id, sharedWith: [] }
    data.documents.push(document)
    persistData()
    return sendJson(response, 201, { document: { ...document, access: 'owner', ownerUsername: user.username, sharedWithCount: 0 } })
  }

  const claimRoute = route.match(/^\/api\/documents\/([a-zA-Z0-9_-]{1,100})\/claim$/)
  if (claimRoute && request.method === 'POST') {
    const [, id] = claimRoute
    if (findDocument(id)) return sendJson(response, 409, { error: 'This document already has an owner or is no longer available to claim.' })
    const body = await readJson(request)
    const document = {
      id,
      title: typeof body.title === 'string' ? body.title.slice(0, 200) : 'Untitled document',
      updatedAt: Date.now(),
      ownerId: user.id,
      sharedWith: [],
    }
    data.documents.push(document)
    persistData()
    return sendJson(response, 201, { document: { ...document, access: 'owner', ownerUsername: user.username, sharedWithCount: 0 } })
  }

  const documentRoute = route.match(/^\/api\/documents\/([a-zA-Z0-9_-]{1,100})(?:\/(share|leave))?$/)
  if (documentRoute) {
    const [, id, action] = documentRoute
    const document = findDocument(id)
    if (!document || !hasAccess(document, user)) return sendJson(response, 404, { error: 'Document not found.' })

    if (action === 'share' && request.method === 'POST') {
      if (document.ownerId !== user.id) return sendJson(response, 403, { error: 'Only the owner can share this document.' })
      const body = await readJson(request)
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
      const recipient = data.users.find(entry => entry.username === username)
      if (!recipient) return sendJson(response, 404, { error: 'No account has that username.' })
      if (recipient.id === user.id) return sendJson(response, 400, { error: 'You already own this document.' })
      if (!document.sharedWith.includes(recipient.id)) {
        document.sharedWith.push(recipient.id)
        persistData()
      }
      return sendJson(response, 200, { document: { id: document.id, username: recipient.username } })
    }

    if (action === 'leave' && request.method === 'DELETE') {
      if (document.ownerId === user.id) return sendJson(response, 400, { error: 'Owners cannot leave their own document.' })
      document.sharedWith = document.sharedWith.filter(id => id !== user.id)
      persistData()
      disconnectUser(user.id, id)
      return sendJson(response, 200, { ok: true })
    }

    if (!action && request.method === 'PATCH') {
      const body = await readJson(request)
      if (typeof body.title === 'string') document.title = body.title.slice(0, 200)
      document.updatedAt = Date.now()
      persistData()
      return sendJson(response, 200, { ok: true })
    }

    if (!action && request.method === 'DELETE') {
      if (document.ownerId !== user.id) return sendJson(response, 403, { error: 'Only the owner can permanently delete this document.' })
      deletingDocuments.add(id)
      document.deleting = true
      persistData()
      await pendingPersistenceBinds.get(id)
      const room = docs.get(id)
      if (room) {
        const connections = [...room.conns.keys()]
        room.conns.clear()
        docs.delete(id)
        room.destroy()
        for (const connection of connections) connection.close(4001, 'Document deleted')
      }
      const persistence = getPersistence()
      if (persistence?.provider?.clearDocument) await persistence.provider.clearDocument(id)
      data.documents = data.documents.filter(entry => entry.id !== id)
      persistData()
      deletingDocuments.delete(id)
      return sendJson(response, 200, { ok: true })
    }
  }

  return sendJson(response, 404, { error: 'Not found.' })
}

const server = http.createServer((request, response) => {
  if (!request.url?.startsWith('/api/')) {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    return response.end('okay')
  }
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  handleApi(request, response, url).catch(error => {
    console.error(error)
    if (!response.headersSent) sendJson(response, 500, { error: 'The request could not be completed.' })
    else response.end()
  })
})

const websocketServer = new WebSocket.Server({ noServer: true })
websocketServer.on('connection', (connection, request, documentId, userId) => {
  connection.merhavUserId = userId
  setupWSConnection(connection, request, { docName: documentId })
})

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (!url.pathname.startsWith('/yjs/')) return socket.destroy()
  let documentId
  try { documentId = decodeURIComponent(url.pathname.slice('/yjs/'.length)) } catch { return socket.destroy() }
  const user = currentUser(request)
  const document = documentId && findDocument(documentId)
  if (!hasSameOrigin(request) || !user || !document || deletingDocuments.has(documentId) || !documentIdPattern.test(documentId) || !hasAccess(document, user)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    return socket.destroy()
  }
  websocketServer.handleUpgrade(request, socket, head, connection => {
    websocketServer.emit('connection', connection, request, documentId, user.id)
  })
})

async function recoverInterruptedDeletions() {
  const interrupted = data.documents.filter(document => document.deleting)
  if (!interrupted.length) return
  const persistence = getPersistence()
  for (const document of interrupted) {
    if (persistence?.provider?.clearDocument) await persistence.provider.clearDocument(document.id)
    data.documents = data.documents.filter(entry => entry.id !== document.id)
  }
  persistData()
}

recoverInterruptedDeletions().then(() => {
  server.listen(port, host, () => console.log(`Merhav server listening at http://${host}:${port}`))
}).catch(error => {
  console.error('Could not finish interrupted document deletion.', error)
  process.exitCode = 1
})
