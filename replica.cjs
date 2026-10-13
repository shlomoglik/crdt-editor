// Replicas own live rooms and client fanout; only the coordinator owns durable data.
delete process.env.YPERSISTENCE
const http = require('node:http')
const https = require('node:https')
const WebSocket = require('ws')
const { WebsocketProvider } = require('y-websocket')
const { setupWSConnection, getYDoc, docs } = require('y-websocket/bin/utils')
const { withAuthor, decoding } = require('./cluster.cjs')

const coordinator = new URL(process.env.COORDINATOR_URL || 'http://127.0.0.1:1234')
const secret = process.env.CLUSTER_SECRET
if (!secret) throw new Error('CLUSTER_SECRET is required for replicas.')
const transport = coordinator.protocol === 'https:' ? https : http
const wsBase = coordinator.href.replace(/^http/, 'ws').replace(/\/$/, '')
const rooms = new Map()
let controlReady = false
let control

async function authorize(request, id) {
  const response = await fetch(new URL(`/internal/access/${id}`, coordinator), {
    headers: { Cookie: request.headers.cookie || '', 'x-merhav-cluster-key': secret },
    signal: AbortSignal.timeout(3000),
  })
  return response.ok ? response.json() : null
}
function discard(id) {
  const entry = rooms.get(id)
  if (!entry) return
  rooms.delete(id)
  for (const connection of entry.room.conns.keys()) connection.close(4001, 'Access changed or coordinator unavailable')
  entry.provider.destroy()
  docs.delete(id)
  entry.room.destroy()
}
async function refresh() {
  for (const [id, { room }] of rooms) {
    for (const connection of room.conns.keys()) {
      try {
        const access = await authorize(connection.merhavRequest, id)
        if (!access || access.userId !== connection.merhavUserId) connection.close(4001, 'Access changed')
      } catch { connection.close(1013, 'Coordinator unavailable') }
    }
  }
}
function connectControl() {
  control = new WebSocket(`${wsBase}/internal/events`, { headers: { 'x-merhav-cluster-key': secret } })
  control.on('open', () => { controlReady = true })
  let lastHeartbeat = Date.now()
  control.on('ping', () => { lastHeartbeat = Date.now() })
  const watchdog = setInterval(() => {
    if (Date.now() - lastHeartbeat > 30_000) control.terminate()
  }, 10_000)
  control.on('message', message => {
    const event = JSON.parse(message.toString())
    if (event.type === 'delete') discard(event.id)
    else if (event.type === 'disconnect') {
      for (const [id, { room }] of rooms) {
        if (event.documentId && id !== event.documentId) continue
        for (const connection of room.conns.keys()) {
          if (connection.merhavUserId === event.userId) connection.close(4001, 'Access changed')
        }
      }
    } else refresh().catch(console.error)
  })
  control.on('error', () => {})
  control.on('close', () => {
    clearInterval(watchdog)
    controlReady = false
    for (const id of rooms.keys()) discard(id)
    setTimeout(connectControl, 500)
  })
}
function roomFor(id) {
  if (rooms.has(id)) return rooms.get(id)
  const room = getYDoc(id)
  let authorId = null
  // Registered before the provider so outgoing update envelopes retain authorship.
  room.on('update', (_update, origin) => { authorId = origin?.merhavUserId || null })
  class ClusterWebSocket extends WebSocket {
    constructor(url) { super(url, { headers: { 'x-merhav-cluster-key': secret } }) }
    send(message, ...args) {
      const decoder = decoding.createDecoder(new Uint8Array(message))
      if (decoding.readVarUint(decoder) === 0 && decoding.readVarUint(decoder) === 2) {
        message = withAuthor(message, authorId)
      }
      return super.send(message, ...args)
    }
  }
  const provider = new WebsocketProvider(`${wsBase}/internal/yjs`, id, room, {
    WebSocketPolyfill: ClusterWebSocket, awareness: room.awareness,
    disableBc: true, connect: false, resyncInterval: 10_000,
  })
  const entry = { room, provider }
  rooms.set(id, entry)
  provider.on('connection-close', () => {
    // Discard stale state and force fresh authorization and persistence loading.
    if (rooms.get(id) === entry) discard(id)
  })
  provider.connect()
  return entry
}
function synced(provider) {
  if (provider.synced) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Coordinator sync timed out')), 3000)
    const onSync = value => { if (value) finish() }
    const onClose = () => finish(new Error('Coordinator disconnected'))
    function finish(error) {
      clearTimeout(timer)
      provider.off('sync', onSync)
      provider.off('connection-close', onClose)
      error ? reject(error) : resolve()
    }
    provider.on('sync', onSync)
    provider.on('connection-close', onClose)
  })
}
const server = http.createServer((request, response) => {
  if (request.url?.startsWith('/internal/')) {
    response.writeHead(404)
    return response.end('Not found')
  }
  if (!request.url?.startsWith('/api/')) {
    response.writeHead(controlReady ? 200 : 503)
    return response.end(controlReady ? 'okay' : 'Coordinator unavailable')
  }
  const upstream = transport.request(new URL(request.url, coordinator), {
    method: request.method,
    headers: { ...request.headers, host: coordinator.host, 'x-forwarded-host': request.headers['x-forwarded-host'] || request.headers.host },
    timeout: 5000,
  }, result => {
    response.writeHead(result.statusCode, result.headers)
    result.pipe(response)
  })
  upstream.on('timeout', () => upstream.destroy(new Error('Coordinator timed out')))
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'Coordinator unavailable. Please reconnect.' }))
  })
  request.pipe(upstream)
})
const websocketServer = new WebSocket.Server({ noServer: true })
server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost')
  const id = url.pathname.slice('/yjs/'.length)
  const origin = request.headers.origin
  let entry
  try {
    if (!controlReady || !url.pathname.startsWith('/yjs/') || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
      (origin && new URL(origin).host !== (request.headers['x-forwarded-host'] || request.headers.host))) throw new Error('Forbidden')
    const access = await authorize(request, id)
    if (!access) throw new Error('Forbidden')
    entry = roomFor(id)
    await synced(entry.provider)
    const latest = await authorize(request, id)
    if (!controlReady || rooms.get(id) !== entry || latest?.userId !== access.userId) throw new Error('Forbidden')
    websocketServer.handleUpgrade(request, socket, head, connection => {
      connection.merhavUserId = access.userId
      connection.merhavRequest = request
      setupWSConnection(connection, request, { docName: id })
      connection.on('close', () => {
        // The last upstream disconnect also triggers the coordinator's history capture.
        if (entry.room.conns.size === 0) discard(id)
        else fetch(new URL(`/internal/capture/${id}`, coordinator), {
          method: 'POST', headers: { 'x-merhav-cluster-key': secret }, signal: AbortSignal.timeout(3000),
        }).then(response => response.body?.cancel()).catch(() => {})
      })
    })
  } catch {
    if (entry && entry.room.conns.size === 0 && rooms.get(id) === entry) discard(id)
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
  }
})
// Revalidate periodically as a fallback to live permission invalidations.
setInterval(() => refresh().catch(console.error), 10_000).unref()
connectControl()
server.listen(Number(process.env.PORT || 1235), process.env.HOST || 'localhost', () => {
  console.log(`Merhav replica listening at http://${process.env.HOST || 'localhost'}:${server.address().port}`)
})
