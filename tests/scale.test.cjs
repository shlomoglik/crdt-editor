const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const Y = require('yjs')
const WebSocket = require('ws')
const { WebsocketProvider } = require('y-websocket')

async function until(predicate, message = 'Condition timed out') {
  const deadline = Date.now() + 8000
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error(message)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

test('two replicas synchronize content, awareness, access, history and recover after restarts', { timeout: 60_000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'merhav-scale-'))
  const processes = []
  const providers = []
  const secret = 'integration-cluster-secret'
  async function start(file, extra = {}) {
    const child = spawn(process.execPath, [file], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0', YPERSISTENCE: directory, CLUSTER_SECRET: secret, ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    processes.push(child)
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk })
    const base = await new Promise((resolve, reject) => {
      let output = ''
      const timer = setTimeout(() => reject(new Error(stderr || 'Startup timed out')), 8000)
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Exited ${code}: ${stderr}`)) })
      child.stdout.on('data', chunk => {
        output += chunk
        const match = output.match(/listening at (http:\/\/[^\s]+)/)
        if (match) { clearTimeout(timer); resolve(match[1]) }
      })
    })
    await until(async () => { try { return (await fetch(base)).ok } catch { return false } })
    return { child, base, port: new URL(base).port }
  }
  async function stop(entry) {
    if (entry.child.exitCode !== null || entry.child.signalCode !== null) return
    const exited = new Promise(resolve => entry.child.once('exit', resolve))
    entry.child.kill('SIGTERM')
    await exited
  }
  t.after(async () => {
    for (const provider of providers) { provider.destroy(); provider.doc.destroy() }
    for (const child of processes) await stop({ child })
    await fs.rm(directory, { recursive: true, force: true })
  })
  let hub = await start('server.cjs')
  let first = await start('replica.cjs', { COORDINATOR_URL: hub.base })
  const second = await start('replica.cjs', { COORDINATOR_URL: hub.base })
  async function api(entry, route, method = 'GET', body, cookie = '') {
    const response = await fetch(entry.base + route, {
      method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  async function connect(entry, id, cookie) {
    class AuthWebSocket extends WebSocket {
      constructor(url, protocols) { super(url, protocols, { headers: { Cookie: cookie } }) }
    }
    const doc = new Y.Doc()
    const provider = new WebsocketProvider(entry.base.replace('http:', 'ws:') + '/yjs', id, doc, {
      WebSocketPolyfill: AuthWebSocket, disableBc: true,
    })
    providers.push(provider)
    await until(() => provider.synced, 'Client sync timed out')
    return provider
  }
  const password = 'test-password-123'
  const alice = await api(first, '/api/register', 'POST', { username: 'alice', password })
  const bob = await api(second, '/api/register', 'POST', { username: 'bobby', password })
  const outsider = await api(second, '/api/register', 'POST', { username: 'outsider', password })
  assert.equal((await api(second, '/api/session', 'GET', undefined, alice.cookie)).body.user.id, alice.body.user.id)
  const created = await api(first, '/api/documents', 'POST', { title: 'Shared' }, alice.cookie)
  assert.equal(created.status, 201)
  const id = created.body.document.id
  const route = `/api/documents/${id}`
  assert.equal((await api(second, `${route}/versions`, 'GET', undefined, outsider.cookie)).status, 404)
  assert.equal((await fetch(`${hub.base}/internal/access/${id}`)).status, 403)
  assert.equal((await fetch(`${first.base}/internal/access/${id}`)).status, 404)
  async function denied(entry, cookie, extraHeaders = {}, endpoint = `/yjs/${id}`) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(entry.base.replace('http:', 'ws:') + endpoint, { headers: { Cookie: cookie, ...extraHeaders } })
      const timer = setTimeout(() => { socket.terminate(); reject(new Error('Authorization check timed out')) }, 3000)
      socket.on('open', () => { clearTimeout(timer); socket.close(); reject(new Error('Unauthorized socket accepted')) })
      socket.on('error', () => { clearTimeout(timer); resolve() })
    })
  }
  await denied(second, outsider.cookie)
  await denied(second, '')
  await denied(second, alice.cookie, { Origin: 'https://untrusted.example' })
  await denied(hub, alice.cookie, {}, `/internal/yjs/${id}`)
  await denied(hub, alice.cookie, { 'x-merhav-cluster-key': 'incorrect' }, '/internal/events')
  await api(first, `${route}/share`, 'POST', { username: 'bobby' }, alice.cookie)
  const a = await connect(first, id, alice.cookie)
  const b = await connect(second, id, bob.cookie)
  // Concurrent inserts must merge, and not duplicate despite bridge rebroadcasts.
  a.doc.getText('content').insert(0, 'Alice ')
  b.doc.getText('content').insert(0, 'Bob ')
  await until(() => a.doc.getText('content').toString() === b.doc.getText('content').toString() && a.doc.getText('content').length === 10)
  a.doc.getMap('metadata').set('title', 'Updated title')
  const paragraph = new Y.XmlElement('paragraph')
  const richText = new Y.XmlText()
  richText.insert(0, 'Formatted', { bold: {} })
  paragraph.insert(0, [richText])
  a.doc.getXmlFragment('richContent').insert(0, [paragraph])
  a.doc.getArray('board').push([{ color: '#123456', points: [{ x: .1, y: .2 }] }])
  await until(() => b.doc.getArray('board').length === 1)
  assert.equal(b.doc.getXmlFragment('richContent').toString(), a.doc.getXmlFragment('richContent').toString())
  a.awareness.setLocalState({ user: { name: 'Alice' }, cursor: { anchor: 1, head: 2 } })
  b.awareness.setLocalState({ user: { name: 'Bob' }, cursor: { anchor: 3, head: 4 } })
  await until(() => b.awareness.getStates().get(a.doc.clientID)?.cursor.head === 2 && a.awareness.getStates().get(b.doc.clientID)?.user.name === 'Bob')
  const localPeer = await connect(first, id, alice.cookie)
  localPeer.awareness.setLocalState({ user: { name: 'Alice second tab' } })
  await until(() => b.awareness.getStates().has(localPeer.doc.clientID))
  localPeer.disconnect()
  await until(() => !b.awareness.getStates().has(localPeer.doc.clientID))
  assert.ok(b.awareness.getStates().has(a.doc.clientID))
  const named = await api(second, `${route}/versions`, 'POST', { name: 'Milestone' }, bob.cookie)
  assert.equal(named.status, 200)
  const versionId = named.body.version.id
  a.doc.getMap('metadata').set('title', 'Later')
  await until(() => b.doc.getMap('metadata').get('title') === 'Later')
  await api(second, `${route}/versions/${versionId}/restore`, 'POST', {}, bob.cookie)
  await until(() => a.doc.getMap('metadata').get('title') === 'Updated title' && b.doc.getMap('metadata').get('title') === 'Updated title')
  b.disconnect()
  await until(() => !a.awareness.getStates().has(b.doc.clientID), 'Presence did not clear')
  b.doc.getText('content').insert(0, 'Offline ')
  b.connect()
  await until(() => b.synced && a.doc.getText('content').toString().includes('Offline'))
  // Worker restart: its clients reconnect, retain their document and resynchronize.
  await stop(first)
  const captured = await api(second, `${route}/versions`, 'GET', undefined, alice.cookie)
  assert.equal(captured.body.versions[0].authorId, bob.body.user.id)
  first = await start('replica.cjs', { COORDINATOR_URL: hub.base, PORT: first.port })
  await until(() => a.synced)
  a.doc.getText('content').insert(0, 'Restarted ')
  await until(() => b.doc.getText('content').toString().includes('Restarted'))
  // Coordinator restart reuses cookies and the sole persistent database.
  const expected = b.doc.getText('content').toString()
  await api(second, `${route}/versions`, 'POST', { name: 'Before restart' }, bob.cookie)
  await stop(hub)
  await until(() => !a.wsconnected && !b.wsconnected)
  assert.equal((await api(second, '/api/session', 'GET', undefined, alice.cookie)).status, 503)
  hub = await start('server.cjs', { PORT: hub.port })
  await until(() => a.synced && b.synced)
  assert.equal((await api(first, '/api/session', 'GET', undefined, alice.cookie)).body.user.id, alice.body.user.id)
  const fresh = await connect(second, id, alice.cookie)
  assert.equal(fresh.doc.getText('content').toString(), expected)
  assert.equal(fresh.doc.getArray('board').length, 1)
  const history = await api(first, `${route}/versions`, 'GET', undefined, alice.cookie)
  assert.ok(history.body.versions.some(version => version.id === versionId))
  // Revocation issued through one replica closes clients on the other.
  let revoked = false
  b.on('connection-close', event => { if (event?.code === 4001) revoked = true })
  assert.equal((await api(first, `${route}/leave`, 'DELETE', undefined, bob.cookie)).status, 200)
  await until(() => revoked, 'Remote revocation did not close the socket')
  b.disconnect()
  assert.equal((await api(second, `${route}/versions`, 'GET', undefined, bob.cookie)).status, 404)
  let loggedOut = false
  fresh.on('connection-close', event => { if (event?.code === 4001) loggedOut = true })
  await api(first, '/api/logout', 'POST', {}, alice.cookie)
  await until(() => loggedOut, 'Remote logout did not close the socket')
  a.disconnect(); fresh.disconnect()
  const login = await api(first, '/api/login', 'POST', { username: 'alice', password })
  const deletionPeer = await connect(second, id, login.cookie)
  let deleted = false
  deletionPeer.on('connection-close', event => { if (event?.code === 4001) deleted = true })
  assert.equal((await api(first, route, 'DELETE', undefined, login.cookie)).status, 200)
  await until(() => deleted, 'Remote deletion did not close the socket')
  deletionPeer.disconnect()
  assert.equal((await api(second, `${route}/versions`, 'GET', undefined, login.cookie)).status, 404)
  // Internal room state cannot resurrect a permanently deleted document.
  const disk = JSON.parse(await fs.readFile(path.join(directory, 'merhav.json'), 'utf8'))
  assert.ok(!disk.documents.some(document => document.id === id))
  await denied(second, login.cookie)
  // Reclaiming a deleted ID must start empty, without stale replica or disk state.
  assert.equal((await api(first, `${route}/claim`, 'POST', { title: 'New' }, login.cookie)).status, 201)
  const reclaimed = await connect(second, id, login.cookie)
  assert.equal(reclaimed.doc.getText('content').length, 0)
  assert.equal(reclaimed.doc.getXmlFragment('richContent').length, 0)
  assert.equal(reclaimed.doc.getArray('board').length, 0)
})
