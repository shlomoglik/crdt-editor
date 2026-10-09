const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const Y = require('yjs')
const WebSocket = require('ws')
const { WebsocketProvider } = require('y-websocket')

test('authenticated history APIs, collaborative restore, branching and restart persistence', { timeout: 30_000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'merhav-history-test-'))
  let server
  let base
  const providers = []
  async function start() {
    server = spawn(process.execPath, ['server.cjs'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0', YPERSISTENCE: directory },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    server.stderr.on('data', chunk => { stderr += chunk })
    await new Promise((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => reject(new Error(`Server did not start: ${stderr}`)), 5000)
      server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${stderr}`)) })
      server.stdout.on('data', chunk => {
        output += chunk
        const match = output.match(/Merhav server listening at (http:\/\/[^\s]+)/)
        if (match) { base = match[1]; clearTimeout(timeout); resolve() }
      })
    })
  }
  async function stop() {
    if (server?.exitCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve))
      server.kill('SIGTERM')
      await exited
    }
  }
  t.after(async () => {
    for (const provider of providers) { provider.destroy(); provider.doc.destroy() }
    await stop()
    await fs.rm(directory, { recursive: true, force: true })
  })
  await start()
  async function request(route, method = 'GET', body, cookie = '') {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const password = 'test-password-123'
  const alice = await request('/api/register', 'POST', { username: 'alice', password })
  const bob = await request('/api/register', 'POST', { username: 'bobby', password })
  const outsider = await request('/api/register', 'POST', { username: 'outsider', password })
  const created = await request('/api/documents', 'POST', { title: 'Source' }, alice.cookie)
  assert.equal(created.status, 201)
  const id = created.body.document.id
  const route = `/api/documents/${id}/versions`
  assert.equal((await request(route)).status, 401)
  assert.equal((await request(route, 'GET', undefined, outsider.cookie)).status, 404)
  await request(`/api/documents/${id}/share`, 'POST', { username: 'bobby' }, alice.cookie)
  async function connect(id, cookie) {
    class AuthWebSocket extends WebSocket {
      constructor(url, protocols) { super(url, protocols, { headers: { Cookie: cookie } }) }
    }
    const doc = new Y.Doc()
    const provider = new WebsocketProvider(base.replace('http:', 'ws:') + '/yjs', id, doc, { WebSocketPolyfill: AuthWebSocket, disableBc: true, connect: false })
    providers.push(provider)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket sync timed out')), 5000)
      provider.on('sync', synced => { if (synced) { clearTimeout(timeout); resolve() } })
      provider.connect()
    })
    return doc
  }
  async function until(predicate) {
    const deadline = Date.now() + 4000
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Collaborative update timed out')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  const doc = await connect(id, alice.cookie)
  const peer = await connect(id, bob.cookie)
  doc.transact(() => {
    doc.getMap('metadata').set('title', 'Original title')
    const paragraph = new Y.XmlElement('paragraph')
    const text = new Y.XmlText()
    text.insert(0, 'Original content', { bold: {} })
    paragraph.insert(0, [text])
    doc.getXmlFragment('richContent').insert(0, [paragraph])
    doc.getArray('board').push([{ color: '#123456', points: [{ x: .5, y: .3 }] }])
  })
  await until(() => peer.getMap('metadata').get('title') === 'Original title')
  const named = await request(route, 'POST', { name: 'Milestone' }, alice.cookie)
  assert.equal(named.status, 200)
  assert.equal(named.body.version.state, undefined)
  const versionId = named.body.version.id
  const savedContent = await request(`${route}/${versionId}`, 'GET', undefined, alice.cookie)
  assert.equal(savedContent.status, 200)
  assert.equal(savedContent.body.content.text, 'Original content')
  assert.equal(savedContent.body.content.title, 'Original title')
  assert.match(savedContent.body.content.structure, /bold/)
  assert.equal(savedContent.body.content.board.length, 1)
  assert.equal((await request(`${route}/missing-version`, 'GET', undefined, alice.cookie)).status, 404)
  doc.transact(() => {
    doc.getMap('metadata').set('title', 'New title')
    doc.getXmlFragment('richContent').get(0).get(0).insert(0, 'Changed ')
    doc.getArray('board').delete(0, 1)
  })
  await until(() => peer.getMap('metadata').get('title') === 'New title')
  const countBeforeRead = (await request(route, 'GET', undefined, alice.cookie)).body.versions.length
  const currentContent = await request(`${route}/current`, 'GET', undefined, alice.cookie)
  assert.equal(currentContent.status, 200)
  assert.equal(currentContent.body.content.title, 'New title')
  assert.equal(currentContent.body.content.text, 'Changed Original content')
  assert.equal(currentContent.body.content.board.length, 0)
  assert.equal((await request(route, 'GET', undefined, alice.cookie)).body.versions.length, countBeforeRead)
  assert.equal((await request(`${route}/${versionId}`, 'GET', undefined, outsider.cookie)).status, 404)
  assert.equal((await request(`${route}/current`, 'GET', undefined, outsider.cookie)).status, 404)
  assert.equal((await request(`${route}/${versionId}/restore`, 'POST', {}, bob.cookie)).status, 200)
  await until(() => doc.getMap('metadata').get('title') === 'Original title')
  assert.match(peer.getXmlFragment('richContent').toString(), /Original content/)
  assert.doesNotMatch(peer.getXmlFragment('richContent').toString(), /Changed/)
  assert.equal(peer.getArray('board').length, 1)
  let history = (await request(route, 'GET', undefined, alice.cookie)).body.versions
  assert.ok(history.some(version => version.reason === 'before-restore' && version.title === 'New title'))
  const branch = await request(`${route}/${versionId}/branch`, 'POST', { title: 'My copy' }, bob.cookie)
  assert.equal(branch.status, 201)
  assert.notEqual(branch.body.document.id, id)
  assert.equal(branch.body.document.ownerId, bob.body.user.id)
  assert.equal(branch.body.document.areaId, null)
  assert.equal(branch.body.document.sharedWithCount, 0)
  const branchDoc = await connect(branch.body.document.id, bob.cookie)
  assert.equal(branchDoc.getMap('metadata').get('title'), 'My copy')
  assert.equal(branchDoc.getXmlFragment('richContent').toString(), doc.getXmlFragment('richContent').toString())
  assert.deepEqual(branchDoc.getArray('board').toArray(), doc.getArray('board').toArray())
  assert.equal((await request(`${route}/${versionId}`, 'PATCH', { name: 'Renamed milestone' }, bob.cookie)).status, 200)
  await request(`/api/documents/${id}/leave`, 'DELETE', undefined, bob.cookie)
  assert.equal((await request(`${route}/${versionId}`, 'GET', undefined, bob.cookie)).status, 404)
  assert.equal((await request(`${route}/current`, 'GET', undefined, bob.cookie)).status, 404)
  assert.equal((await request(`${route}/${versionId}/restore`, 'POST', {}, bob.cookie)).status, 404)
  for (const provider of providers) { provider.destroy(); provider.doc.destroy() }
  providers.length = 0
  await stop()
  await start()
  const login = await request('/api/login', 'POST', { username: 'alice', password })
  history = (await request(route, 'GET', undefined, login.cookie)).body.versions
  assert.equal(history.find(version => version.id === versionId).name, 'Renamed milestone')
  const persistedDoc = await connect(id, login.cookie)
  assert.match(persistedDoc.getXmlFragment('richContent').toString(), /Original content/)
  assert.equal((await request(`/api/documents/${id}`, 'DELETE', undefined, login.cookie)).status, 200)
  assert.equal((await request(route, 'GET', undefined, login.cookie)).status, 404)
  const data = JSON.parse(await fs.readFile(path.join(directory, 'merhav.json'), 'utf8'))
  assert.ok(!data.documents.some(document => document.id === id))
})
