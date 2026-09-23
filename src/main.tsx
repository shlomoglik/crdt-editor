import React from 'react'
import { createRoot } from 'react-dom/client'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ArrowDownToLine, Check, CircleHelp, FileText, MousePointer2, Pencil, Plus, Share2, Sparkles, Trash2, Users, X } from 'lucide-react'
import { LanguageProvider, useLanguage, type Language } from './i18n'
import { createDocumentId, isDocumentId, readDocuments, writeDocuments, type DocumentRecord } from './documentStore'
import './style.css'

type Person = { name: string; color: string; cursor?: { anchor: number; head: number } }
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
  const docRef = React.useRef<Y.Doc | null>(null)
  const providerRef = React.useRef<WebsocketProvider | null>(null)
  const textRef = React.useRef<Y.Text | null>(null)
  const strokesRef = React.useRef<Y.Array<Stroke> | null>(null)
  const metadataRef = React.useRef<Y.Map<string> | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [value, setValue] = React.useState('')
  const [strokes, setStrokes] = React.useState<Stroke[]>([])
  const [people, setPeople] = React.useState<Person[]>([])
  const [connected, setConnected] = React.useState(false)
  const [synced, setSynced] = React.useState(false)
  const [view, setView] = React.useState<'text' | 'board'>('text')
  const [title, setTitle] = React.useState(t.untitled)
  const [editingTitle, setEditingTitle] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [drawingColor, setDrawingColor] = React.useState(palette[0])
  const drawing = React.useRef<{ color: string; points: { x: number; y: number }[] } | null>(null)
  const guestName = `${t.guestName} ${identity.suffix}`
  const languageLabels = React.useRef({ guestName, untitled: t.untitled })
  languageLabels.current = { guestName, untitled: t.untitled }

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
    setValue('')
    setStrokes([])
    setPeople([])
    setConnected(false)
    setSynced(false)
    setTitle(languageLabels.current.untitled)
    const doc = new Y.Doc()
    const provider = new WebsocketProvider(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/yjs`, docId, doc, { connect: true })
    docRef.current = doc
    providerRef.current = provider
    const text = doc.getText('content')
    const board = doc.getArray<Stroke>('board')
    const metadata = doc.getMap<string>('metadata')
    textRef.current = text
    strokesRef.current = board
    metadataRef.current = metadata
    if (!metadata.has('title')) metadata.set('title', languageLabels.current.untitled)
    provider.awareness.setLocalStateField('user', { name: guestName, color: identity.color } satisfies Person)

    const onText = () => {
      setValue(text.toString())
      saveDocumentRecord(docId, metadata.get('title') ?? languageLabels.current.untitled)
    }
    const onBoard = () => {
      setStrokes(board.toArray())
      saveDocumentRecord(docId, metadata.get('title') ?? languageLabels.current.untitled)
    }
    const onMetadata = () => {
      const nextTitle = metadata.get('title') ?? languageLabels.current.untitled
      setTitle(nextTitle)
      saveDocumentRecord(docId, nextTitle)
    }
    const onAwareness = () => setPeople(Array.from(provider.awareness.getStates().values()).map(state => state.user as Person | undefined).filter((user): user is Person => !!user))
    const onStatus = ({ status }: { status: string }) => setConnected(status === 'connected')
    const onSync = (isSynced: boolean) => setSynced(isSynced)

    text.observe(onText)
    board.observe(onBoard)
    metadata.observe(onMetadata)
    provider.awareness.on('change', onAwareness)
    provider.on('status', onStatus)
    provider.on('sync', onSync)
    onText()
    onBoard()
    onMetadata()
    onAwareness()

    return () => {
      text.unobserve(onText)
      board.unobserve(onBoard)
      metadata.unobserve(onMetadata)
      provider.awareness.off('change', onAwareness)
      provider.off('status', onStatus)
      provider.off('sync', onSync)
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

  const updateCursor = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    providerRef.current?.awareness.setLocalStateField('user', {
      name: guestName,
      color: identity.color,
      cursor: { anchor: textarea.selectionStart, head: textarea.selectionEnd },
    } satisfies Person)
  }

  const changeText = (next: string) => {
    const text = textRef.current
    if (!text) return
    const previous = text.toString()
    let start = 0
    while (start < previous.length && start < next.length && previous[start] === next[start]) start++
    let end = 0
    while (end < previous.length - start && end < next.length - start && previous[previous.length - end - 1] === next[next.length - end - 1]) end++
    docRef.current?.transact(() => {
      if (previous.length - start - end) text.delete(start, previous.length - start - end)
      if (next.length - start - end) text.insert(start, next.slice(start, next.length - end))
    })
    updateCursor()
  }

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
    const blob = new Blob([value], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${title || 'document'}.txt`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const chooseLanguage = (event: React.ChangeEvent<HTMLSelectElement>) => setLanguage(event.target.value as Language)
  const chars = value.length

  return <main className="app-shell" dir={direction}>
    <header className="topbar">
      <a className="brand" href="#" aria-label={t.brand}><span className="brand-mark"><Sparkles size={18} /></span><span>{t.brand}</span></a>
      <div className="breadcrumb"><span>{t.breadcrumb}</span><span className="slash">/</span>{editingTitle ? <input autoFocus value={title} onChange={event => changeTitle(event.target.value)} onBlur={() => setEditingTitle(false)} onKeyDown={event => event.key === 'Enter' && setEditingTitle(false)} /> : <button className="title-button" onClick={() => setEditingTitle(true)}>{title}<span className="edit-dot" /></button>}</div>
      <div className="top-actions">
        <label className="language-picker"><span className="sr-only">{t.selectLanguage}</span><select value={language} onChange={chooseLanguage} aria-label={t.selectLanguage}><option value="en">{t.english}</option><option value="he">{t.hebrew}</option></select></label>
        <span className={`save-status ${connected ? 'online' : ''}`}><i />{connected ? synced ? t.saved : t.connecting : t.disconnected}</span>
        <button className="icon-btn" onClick={exportFile} title={t.download}><ArrowDownToLine size={17} /></button>
        <button className="share-btn" onClick={share}>{copied ? <Check size={16} /> : <Share2 size={16} />}<span>{copied ? t.copied : t.share}</span></button>
        <div className="profile" title={guestName} style={{ background: identity.color }}>{guestName.slice(0, 1)}</div>
      </div>
    </header>
    <section className="workspace">
      <aside className="sidebar">
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
            <div className="editor-wrap"><textarea ref={textareaRef} className="editor" value={value} onChange={event => changeText(event.target.value)} onSelect={updateCursor} onKeyUp={updateCursor} placeholder={t.placeholder} aria-label={t.contentLabel} spellCheck="false" /><RemoteCursors people={people} localName={guestName} text={value} /></div>
            {!value && <div className="starter"><div className="starter-icon"><Sparkles size={19} /></div><strong>{t.starterTitle}</strong><span>{t.starterSubtitle}</span><button onClick={() => textareaRef.current?.focus()}>{t.startWriting} <span>{language === 'he' ? '←' : '→'}</span></button></div>}
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

function RemoteCursors({ people, localName, text }: { people: Person[]; localName: string; text: string }) {
  const { t } = useLanguage()
  const remote = people.filter(person => person.name !== localName && person.cursor)
  if (!remote.length) return null
  return <div className="remote-presence" aria-label={t.editingNow}><span className="remote-heading">{t.editingNow}</span>{remote.map((person, index) => {
    const before = text.slice(0, Math.min(person.cursor?.head ?? 0, text.length))
    const line = before.split('\n').length
    return <div className="remote-person" key={`${person.name}-${index}`}><span className="cursor-swatch" style={{ background: person.color }} /><span>{person.name}</span><small>{t.line.replace('{line}', String(line))}</small></div>
  })}</div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
