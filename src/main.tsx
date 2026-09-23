import React from 'react'
import { createRoot } from 'react-dom/client'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ArrowDownToLine, Check, CircleHelp, FileText, Menu, MousePointer2, MoreVertical, Pencil, Plus, Share2, Sparkles, Trash2, Users, X } from 'lucide-react'
import { LanguageProvider, useLanguage, type Language } from './i18n'
import { createDocumentId, isDocumentId, readDocuments, writeDocuments, type DocumentRecord } from './documentStore'
import './style.css'

const RichTextEditor = React.lazy(async () => {
  const module = await import('./RichTextEditor')
  return { default: module.RichTextEditor }
})

type Person = { name: string; color: string }
type Stroke = { color: string; points: { x: number; y: number }[] }
const palette = ['#6757e8', '#12a889', '#eb8453', '#df5b8c', '#4387dc', '#cf9e2e']
const identity = (() => {
  const key = 'merhav-profile'
  const stored = localStorage.getItem(key)
  const saved = stored ? JSON.parse(stored) as { color: string; suffix?: string } : null
  const profile = {
    color: saved?.color ?? palette[Math.floor(Math.random() * palette.length)],
    suffix: saved?.suffix ?? Math.random().toString(36).slice(2, 5).toUpperCase(),
  }
  localStorage.setItem(key, JSON.stringify(profile))
  return profile
})()

function App() {
  return <LanguageProvider><Workspace /></LanguageProvider>
}

function Workspace() {
  const { language, direction, t, setLanguage } = useLanguage()
  const [documents, setDocuments] = React.useState<DocumentRecord[]>(readDocuments)
  const documentIndexRef = React.useRef(documents)
  const [docId, setDocId] = React.useState(() => {
    const requestedId = new URLSearchParams(location.search).get('doc')
    return isDocumentId(requestedId) ? requestedId : documents[0]?.id ?? createDocumentId()
  })
  const providerRef = React.useRef<WebsocketProvider | null>(null)
  const strokesRef = React.useRef<Y.Array<Stroke> | null>(null)
  const metadataRef = React.useRef<Y.Map<string> | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [editorSession, setEditorSession] = React.useState<{ id: string; document: Y.Doc; provider: WebsocketProvider } | null>(null)
  const [bodyText, setBodyText] = React.useState('')
  const [strokes, setStrokes] = React.useState<Stroke[]>([])
  const [people, setPeople] = React.useState<Person[]>([])
  const [connected, setConnected] = React.useState(false)
  const [synced, setSynced] = React.useState(false)
  const [view, setView] = React.useState<'text' | 'board'>('text')
  const [title, setTitle] = React.useState(t.untitled)
  const [editingTitle, setEditingTitle] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)
  const [drawingColor, setDrawingColor] = React.useState(palette[0])
  const drawing = React.useRef<{ color: string; points: { x: number; y: number }[] } | null>(null)
  const guestName = `${t.guestName} ${identity.suffix}`
  const languageLabels = React.useRef({ guestName, untitled: t.untitled })
  languageLabels.current = { guestName, untitled: t.untitled }

  React.useEffect(() => {
    if (!mobileSidebarOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileSidebarOpen])

  const saveDocumentRecord = React.useCallback((id: string, nextTitle: string) => {
    const current = documentIndexRef.current
    const existing = current.find(document => document.id === id)
    const record: DocumentRecord = { id, title: nextTitle, updatedAt: Date.now() }
    const next = existing
      ? current.map(document => document.id === id ? record : document)
      : [record, ...current]
    documentIndexRef.current = next
    writeDocuments(next)
    setDocuments(next)
  }, [])

  const updateDocumentUrl = React.useCallback((id: string, replace = false) => {
    const url = new URL(location.href)
    url.searchParams.set('doc', id)
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url)
  }, [])

  const openDocument = (id: string) => {
    if (id === docId) return
    updateDocumentUrl(id)
    setDocId(id)
  }

  const createDocument = () => {
    const id = createDocumentId()
    saveDocumentRecord(id, t.untitled)
    updateDocumentUrl(id)
    setDocId(id)
  }

  const deleteDocument = (id: string) => {
    const remaining = documentIndexRef.current.filter(document => document.id !== id)
    if (id === docId && remaining.length === 0) {
      remaining.push({ id: createDocumentId(), title: t.untitled, updatedAt: Date.now() })
    }
    documentIndexRef.current = remaining
    writeDocuments(remaining)
    setDocuments(remaining)
    if (id === docId) {
      const nextDocument = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      updateDocumentUrl(nextDocument.id, true)
      setDocId(nextDocument.id)
    }
  }

  React.useEffect(() => {
    updateDocumentUrl(docId, true)
    if (!documents.some(document => document.id === docId)) saveDocumentRecord(docId, t.untitled)
  }, [docId, documents, saveDocumentRecord, t.untitled, updateDocumentUrl])

  React.useEffect(() => {
    const onPopState = () => {
      const requestedId = new URLSearchParams(location.search).get('doc')
      if (isDocumentId(requestedId)) setDocId(requestedId)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'merhav-documents') {
        const next = readDocuments()
        documentIndexRef.current = next
        setDocuments(next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  React.useEffect(() => {
    setEditorSession(null)
    setBodyText('')
    setStrokes([])
    setPeople([])
    setConnected(false)
    setSynced(false)
    setTitle(languageLabels.current.untitled)
    const doc = new Y.Doc()
    const provider = new WebsocketProvider(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/yjs`, docId, doc, { connect: true })
    providerRef.current = provider
    setEditorSession({ id: docId, document: doc, provider })
    const board = doc.getArray<Stroke>('board')
    const metadata = doc.getMap<string>('metadata')
    strokesRef.current = board
    metadataRef.current = metadata
    const richContent = doc.getXmlFragment('richContent')
    if (!metadata.has('title')) metadata.set('title', languageLabels.current.untitled)
    provider.awareness.setLocalStateField('user', { name: guestName, color: identity.color } satisfies Person)

    const onBoard = () => {
      setStrokes(board.toArray())
      saveDocumentRecord(docId, metadata.get('title') ?? languageLabels.current.untitled)
    }
    const onRichContent = () => saveDocumentRecord(docId, metadata.get('title') ?? languageLabels.current.untitled)
    const onMetadata = () => {
      const nextTitle = metadata.get('title') ?? languageLabels.current.untitled
      setTitle(nextTitle)
      saveDocumentRecord(docId, nextTitle)
    }
    const onAwareness = () => setPeople(Array.from(provider.awareness.getStates().values()).map(state => state.user as Person | undefined).filter((user): user is Person => !!user))
    const onStatus = ({ status }: { status: string }) => setConnected(status === 'connected')
    let migrationTimer: number | undefined
    const onSync = (isSynced: boolean) => {
      if (!isSynced) {
        setSynced(false)
        return
      }
      window.clearTimeout(migrationTimer)
      migrationTimer = window.setTimeout(() => {
        const clients = [...provider.awareness.getStates().keys()].sort((a, b) => a - b)
        if (clients[0] === provider.awareness.clientID) migrateLegacyContent(doc)
        setSynced(true)
      }, 150)
    }

    board.observe(onBoard)
    richContent.observe(onRichContent)
    metadata.observe(onMetadata)
    provider.awareness.on('change', onAwareness)
    provider.on('status', onStatus)
    provider.on('sync', onSync)
    onBoard()
    onRichContent()
    onMetadata()
    onAwareness()

    return () => {
      board.unobserve(onBoard)
      richContent.unobserve(onRichContent)
      metadata.unobserve(onMetadata)
      provider.awareness.off('change', onAwareness)
      provider.off('status', onStatus)
      provider.off('sync', onSync)
      window.clearTimeout(migrationTimer)
      setEditorSession(current => current?.id === docId ? null : current)
      provider.destroy()
      doc.destroy()
    }
  }, [docId, saveDocumentRecord])

  React.useEffect(() => {
    const user = providerRef.current?.awareness.getLocalState()?.user as Person | undefined
    providerRef.current?.awareness.setLocalStateField('user', { ...user, name: guestName, color: identity.color } satisfies Person)
  }, [guestName])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(ratio, ratio)
      context.clearRect(0, 0, rect.width, rect.height)
      for (const stroke of strokes) {
        if (!stroke.points.length) continue
        context.beginPath()
        context.strokeStyle = stroke.color
        context.lineWidth = 3
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.moveTo(stroke.points[0].x * rect.width, stroke.points[0].y * rect.height)
        for (const point of stroke.points.slice(1)) context.lineTo(point.x * rect.width, point.y * rect.height)
        context.stroke()
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [strokes, view])

  const changeTitle = (next: string) => {
    setTitle(next)
    metadataRef.current?.set('title', next)
    saveDocumentRecord(docId, next)
  }
  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
  }
  const beginDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = { color: drawingColor, points: [pointAt(event)] }
  }
  const moveDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawing.current) drawing.current.points.push(pointAt(event))
  }
  const endDraw = () => {
    const stroke = drawing.current
    if (!stroke) return
    drawing.current = null
    strokesRef.current?.push([stroke])
  }
  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt(t.copyPrompt, location.href)
    }
  }
  const exportFile = () => {
    const blob = new Blob([bodyText], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${title || 'document'}.txt`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const chooseLanguage = (event: React.ChangeEvent<HTMLSelectElement>) => setLanguage(event.target.value as Language)
  const chars = bodyText.length
  const onTextChange = React.useCallback((nextText: string) => setBodyText(nextText), [])

  return <main className="app-shell" dir={direction}>
    <header className="topbar">
      <a className="brand" href="#" aria-label={t.brand}><span className="brand-mark"><Sparkles size={18} /></span><span>{t.brand}</span></a>
      <div className="breadcrumb"><span>{t.breadcrumb}</span><span className="slash">/</span>{editingTitle ? <input autoFocus value={title} onChange={event => changeTitle(event.target.value)} onBlur={() => setEditingTitle(false)} onKeyDown={event => event.key === 'Enter' && setEditingTitle(false)} /> : <button className="title-button" onClick={() => setEditingTitle(true)}>{title}<span className="edit-dot" /></button>}</div>
      <div className="top-actions">
        <label className="language-picker"><span className="sr-only">{t.selectLanguage}</span><select value={language} onChange={chooseLanguage} aria-label={t.selectLanguage}><option value="en">{t.english}</option><option value="he">{t.hebrew}</option></select></label>
        <span className={`save-status ${connected ? 'online' : ''}`}><i />{connected ? synced ? t.saved : t.connecting : t.disconnected}</span>
        <button className="icon-btn" onClick={exportFile} title={t.download}><ArrowDownToLine size={17} /></button>
        <button className="share-btn" onClick={share}>{copied ? <Check size={16} /> : <Share2 size={16} />}<span>{copied ? t.copied : t.share}</span></button>
        <button className="mobile-menu-button" onClick={() => setMobileSidebarOpen(true)} aria-label={t.workspace} aria-expanded={mobileSidebarOpen}><MoreVertical size={20} /></button>
        <div className="profile desktop-profile" title={guestName} style={{ background: identity.color }}>{guestName.slice(0, 1)}</div>
        <div className="profile mobile-profile" title={guestName} aria-label={guestName} style={{ background: identity.color }}>{guestName.slice(0, 1)}</div>
      </div>
    </header>
    <section className="workspace">
      {mobileSidebarOpen && <button className="sidebar-backdrop" aria-label={t.workspace} onClick={() => setMobileSidebarOpen(false)} />}
      <aside className={`sidebar ${mobileSidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="side-section"><div className="side-label">{t.workspace}</div><button className="side-link active"><FileText size={17} /> {t.documents}</button><button className="side-link"><Users size={17} /> {t.sharedWithMe}</button></div>
        <div className="side-section"><div className="side-label">{t.recentDocuments}</div><div className="documents-list">{[...documents].sort((a, b) => b.updatedAt - a.updatedAt).map(document => <div key={document.id} className={`document-row ${document.id === docId ? 'active-document-row' : ''}`}><button className="recent" onClick={() => openDocument(document.id)}><span className="file-badge">Aa</span><span><strong>{document.title}</strong><small>{document.id === docId ? t.updatedNow : new Date(document.updatedAt).toLocaleDateString(language)}</small></span></button><button className="remove-document" onClick={() => deleteDocument(document.id)} title={t.removeDocument} aria-label={`${t.removeDocument}: ${document.title}`}><Trash2 size={14} /></button></div>)}</div><button className="new-doc" onClick={createDocument}><Plus size={16} /> {t.newDocument}</button></div>
        <div className="sidebar-bottom"><div className="help-card"><CircleHelp size={17} /><span>{t.help}<small>{t.guide}</small></span></div><div className="team-user"><div className="profile small" style={{ background: identity.color }}>{guestName.slice(0, 1)}</div><span><strong>{guestName}</strong><small>{t.freePlan}</small></span><span className="more">···</span></div></div>
      </aside>
      <section className="main-area">
        <div className="doc-toolbar"><div className="view-tabs"><button className={view === 'text' ? 'selected' : ''} onClick={() => setView('text')}><FileText size={16} /> {t.documentTab}</button><button className={view === 'board' ? 'selected' : ''} onClick={() => setView('board')}><Pencil size={16} /> {t.boardTab}</button></div><div className="collaborators"><div className="avatar-stack">{people.slice(0, 4).map((person, index) => <div key={`${person.name}-${index}`} className="avatar" style={{ background: person.color }} title={person.name}>{person.name.slice(0, 1)}</div>)}</div><span className="people-count">{people.length} {t.here}</span><span className="presence-dot" /></div></div>
        <div className="editor-scroll"><div className="paper">
          <div className="paper-meta"><span className="doc-label"><span className="tiny-icon">Aa</span> {t.textDocument}</span><span className="updated">{connected ? t.autosaved : t.waitingForConnection}</span></div>
          {view === 'text' ? <>
            <input className="doc-heading" value={title} onChange={event => changeTitle(event.target.value)} aria-label={t.documentTitle} />
            {editorSession?.id === docId && synced
              ? <React.Suspense fallback={<div className="rich-editor-loading" aria-live="polite">{t.editorLoading}</div>}><RichTextEditor document={editorSession.document} provider={editorSession.provider} guestName={guestName} color={identity.color} placeholder={t.placeholder} onTextChange={onTextChange} /></React.Suspense>
              : <div className="rich-editor-loading" aria-live="polite">{t.editorLoading}</div>}
          </> : <>
            <input className="doc-heading" value={title} onChange={event => changeTitle(event.target.value)} aria-label={t.boardTitle} />
            <div className="board-tools"><span><MousePointer2 size={15} /> {t.drawHint}</span><div className="colors">{palette.slice(0, 5).map(color => <button key={color} style={{ background: color }} className={drawingColor === color ? 'color-selected' : ''} onClick={() => setDrawingColor(color)} aria-label={t.colorLabel.replace('{color}', color)} />)}</div><button className="clear-board" onClick={() => strokesRef.current?.delete(0, strokesRef.current.length)}><X size={14} /> {t.clearBoard}</button></div>
            <canvas ref={canvasRef} className="board" onPointerDown={beginDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw} aria-label={t.boardTab} />
          </>}
          <div className="paper-footer"><span><span className="tiny-icon">Aa</span> {chars} {t.characterCount}</span><span>{t.sharedInRealTime} <span className="footer-spark">✦</span></span></div>
        </div></div>
      </section>
    </section>
  </main>
}

function migrateLegacyContent(document: Y.Doc) {
  const legacyText = document.getText('content').toString()
  const richContent = document.getXmlFragment('richContent')
  if (!legacyText || richContent.length > 0) return
  document.transact(() => {
    for (const line of legacyText.split(/\r?\n/)) {
      const paragraph = new Y.XmlElement('paragraph')
      if (line) {
        const text = new Y.XmlText()
        text.insert(0, line)
        paragraph.insert(0, [text])
      }
      richContent.insert(richContent.length, [paragraph])
    }
  })
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
