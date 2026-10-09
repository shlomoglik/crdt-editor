const crypto = require('node:crypto')
const Y = require('yjs')

// Copy visible content into fresh CRDT types. Applying an old Yjs update to the
// live room would merge it, rather than replace edits made since that version.
function copyContent(source, target, fallbackTitle = '') {
  target.transact(() => {
    const metadata = target.getMap('metadata')
    metadata.set('title', source.getMap('metadata').get('title') ?? fallbackTitle)
    const rich = target.getXmlFragment('richContent')
    rich.delete(0, rich.length)
    rich.insert(0, source.getXmlFragment('richContent').toArray().map(node => node.clone()))
    const board = target.getArray('board')
    board.delete(0, board.length)
    board.insert(0, JSON.parse(JSON.stringify(source.getArray('board').toArray())))
    const legacy = target.getText('content')
    legacy.delete(0, legacy.length)
    legacy.insert(0, source.getText('content').toString())
  }, 'version-history')
}

function richNode(node) {
  return node instanceof Y.XmlText
    ? { text: node.toDelta() }
    : { node: node.nodeName, attributes: node.getAttributes(), children: node.toArray().map(richNode) }
}

function versionContent(room, fallbackTitle = '') {
  const plainText = node => {
    if (node instanceof Y.XmlText) return node.toDelta().map(part => typeof part.insert === 'string' ? part.insert : '').join('')
    if (node.nodeName === 'hardBreak') return '\n'
    const separator = ['paragraph', 'heading'].includes(node.nodeName) ? '' : '\n'
    return node.toArray().map(plainText).join(separator)
  }
  const rich = room.getXmlFragment('richContent').toArray()
  return {
    title: room.getMap('metadata').get('title') ?? fallbackTitle,
    text: rich.length ? rich.map(plainText).join('\n\n') : room.getText('content').toString(),
    structure: JSON.stringify(rich.map(richNode), null, 2),
    board: room.getArray('board').toArray(),
  }
}

function contentHash(room, fallbackTitle) {
  return crypto.createHash('sha256').update(JSON.stringify([
    room.getMap('metadata').get('title') ?? fallbackTitle,
    room.getXmlFragment('richContent').toArray().map(richNode),
    room.getArray('board').toArray(),
    room.getText('content').toString(),
  ])).digest('hex')
}

function publicVersion({ state, hash, ...version }) { return version }

function createHistory(document, room, persist, idleMs = 20_000) {
  document.versions ??= []
  let timer
  let authorId = null
  const capture = (name = null, reason = 'automatic', userId = authorId) => {
    clearTimeout(timer)
    const hash = contentHash(room, document.title)
    const previous = document.versions.at(-1)
    if (previous?.hash === hash && !name) return previous
    const snapshot = new Y.Doc()
    copyContent(room, snapshot, document.title)
    const version = {
      id: crypto.randomUUID(), createdAt: Date.now(), name,
      title: snapshot.getMap('metadata').get('title'), reason, authorId: userId, hash,
      state: Buffer.from(Y.encodeStateAsUpdate(snapshot)).toString('base64'),
    }
    snapshot.destroy()
    document.versions.push(version)
    document.title = version.title
    document.updatedAt = version.createdAt
    persist()
    return version
  }
  capture(null, 'initial')
  const onUpdate = (_update, origin) => {
    if (origin === 'version-history') return
    if (contentHash(room, document.title) === document.versions.at(-1)?.hash) return
    authorId = origin?.merhavUserId ?? null
    clearTimeout(timer)
    timer = setTimeout(() => capture(), idleMs)
    timer.unref?.()
  }
  room.on('update', onUpdate)
  room.on('destroy', () => {
    if (!document.deleting) capture()
    clearTimeout(timer)
    room.off('update', onUpdate)
  })
  return { capture }
}

function decodeVersion(version) {
  const snapshot = new Y.Doc()
  Y.applyUpdate(snapshot, Buffer.from(version.state, 'base64'))
  return snapshot
}

module.exports = { copyContent, createHistory, decodeVersion, publicVersion, versionContent }
