import React from 'react'
import { createRoot } from 'react-dom/client'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ArrowDownToLine, Check, CircleHelp, FileText, GripVertical, MousePointer2, Pencil, Plus, Search, Share2, Sparkles, Trash2, X } from 'lucide-react'
import { api, ApiOriginMismatchError, ApiServerUnavailableError, type Account, type Area, type AreaInvitation } from './api'
import { LanguageProvider, useLanguage, type Language } from './i18n'
import { isDocumentId, readDocuments, readLegacyDocuments, removeLegacyDocument, writeDocuments, type DocumentRecord, type LegacyDocumentRecord } from './documentStore'
import './style.css'

const RichTextEditor = React.lazy(async () => {
  const module = await import('./RichTextEditor')
  return { default: module.RichTextEditor }
})

type Person = { name: string; color: string }
type Stroke = { color: string; points: { x: number; y: number }[] }
type DialogState = { mode: 'input' | 'confirm' | 'message'; message: string; initialValue?: string; resolve: (value: string | boolean | null) => void }
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
  const [account, setAccount] = React.useState<Account | null | undefined>(undefined)
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([])
  const [areas, setAreas] = React.useState<Area[]>([])
  const [areaInvitations, setAreaInvitations] = React.useState<AreaInvitation[]>([])
  const [selectedAreaId, setSelectedAreaId] = React.useState<string | null>(null)
  const [legacyDocuments, setLegacyDocuments] = React.useState<LegacyDocumentRecord[]>(readLegacyDocuments)
  const documentIndexRef = React.useRef(documents)
  const [documentSearch, setDocumentSearch] = React.useState('')
  const [draggedDocumentId, setDraggedDocumentId] = React.useState<string | null>(null)
  const [dropTargetDocumentId, setDropTargetDocumentId] = React.useState<string | null>(null)
  const [documentFilter, setDocumentFilter] = React.useState<'all' | 'owner' | 'shared'>('all')
  const [authMode, setAuthMode] = React.useState<'login' | 'register'>('login')
  const [usernameInput, setUsernameInput] = React.useState('')
  const [passwordInput, setPasswordInput] = React.useState('')
  const [authError, setAuthError] = React.useState('')
  const [authBusy, setAuthBusy] = React.useState(false)
  const [dialog, setDialog] = React.useState<DialogState | null>(null)
  const [dialogValue, setDialogValue] = React.useState('')
  const [membersArea, setMembersArea] = React.useState<Area | null>(null)
  const [memberPendingRemoval, setMemberPendingRemoval] = React.useState<{ id: string; username: string } | null>(null)
  const [confirmAreaLeave, setConfirmAreaLeave] = React.useState(false)
  const [docId, setDocId] = React.useState(() => {
    const requestedId = new URLSearchParams(location.search).get('doc')
    return isDocumentId(requestedId) ? requestedId : ''
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
  const [drawingColor, setDrawingColor] = React.useState(palette[0])
  const drawing = React.useRef<{ color: string; points: { x: number; y: number }[] } | null>(null)
  const guestName = account?.username ?? `${t.guestName} ${identity.suffix}`
  const documentReady = synced
  const languageLabels = React.useRef({ guestName, untitled: t.untitled })
  languageLabels.current = { guestName, untitled: t.untitled }
  const showDialog = (mode: DialogState['mode'], message: string, initialValue = '') => new Promise<string | boolean | null>(resolve => {
    setDialogValue(initialValue)
    setDialog({ mode, message, initialValue, resolve })
  })
  const finishDialog = (value: string | boolean | null) => {
    dialog?.resolve(value)
    setDialog(null)
  }


  const saveDocumentRecord = React.useCallback((id: string, nextTitle: string) => {
    if (!account) return
    const current = documentIndexRef.current
    const existing = current.find(document => document.id === id)
    if (!existing) return
    const order = existing?.order ?? Math.min(0, ...current.map(document => document.order)) - 1
    const record: DocumentRecord = { ...existing, title: nextTitle, updatedAt: Date.now(), order }
    const next = current.map(document => document.id === id ? record : document)
    documentIndexRef.current = next
    writeDocuments(account.id, next)
    setDocuments(next)
    if (existing.title !== nextTitle) void api.renameDocument(id, nextTitle).catch(() => undefined)
  }, [account?.id])

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

  const createDocument = async () => {
    if (!account) return
    try {
      const { document } = await api.createDocument(t.untitled, selectedAreaId)
      const current = documentIndexRef.current
      const ordered = [document, ...current].map((entry, order) => ({ ...entry, order })) as DocumentRecord[]
      documentIndexRef.current = ordered
      writeDocuments(account.id, ordered)
      setDocuments(ordered)
      updateDocumentUrl(document.id)
      setDocId(document.id)
    } catch (error) {
      setAuthError(error instanceof ApiServerUnavailableError || error instanceof ApiOriginMismatchError ? t.serverRestartRequired : t.authError)
    }
  }

  const deleteDocument = async (id: string) => {
    if (!account) return
    const selected = documentIndexRef.current.find(document => document.id === id)
    if (!selected) return
    const canDelete = selected.areaId ? selected.areaOwnerId === account.id : selected.access === 'owner'
    if (canDelete) {
      const message = selected.sharedWithCount > 0
        ? t.confirmDeleteSharedDocument.replace('{count}', String(selected.sharedWithCount))
        : t.confirmDeleteDocument
      if (!await showDialog('confirm', message)) return
    }
    try {
      if (canDelete) await api.deleteDocument(id)
      else await api.leaveDocument(id)
    } catch (error) {
      setAuthError(error instanceof ApiServerUnavailableError || error instanceof ApiOriginMismatchError ? t.serverRestartRequired : t.authError)
      return
    }
    const remaining = documentIndexRef.current.filter(document => document.id !== id)
    const ordered = remaining.map((document, order) => ({ ...document, order }))
    documentIndexRef.current = ordered
    writeDocuments(account.id, ordered)
    setDocuments(ordered)
    if (id === docId) {
      const nextDocument = ordered[0]
      if (nextDocument) {
        updateDocumentUrl(nextDocument.id, true)
        setDocId(nextDocument.id)
      } else {
        window.history.replaceState({}, '', location.pathname)
        setDocId('')
        setTitle(t.untitled)
        setBodyText('')
        setStrokes([])
      }
    }
  }

  const moveDocument = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const current = documentIndexRef.current
    const sourceIndex = current.findIndex(document => document.id === sourceId)
    const targetIndex = current.findIndex(document => document.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const reordered = [...current]
    const [source] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, source)
    const next = reordered.map((document, order) => ({ ...document, order }))
    documentIndexRef.current = next
    if (account) writeDocuments(account.id, next)
    setDocuments(next)
  }

  const moveDocumentBy = (id: string, offset: number) => {
    const current = documentIndexRef.current
    const index = current.findIndex(document => document.id === id)
    const target = current[index + offset]
    if (target) moveDocument(id, target.id)
  }

  const startDocumentDrag = (event: React.DragEvent<HTMLButtonElement>, id: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    setDraggedDocumentId(id)
  }

  const dropDocument = (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    const sourceId = event.dataTransfer.getData('text/plain') || draggedDocumentId
    if (sourceId) moveDocument(sourceId, targetId)
    setDraggedDocumentId(null)
    setDropTargetDocumentId(null)
  }

  const visibleDocuments = documents
    .filter(document => !selectedAreaId || document.areaId === selectedAreaId)
    .filter(document => documentFilter === 'all' || document.access === documentFilter)
    .filter(document => document.title.toLocaleLowerCase(language).includes(documentSearch.trim().toLocaleLowerCase(language)))
    .sort((a, b) => a.order - b.order)

  const refreshDocuments = React.useCallback(async (user: Account) => {
    const { documents: remoteDocuments } = await api.listDocuments()
    const cachedDocuments = readDocuments(user.id)
    const cachedOrder = new Map(cachedDocuments.map(document => [document.id, document.order]))
    const newDocuments = remoteDocuments.filter(document => !cachedOrder.has(document.id)).sort((a, b) => b.updatedAt - a.updatedAt)
    const knownDocuments = remoteDocuments.filter(document => cachedOrder.has(document.id)).sort((a, b) => cachedOrder.get(a.id)! - cachedOrder.get(b.id)!)
    const next = [...newDocuments, ...knownDocuments]
      .map((document, order) => ({ ...document, order })) as DocumentRecord[]
    documentIndexRef.current = next
    writeDocuments(user.id, next)
    setDocuments(next)
    return next
  }, [])

  const refreshAreas = React.useCallback(async () => {
    const result = await api.listAreas()
    setAreas(result.areas); setAreaInvitations(result.invitations)
    setSelectedAreaId(current => current && result.areas.some(area => area.id === current) ? current : null)
  }, [])

  const createArea = async () => {
    const name = await showDialog('input', t.areaNamePrompt)
    if (typeof name !== 'string') return
    if (!name?.trim()) return
    try { const { area } = await api.createArea(name); await refreshAreas(); setSelectedAreaId(area.id) }
    catch { setAuthError(t.authError) }
  }
  const inviteAreaMember = async (area: Area) => {
    const username = await showDialog('input', t.inviteAreaPrompt)
    if (typeof username !== 'string' || !username.trim()) return
    try { await api.inviteToArea(area.id, username); setAuthError('') } catch { setAuthError(t.authError) }
  }
  const manageAreaMembers = async (area: Area) => {
    setMembersArea(area)
    setMemberPendingRemoval(null)
    setConfirmAreaLeave(false)
  }
  const removeAreaMember = async () => {
    if (!membersArea || !memberPendingRemoval) return
    try {
      await api.removeAreaMember(membersArea.id, memberPendingRemoval.id)
      setMembersArea(current => current ? { ...current, members: current.members.filter(member => member.id !== memberPendingRemoval.id) } : null)
      setMemberPendingRemoval(null)
      await refreshAreas(); await refreshDocuments(account!)
    } catch { setAuthError(t.authError) }
  }
  const leaveManagedArea = async () => {
    if (!membersArea) return
    try {
      await api.leaveArea(membersArea.id)
      setMembersArea(null); setConfirmAreaLeave(false); setSelectedAreaId(null)
      await refreshAreas(); await refreshDocuments(account!)
    } catch { setAuthError(t.authError) }
  }
  const moveToArea = async (document: DocumentRecord, areaId: string) => {
    try { await api.moveDocumentToArea(document.id, areaId || null); await refreshDocuments(account!); } catch { setAuthError(t.authError) }
  }

  React.useEffect(() => {
    let active = true
    api.session().then(async ({ user }) => {
      if (!active) return
      setAccount(user)
      if (!user) return
      await refreshAreas()
      const next = await refreshDocuments(user)
      if (!active) return
      const requestedId = new URLSearchParams(location.search).get('doc')
      const selected = next.find(document => document.id === requestedId) ?? next[0]
      if (selected) {
        setDocId(selected.id)
        updateDocumentUrl(selected.id, true)
      } else {
        setDocId('')
        window.history.replaceState({}, '', location.pathname)
      }
    }).catch(() => { if (active) setAccount(null) })
    return () => { active = false }
  }, [refreshDocuments, refreshAreas, updateDocumentUrl])

  React.useEffect(() => {
    if (!account) return
    const refreshTimer = window.setInterval(() => {
      void refreshDocuments(account).then(next => {
        if (docId && !next.some(document => document.id === docId)) {
          const nextDocument = next[0]
          setDocId(nextDocument?.id ?? '')
          if (nextDocument) updateDocumentUrl(nextDocument.id, true)
          else window.history.replaceState({}, '', location.pathname)
        }
      }).catch(() => undefined)
      void refreshAreas().catch(() => undefined)
    }, 10000)
    return () => window.clearInterval(refreshTimer)
  }, [account, docId, refreshAreas, refreshDocuments, updateDocumentUrl])

  const authenticate = async (event: React.FormEvent) => {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    try {
      const result = await api.authenticate(authMode === 'register' ? '/api/register' : '/api/login', usernameInput, passwordInput)
      setAccount(result.user)
      setPasswordInput('')
      await refreshAreas()
      const next = await refreshDocuments(result.user)
      const selected = next.find(document => document.id === new URLSearchParams(location.search).get('doc')) ?? next[0]
      if (selected) {
        setDocId(selected.id)
        updateDocumentUrl(selected.id, true)
      } else {
        setDocId('')
        window.history.replaceState({}, '', location.pathname)
      }
    } catch (error) {
      setAuthError(error instanceof ApiServerUnavailableError || error instanceof ApiOriginMismatchError ? t.serverRestartRequired : t.authError)
    } finally {
      setAuthBusy(false)
    }
  }

  const signOut = async () => {
    try { await api.logout() } catch { /* The local session still needs to close. */ }
    setAccount(null)
    setDocuments([])
    setAreas([]); setAreaInvitations([]); setSelectedAreaId(null)
    documentIndexRef.current = []
    setDocId('')
    window.history.replaceState({}, '', location.pathname)
  }

  const claimLegacyDocument = async (document: LegacyDocumentRecord) => {
    if (!account) return
    const message = t.confirmClaimLegacyDocument.replace('{title}', document.title)
    if (!await showDialog('confirm', message)) return
    try {
      await api.claimLegacyDocument(document.id, document.title)
      removeLegacyDocument(document.id)
      setLegacyDocuments(current => current.filter(entry => entry.id !== document.id))
      const next = await refreshDocuments(account)
      if (!docId) {
        const claimed = next.find(entry => entry.id === document.id)
        if (claimed) {
          updateDocumentUrl(claimed.id, true)
          setDocId(claimed.id)
        }
      }
    } catch (error) {
      setAuthError(error instanceof ApiServerUnavailableError || error instanceof ApiOriginMismatchError ? t.serverRestartRequired : t.authError)
    }
  }

  React.useEffect(() => {
    if (docId) updateDocumentUrl(docId, true)
  }, [docId, updateDocumentUrl])

  React.useEffect(() => {
    const onPopState = () => {
      const requestedId = new URLSearchParams(location.search).get('doc')
      if (isDocumentId(requestedId) && documentIndexRef.current.some(document => document.id === requestedId)) setDocId(requestedId)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (account && event.key === `merhav-documents-${account.id}`) {
        const next = readDocuments(account.id)
        documentIndexRef.current = next
        setDocuments(next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [account])

  React.useEffect(() => {
    if (!account || !docId || !documentIndexRef.current.some(document => document.id === docId)) return
    setEditorSession(null)
    setBodyText('')
    setStrokes([])
    setPeople([])
    setConnected(false)
    setSynced(false)
    setTitle(languageLabels.current.untitled)
    const doc = new Y.Doc()
    const provider = new WebsocketProvider(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/yjs`, docId, doc, { connect: true, disableBc: true })
    providerRef.current = provider
    setEditorSession({ id: docId, document: doc, provider })
    const board = doc.getArray<Stroke>('board')
    const metadata = doc.getMap<string>('metadata')
    strokesRef.current = board
    metadataRef.current = metadata
    const richContent = doc.getXmlFragment('richContent')
    provider.awareness.setLocalStateField('user', { name: guestName, color: identity.color } satisfies Person)

    let documentSynced = false
    const saveSyncedTitle = () => {
      const sharedTitle = metadata.get('title')
      if (documentSynced && sharedTitle !== undefined) saveDocumentRecord(docId, sharedTitle)
    }
    const onBoard = () => {
      setStrokes(board.toArray())
      saveSyncedTitle()
    }
    const onRichContent = () => saveSyncedTitle()
    const onMetadata = () => {
      const nextTitle = metadata.get('title')
      if (!documentSynced || nextTitle === undefined) return
      setTitle(nextTitle)
      saveDocumentRecord(docId, nextTitle)
    }
    const onAwareness = () => setPeople(Array.from(provider.awareness.getStates().values()).map(state => state.user as Person | undefined).filter((user): user is Person => !!user))
    const onStatus = ({ status }: { status: string }) => setConnected(status === 'connected')
    let migrationTimer: number | undefined
    const onSync = (isSynced: boolean) => {
      if (!isSynced) {
        documentSynced = false
        setSynced(false)
        return
      }
      window.clearTimeout(migrationTimer)
      migrationTimer = window.setTimeout(() => {
        documentSynced = true
        if (!metadata.has('title')) {
          const listedTitle = documentIndexRef.current.find(document => document.id === docId)?.title
          metadata.set('title', listedTitle ?? languageLabels.current.untitled)
        }
        const sharedTitle = metadata.get('title')
        if (sharedTitle !== undefined) {
          setTitle(sharedTitle)
          saveDocumentRecord(docId, sharedTitle)
        }
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
  }, [account?.id, docId, guestName, saveDocumentRecord])

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
    if (!docId || !synced) return
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
    if (!account || !docId) return
    try {
      const username = await showDialog('input', t.sharePrompt)
      if (typeof username !== 'string' || !username.trim()) return
      await api.shareDocument(docId, username)
      const url = new URL(location.href)
      url.searchParams.set('doc', docId)
      try { await navigator.clipboard.writeText(url.toString()) } catch { await showDialog('message', `${t.copyPrompt}\n${url.toString()}`) }
      await refreshDocuments(account)
      setAuthError('')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      setAuthError(error instanceof ApiServerUnavailableError || error instanceof ApiOriginMismatchError ? t.serverRestartRequired : t.authError)
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

  if (account === undefined) return <main className="auth-shell" dir={direction}><div className="auth-card">{t.authLoading}</div></main>
  if (!account) return <main className="auth-shell" dir={direction}>
    <form className="auth-card" onSubmit={authenticate}>
      <a className="brand auth-brand" href="#" aria-label={t.brand}><span className="brand-mark"><Sparkles size={18} /></span><span>{t.brand}</span></a>
      <h1>{authMode === 'register' ? t.createAccount : t.signIn}</h1>
      <label>{t.username}<input autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-zA-Z0-9_]{3,24}" value={usernameInput} onChange={event => setUsernameInput(event.target.value)} required minLength={3} maxLength={24} /></label>
      <label>{t.password}<input type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={passwordInput} onChange={event => setPasswordInput(event.target.value)} required minLength={10} maxLength={200} /></label>
      <p className="auth-requirements">{t.accountRequirements}</p>
      {authError && <p className="auth-error" role="alert">{authError}</p>}
      <button className="auth-submit" type="submit" disabled={authBusy}>{authBusy ? t.connecting : authMode === 'register' ? t.signUp : t.signIn}</button>
      <button className="auth-switch" type="button" onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setAuthError('') }}>{authMode === 'register' ? t.switchToSignIn : t.switchToSignUp}</button>
      <label className="language-picker auth-language"><span>{t.selectLanguage}</span><select value={language} onChange={chooseLanguage}><option value="en">{t.english}</option><option value="he">{t.hebrew}</option></select></label>
    </form>
  </main>

  return <main className="app-shell" dir={direction}>
    <header className="topbar">
      <a className="brand" href="#" aria-label={t.brand}><span className="brand-mark"><Sparkles size={18} /></span><span>{t.brand}</span></a>
      <div className="breadcrumb"><span>{areas.find(area => area.id === selectedAreaId)?.name ?? (documentFilter === 'all' ? t.allDocuments : documentFilter === 'owner' ? t.myDocuments : t.sharedWithMe)}</span><span className="slash">/</span>{editingTitle ? <input autoFocus disabled={!synced} value={title} onChange={event => changeTitle(event.target.value)} onBlur={() => setEditingTitle(false)} onKeyDown={event => event.key === 'Enter' && setEditingTitle(false)} /> : <button className="title-button" disabled={!synced} onClick={() => setEditingTitle(true)}>{docId && !documentReady ? t.editorLoading : title}{documentReady && <span className="edit-dot" />}</button>}</div>
      <div className="top-actions">
        <label className="language-picker"><span className="sr-only">{t.selectLanguage}</span><select value={language} onChange={chooseLanguage} aria-label={t.selectLanguage}><option value="en">{t.english}</option><option value="he">{t.hebrew}</option></select></label>
        <span className={`save-status ${connected ? 'online' : ''}`}><i />{connected ? synced ? t.saved : t.connecting : t.disconnected}</span>
        <button className="icon-btn" onClick={exportFile} title={t.download}><ArrowDownToLine size={17} /></button>
        <button className="share-btn" onClick={share}>{copied ? <Check size={16} /> : <Share2 size={16} />}<span>{copied ? t.copied : t.share}</span></button>
        <button className="account-button" onClick={signOut} title={t.signOut}><div className="profile" style={{ background: identity.color }}>{guestName.slice(0, 1)}</div></button>
      </div>
    </header>
    {authError && <div className="workspace-error" role="alert">{authError}<button onClick={() => setAuthError('')} aria-label={t.close}><X size={14} /></button></div>}
    <section className="workspace">
      <aside className="sidebar">
        <div className="side-section"><div className="side-label">{t.workspace}</div><div className="document-filters" role="group" aria-label={t.documents}>
          <button className={documentFilter === 'all' ? 'selected' : ''} onClick={() => setDocumentFilter('all')}>{t.allDocuments}</button>
          <button className={documentFilter === 'owner' ? 'selected' : ''} onClick={() => setDocumentFilter('owner')}>{t.myDocuments}</button>
          <button className={documentFilter === 'shared' ? 'selected' : ''} onClick={() => setDocumentFilter('shared')}>{t.sharedWithMe}</button>
        </div></div>
        <div className="side-section area-section">
          <div className="side-label">{t.areas}</div>
          <button className={`area-choice ${!selectedAreaId ? 'selected' : ''}`} onClick={() => setSelectedAreaId(null)}>{t.allAreas}</button>
          {areas.map(area => <div className="area-row" key={area.id}>
            <button className={`area-choice ${selectedAreaId === area.id ? 'selected' : ''}`} onClick={() => setSelectedAreaId(area.id)}>{area.name}</button>
            <button className="area-manage" title={area.isOwner ? t.inviteToArea : t.areaMembers} onClick={() => area.isOwner ? void inviteAreaMember(area) : void manageAreaMembers(area)}>•••</button>
            {area.isOwner && <button className="area-manage" title={t.areaMembers} onClick={() => void manageAreaMembers(area)}>{area.members.length}</button>}
          </div>)}
          <button className="new-doc area-create" onClick={() => void createArea()}><Plus size={14} /> {t.createArea}</button>
          {areaInvitations.length > 0 && <div className="area-invites"><span>{t.invitations}</span>{areaInvitations.map(invitation => <button key={invitation.id} onClick={async () => { try { await api.acceptAreaInvitation(invitation.id); await refreshAreas(); await refreshDocuments(account!) } catch { setAuthError(t.authError) } }}>{invitation.name} · {t.acceptInvitation}</button>)}</div>}
        </div>
        {legacyDocuments.length > 0 && <div className="side-section legacy-documents">
          <div className="side-label">{t.legacyDocuments}</div>
          <div className="legacy-document-list">{legacyDocuments.map(document => <div className="legacy-document" key={document.id}>
            <span title={document.title}>{document.title}</span>
            <button onClick={() => void claimLegacyDocument(document)}>{t.claimLegacyDocument}</button>
          </div>)}</div>
        </div>}
        <div className="side-section">
          <div className="side-label">{t.documents}</div>
          <label className="document-search"><Search size={15} /><input type="search" value={documentSearch} onChange={event => setDocumentSearch(event.target.value)} placeholder={t.searchDocumentsPlaceholder} aria-label={t.searchDocuments} /></label>
          <div className="documents-list">
            {visibleDocuments.map(document => <div
              key={document.id}
              className={`document-row ${document.id === docId ? 'active-document-row' : ''} ${draggedDocumentId === document.id ? 'dragged-document-row' : ''} ${dropTargetDocumentId === document.id ? 'drop-target-document-row' : ''}`}
              onDragOver={event => { event.preventDefault(); setDropTargetDocumentId(document.id) }}
              onDrop={event => dropDocument(event, document.id)}
            >
              <button
                className="document-drag-handle"
                draggable
                onDragStart={event => startDocumentDrag(event, document.id)}
                onDragEnd={() => { setDraggedDocumentId(null); setDropTargetDocumentId(null) }}
                onKeyDown={event => {
                  if (event.key === 'ArrowUp') { event.preventDefault(); moveDocumentBy(document.id, -1) }
                  if (event.key === 'ArrowDown') { event.preventDefault(); moveDocumentBy(document.id, 1) }
                }}
                aria-label={`${t.reorderDocument}: ${document.title}`}
                aria-keyshortcuts="ArrowUp ArrowDown"
                title={`${t.moveDocumentUp} / ${t.moveDocumentDown}`}
              ><GripVertical size={15} /></button>
              <button className="recent" onClick={() => openDocument(document.id)}><span className="file-badge">Aa</span><span><strong>{document.title}</strong><small>{document.access === 'shared' ? t.sharedDocumentOwner.replace('{owner}', document.ownerUsername) : document.id === docId ? t.updatedNow : new Date(document.updatedAt).toLocaleDateString(language)}</small></span></button>
              {((!document.areaId && document.access === 'owner') || (document.areaId && document.areaOwnerId === account.id) || document.access === 'shared') && <button className="remove-document" onClick={() => void deleteDocument(document.id)} title={document.access === 'shared' ? t.leaveSharedDocument : t.deleteDocument} aria-label={`${document.access === 'shared' ? t.leaveSharedDocument : t.deleteDocument}: ${document.title}`}><Trash2 size={14} /></button>}
              {document.access === 'owner' && areas.length > 0 && <select className="document-area-select" aria-label={t.areaDocuments} value={document.areaId || ''} onChange={event => void moveToArea(document, event.target.value)}><option value="">{t.noArea}</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select>}
            </div>)}
            {visibleDocuments.length === 0 && <div className="document-search-empty">{t.noMatchingDocuments}</div>}
          </div>
          <button className="new-doc" onClick={createDocument}><Plus size={16} /> {t.newDocument}</button>
        </div>
        <div className="sidebar-bottom"><div className="help-card"><CircleHelp size={17} /><span>{t.help}<small>{t.guide}</small></span></div><div className="team-user"><div className="profile small" style={{ background: identity.color }}>{guestName.slice(0, 1)}</div><span><strong>{guestName}</strong><small>{t.account}</small></span><span className="more">···</span></div></div>
      </aside>
      <section className="main-area">
        {docId ? <>
        <div className="doc-toolbar"><div className="view-tabs"><button className={view === 'text' ? 'selected' : ''} onClick={() => setView('text')}><FileText size={16} /> {t.documentTab}</button><button className={view === 'board' ? 'selected' : ''} onClick={() => setView('board')}><Pencil size={16} /> {t.boardTab}</button></div><div className="collaborators"><div className="avatar-stack">{people.slice(0, 4).map((person, index) => <div key={`${person.name}-${index}`} className="avatar" style={{ background: person.color }} title={person.name}>{person.name.slice(0, 1)}</div>)}</div><span className="people-count">{people.length} {t.here}</span><span className="presence-dot" /></div></div>
        <div className="editor-scroll"><div className={`paper ${!documentReady ? 'paper-loading' : ''}`}>
          {!documentReady ? <div className="document-loading" aria-live="polite">{t.editorLoading}</div> : <>
          <div className="paper-meta"><span className="doc-label"><span className="tiny-icon">Aa</span> {t.textDocument}</span><span className="updated">{connected ? t.autosaved : t.waitingForConnection}</span></div>
          {view === 'text' ? <>
            <input className="doc-heading" value={title} onChange={event => changeTitle(event.target.value)} aria-label={t.documentTitle} disabled={!synced} />
            {editorSession?.id === docId && synced
              ? <React.Suspense fallback={<div className="rich-editor-loading" aria-live="polite">{t.editorLoading}</div>}><RichTextEditor document={editorSession.document} provider={editorSession.provider} guestName={guestName} color={identity.color} placeholder={t.placeholder} onTextChange={onTextChange} /></React.Suspense>
              : <div className="rich-editor-loading" aria-live="polite">{t.editorLoading}</div>}
          </> : <>
            <input className="doc-heading" value={title} onChange={event => changeTitle(event.target.value)} aria-label={t.boardTitle} disabled={!synced} />
            <div className="board-tools"><span><MousePointer2 size={15} /> {t.drawHint}</span><div className="colors">{palette.slice(0, 5).map(color => <button key={color} style={{ background: color }} className={drawingColor === color ? 'color-selected' : ''} onClick={() => setDrawingColor(color)} aria-label={t.colorLabel.replace('{color}', color)} />)}</div><button className="clear-board" onClick={() => strokesRef.current?.delete(0, strokesRef.current.length)}><X size={14} /> {t.clearBoard}</button></div>
            <canvas ref={canvasRef} className="board" onPointerDown={beginDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw} aria-label={t.boardTab} />
          </>}
          <div className="paper-footer"><span><span className="tiny-icon">Aa</span> {chars} {t.characterCount}</span><span>{t.sharedInRealTime} <span className="footer-spark">✦</span></span></div>
          </>}
        </div></div>
        </> : <div className="empty-workspace"><p>{t.noDocumentSelected}</p><button className="new-doc" onClick={createDocument}><Plus size={16} /> {t.createFirstDocument}</button></div>}
      </section>
    </section>
    {dialog && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) finishDialog(null) }}>
      <form className="app-dialog" role="dialog" aria-modal="true" aria-label={dialog.message.split('\n')[0]} onSubmit={event => { event.preventDefault(); finishDialog(dialog.mode === 'confirm' ? true : dialog.mode === 'input' ? dialogValue : true) }}>
        <p className="dialog-message">{dialog.message}</p>
        {dialog.mode === 'input' && <input autoFocus value={dialogValue} onChange={event => setDialogValue(event.target.value)} />}
        <div className="dialog-actions">
          {dialog.mode !== 'message' && <button type="button" className="dialog-cancel" onClick={() => finishDialog(null)}>{t.cancel}</button>}
          <button type="submit" className="dialog-submit">{dialog.mode === 'confirm' ? t.confirm : t.ok}</button>
        </div>
      </form>
    </div>}
    {membersArea && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setMembersArea(null); setConfirmAreaLeave(false) } }}>
      <section className="app-dialog members-dialog" role="dialog" aria-modal="true" aria-labelledby="members-dialog-title" dir={direction}>
        <div className="members-dialog-heading"><div><h2 id="members-dialog-title">{t.areaMembers}</h2><p>{membersArea.name}</p></div><button type="button" className="members-dialog-close" onClick={() => { setMembersArea(null); setConfirmAreaLeave(false) }} aria-label={t.cancel}><X size={18} /></button></div>
        <div className="area-member-list">{membersArea.members.map(member => <div className="area-member-item" key={member.id}>
          <div className="area-member-identity"><span className="area-member-avatar">{member.username.slice(0, 1).toLocaleUpperCase()}</span><span>{member.username}{member.id === membersArea.ownerId && <small>{t.areaOwnerRole}</small>}</span></div>
          {membersArea.isOwner && member.id !== membersArea.ownerId && <button type="button" className="member-remove-button" onClick={() => setMemberPendingRemoval(memberPendingRemoval?.id === member.id ? null : member)}>{t.removeAreaMember}</button>}
          {memberPendingRemoval?.id === member.id && <div className="member-remove-confirm"><span>{t.confirmRemoveAreaMember.replace('{username}', member.username)}</span><button type="button" onClick={() => setMemberPendingRemoval(null)}>{t.cancel}</button><button type="button" className="danger-action" onClick={() => void removeAreaMember()}>{t.confirm}</button></div>}
        </div>)}</div>
        {!membersArea.isOwner && (confirmAreaLeave
          ? <div className="leave-area-confirm"><span>{t.leaveArea}?</span><button type="button" onClick={() => setConfirmAreaLeave(false)}>{t.cancel}</button><button type="button" className="danger-action" onClick={() => void leaveManagedArea()}>{t.confirm}</button></div>
          : <button type="button" className="leave-area-button" onClick={() => setConfirmAreaLeave(true)}>{t.leaveArea}</button>)}
      </section>
    </div>}
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
