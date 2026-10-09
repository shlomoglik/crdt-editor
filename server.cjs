const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { URL } = require('node:url')
const WebSocket = require('ws')
const { setupWSConnection, getPersistence, getYDoc, docs } = require('y-websocket/bin/utils')
const Y = require('yjs')
const { copyContent, createHistory, decodeVersion, publicVersion, versionContent } = require('./versionHistory.cjs')

const host = process.env.HOST || 'localhost'
const port = Number(process.env.PORT || 1234)
const dataDirectory = process.env.YPERSISTENCE || './.data'
const dataPath = path.join(dataDirectory, 'merhav.json')
const documentIdPattern = /^[a-zA-Z0-9_-]{1,100}$/
const sessionCookie = 'merhav_session'
const sessions = new Map()
const deletingDocuments = new Set()
const pendingPersistenceBinds = new Map()
const roomHistories = new WeakMap()

async function historyRoom(id) {
  const room = getYDoc(id)
  if (!roomHistories.has(room)) {
    const ready = (async () => {
      await pendingPersistenceBinds.get(id)
      const document = findDocument(id)
      if (!document || document.deleting) throw new Error('Document is unavailable.')
      return createHistory(document, room, persistData)
    })()
    roomHistories.set(room, ready)
  }
  return { room, history: await roomHistories.get(room) }
}

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
    if (error.code === 'ENOENT') return { users: [], documents: [], areas: [] }
    throw error
  }
  const parsed = JSON.parse(contents)
  if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.documents)) throw new Error('The account and document data file is invalid.')
  return {
    users: parsed.users.filter(user => typeof user.id === 'string' && typeof user.username === 'string' && typeof user.salt === 'string' && typeof user.passwordHash === 'string'),
    documents: parsed.documents.filter(document => typeof document.id === 'string' && typeof document.ownerId === 'string' && Array.isArray(document.sharedWith)),
    areas: Array.isArray(parsed.areas) ? parsed.areas.filter(area => typeof area.id === 'string' && typeof area.ownerId === 'string' && Array.isArray(area.members) && Array.isArray(area.invitations)) : [],
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
    .filter(document => !document.deleting && (document.ownerId === user.id || document.sharedWith?.includes(user.id) || (document.areaId && findArea(document.areaId)?.members.includes(user.id))))
    .map(document => ({
      id: document.id,
      title: document.title,
      updatedAt: document.updatedAt,
      ownerId: document.ownerId,
      ownerUsername: data.users.find(entry => entry.id === document.ownerId)?.username ?? 'Unknown',
      access: document.ownerId === user.id ? 'owner' : document.sharedWith?.includes(user.id) ? 'shared' : 'area',
      sharedWithCount: new Set([...(document.sharedWith || []), ...(document.areaId ? (findArea(document.areaId)?.members || []) : [])].filter(id => id !== document.ownerId)).size,
      areaId: document.areaId || null,
      areaName: document.areaId ? findArea(document.areaId)?.name || null : null,
      areaOwnerId: document.areaId ? findArea(document.areaId)?.ownerId || null : null,
    }))
}

function findDocument(id) {
  return data.documents.find(document => document.id === id)
}

function findArea(id) { return data.areas.find(area => area.id === id) }
function canAccessArea(area, user) { return area && area.members.includes(user.id) }
function publicArea(area, viewerId) { return { id: area.id, name: area.name, ownerId: area.ownerId, ownerUsername: data.users.find(user => user.id === area.ownerId)?.username || 'Unknown', members: area.members.map(id => ({ id, username: data.users.find(user => user.id === id)?.username || 'Unknown' })), isOwner: area.ownerId === viewerId } }

function hasAccess(document, user) {
  return document && !document.deleting && (document.ownerId === user.id || document.sharedWith?.includes(user.id) || (document.areaId && canAccessArea(findArea(document.areaId), user)))
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

  if (route === '/api/areas' && request.method === 'GET') {
    const areas = data.areas.filter(area => canAccessArea(area, user)).map(area => publicArea(area, user.id))
    const invitations = data.areas.filter(area => area.invitations.includes(user.id)).map(area => ({ id: area.id, name: area.name, ownerUsername: data.users.find(entry => entry.id === area.ownerId)?.username || 'Unknown' }))
    return sendJson(response, 200, { areas, invitations })
  }
  if (route === '/api/areas' && request.method === 'POST') {
    const body = await readJson(request)
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    if (!name) return sendJson(response, 400, { error: 'Enter an area name.' })
    const area = { id: crypto.randomUUID(), name, ownerId: user.id, members: [user.id], invitations: [] }
    data.areas.push(area); persistData()
    return sendJson(response, 201, { area: publicArea(area, user.id) })
  }
  const areaRoute = route.match(/^\/api\/areas\/([a-zA-Z0-9_-]{1,100})(?:\/(invite|members|leave|accept))?$/)
  if (areaRoute) {
    const [, id, action] = areaRoute
    const area = findArea(id)
    if (!area) return sendJson(response, 404, { error: 'Area not found.' })
    if (action === 'accept' && request.method === 'POST') {
      if (!area.invitations.includes(user.id)) return sendJson(response, 403, { error: 'No invitation to this area.' })
      area.invitations = area.invitations.filter(memberId => memberId !== user.id)
      if (!area.members.includes(user.id)) area.members.push(user.id)
      persistData(); return sendJson(response, 200, { area: publicArea(area, user.id) })
    }
    if (action === 'invite' && request.method === 'POST') {
      if (area.ownerId !== user.id) return sendJson(response, 403, { error: 'Only the area owner can invite members.' })
      const body = await readJson(request); const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
      const recipient = data.users.find(entry => entry.username === username)
      if (!recipient) return sendJson(response, 404, { error: 'No account has that username.' })
      if (recipient.id === user.id || area.members.includes(recipient.id)) return sendJson(response, 400, { error: 'That account is already an area member.' })
      if (!area.invitations.includes(recipient.id)) area.invitations.push(recipient.id)
      persistData(); return sendJson(response, 200, { ok: true })
    }
    if (action === 'members' && request.method === 'DELETE') {
      if (area.ownerId !== user.id) return sendJson(response, 403, { error: 'Only the area owner can remove members.' })
      const body = await readJson(request); const memberId = typeof body.userId === 'string' ? body.userId : ''
      if (memberId === area.ownerId) return sendJson(response, 400, { error: 'Area ownership cannot be transferred or removed.' })
      area.members = area.members.filter(entry => entry !== memberId); area.invitations = area.invitations.filter(entry => entry !== memberId)
      disconnectUser(memberId)
      persistData(); return sendJson(response, 200, { ok: true })
    }
    if (action === 'leave' && request.method === 'DELETE') {
      if (!canAccessArea(area, user)) return sendJson(response, 403, { error: 'You are not a member of this area.' })
      if (area.ownerId === user.id) return sendJson(response, 400, { error: 'The area owner cannot leave the area.' })
      area.members = area.members.filter(entry => entry !== user.id); persistData(); disconnectUser(user.id)
      return sendJson(response, 200, { ok: true })
    }
    if (!action && request.method === 'GET') return canAccessArea(area, user) ? sendJson(response, 200, { area: publicArea(area, user.id) }) : sendJson(response, 404, { error: 'Area not found.' })
  }

  if (request.method === 'POST' && route === '/api/documents') {
    const body = await readJson(request)
    const id = crypto.randomUUID()
    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : 'Untitled document'
    const areaId = typeof body.areaId === 'string' ? body.areaId : null
    if (areaId && !canAccessArea(findArea(areaId), user)) return sendJson(response, 403, { error: 'Join this area before creating a document in it.' })
    const document = { id, title, updatedAt: Date.now(), ownerId: user.id, sharedWith: [], areaId }
    data.documents.push(document)
    persistData()
    return sendJson(response, 201, { document: { ...document, access: 'owner', ownerUsername: user.username, sharedWithCount: 0, areaName: areaId ? findArea(areaId).name : null, areaOwnerId: areaId ? findArea(areaId).ownerId : null } })
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

  const versionRoute = route.match(/^\/api\/documents\/([a-zA-Z0-9_-]{1,100})\/versions(?:\/([a-zA-Z0-9_-]{1,100})(?:\/(restore|branch))?)?$/)
  if (versionRoute) {
    const [, id, versionId, action] = versionRoute
    const document = findDocument(id)
    if (!hasAccess(document, user)) return sendJson(response, 404, { error: 'Document not found.' })
    const { room, history } = await historyRoom(id)
    if (!hasAccess(document, user)) return sendJson(response, 404, { error: 'Document not found.' })
    if (!versionId && request.method === 'GET') {
      return sendJson(response, 200, { versions: [...document.versions].reverse().map(publicVersion) })
    }
    if (!versionId && request.method === 'POST') {
      const body = await readJson(request)
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : null
      const version = history.capture(name || null, name ? 'named' : 'automatic', user.id)
      return sendJson(response, 200, { version: publicVersion(version) })
    }
    if (versionId === 'current' && !action && request.method === 'GET') {
      return sendJson(response, 200, { content: versionContent(room, document.title) })
    }
    const version = document.versions.find(entry => entry.id === versionId)
    if (!version) return sendJson(response, 404, { error: 'Version not found.' })
    if (!action && request.method === 'GET') {
      const snapshot = decodeVersion(version)
      try { return sendJson(response, 200, { content: versionContent(snapshot, version.title) }) }
      finally { snapshot.destroy() }
    }
    if (!action && request.method === 'PATCH') {
      const body = await readJson(request)
      if (typeof body.name !== 'string' || !body.name.trim()) return sendJson(response, 400, { error: 'Enter a version name.' })
      version.name = body.name.trim().slice(0, 200)
      persistData()
      return sendJson(response, 200, { version: publicVersion(version) })
    }
    if (action === 'restore' && request.method === 'POST') {
      history.capture(null, 'before-restore', user.id)
      const snapshot = decodeVersion(version)
      try { copyContent(snapshot, room) } finally { snapshot.destroy() }
      history.capture(null, 'restored', user.id)
      return sendJson(response, 200, { ok: true })
    }
    if (action === 'branch' && request.method === 'POST') {
      const body = await readJson(request)
      const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : version.title
      const snapshot = decodeVersion(version)
      const branchId = crypto.randomUUID()
      snapshot.getMap('metadata').set('title', title)
      try {
        const persistence = getPersistence()
        if (persistence?.provider) await persistence.provider.storeUpdate(branchId, Y.encodeStateAsUpdate(snapshot))
        else copyContent(snapshot, getYDoc(branchId))
      } finally { snapshot.destroy() }
      // A branch is a new personal document; access and area membership are not copied.
      const branch = { id: branchId, title, updatedAt: Date.now(), ownerId: user.id, sharedWith: [], areaId: null, branchedFrom: { documentId: id, versionId } }
      data.documents.push(branch)
      persistData()
      return sendJson(response, 201, { document: ownedOrSharedDocuments(user).find(entry => entry.id === branchId) })
    }
  }

  const documentRoute = route.match(/^\/api\/documents\/([a-zA-Z0-9_-]{1,100})(?:\/(share|leave|area))?$/)
  if (documentRoute) {
    const [, id, action] = documentRoute
    const document = findDocument(id)
    if (!document || !hasAccess(document, user)) return sendJson(response, 404, { error: 'Document not found.' })

    if (action === 'area' && request.method === 'PATCH') {
      if (document.ownerId !== user.id) return sendJson(response, 403, { error: 'Only the document owner can move it into an area.' })
      const body = await readJson(request)
      const areaId = typeof body.areaId === 'string' && body.areaId ? body.areaId : null
      if (areaId && !canAccessArea(findArea(areaId), user)) return sendJson(response, 403, { error: 'Join this area before moving a document into it.' })
      document.areaId = areaId; document.updatedAt = Date.now(); persistData()
      return sendJson(response, 200, { ok: true })
    }

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
      const deletionOwnerId = document.areaId ? findArea(document.areaId)?.ownerId : document.ownerId
      if (deletionOwnerId !== user.id) return sendJson(response, 403, { error: 'Only the document or area owner can permanently delete this document.' })
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
websocketServer.on('connection', async (connection, request, documentId, userId) => {
  connection.merhavUserId = userId
  try {
    const { history } = await historyRoom(documentId)
    if (connection.readyState !== WebSocket.OPEN || currentUser(request)?.id !== userId || !hasAccess(findDocument(documentId), data.users.find(user => user.id === userId))) return connection.close(4001, 'Access changed')
    setupWSConnection(connection, request, { docName: documentId })
    connection.on('close', () => {
      if (!findDocument(documentId)?.deleting) history.capture()
    })
  } catch (error) {
    console.error(error)
    connection.close(1011, 'Could not load document')
  }
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
  // Load persistence and attach history before accepting client sync messages.
  historyRoom(documentId).then(() => {
    if (currentUser(request)?.id !== user.id || !hasAccess(findDocument(documentId), user)) return socket.destroy()
    websocketServer.handleUpgrade(request, socket, head, connection => {
      websocketServer.emit('connection', connection, request, documentId, user.id)
    })
  }).catch(error => { console.error(error); socket.destroy() })
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
  server.listen(port, host, () => console.log(`Merhav server listening at http://${host}:${server.address().port}`))
}).catch(error => {
  console.error('Could not finish interrupted document deletion.', error)
  process.exitCode = 1
})
