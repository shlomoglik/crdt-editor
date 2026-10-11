import React from 'react'
import { X } from 'lucide-react'
import { api, type DocumentVersion } from './api'
import { useLanguage } from './i18n'
import { VersionDiff } from './VersionDiff'

type Props = {
  documentId: string
  ready: boolean
  onClose: () => void
  onRestore: () => void
  onBranch: (id: string) => Promise<void>
  showDialog: (mode: 'input' | 'confirm' | 'message', message: string, initialValue?: string) => Promise<string | boolean | null>
}

export function VersionHistory({ documentId, ready, onClose, onRestore, onBranch, showDialog }: Props) {
  const { t, language } = useLanguage()
  const [versions, setVersions] = React.useState<DocumentVersion[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [name, setName] = React.useState('')
  const [comparisonId, setComparisonId] = React.useState<string | null>(null)
  const comparisonIndex = versions.findIndex(version => version.id === comparisonId)
  const comparisonVersion = versions[comparisonIndex]
  const refresh = async () => setVersions((await api.listVersions(documentId)).versions)

  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const result = await api.listVersions(documentId)
        if (active) { setVersions(result.versions); setError('') }
      } catch { if (active) setError(t.historyError) }
      finally { if (active) setLoading(false) }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [documentId, t.historyError])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await action(); await refresh() }
    catch { setError(t.historyError) }
    finally { setBusy(false) }
  }

  return <aside className="version-history" aria-label={t.versionHistory}>
    <div className="history-heading"><h2>{t.versionHistory}</h2><button className="icon-btn" onClick={onClose} aria-label={t.close}><X size={18} /></button></div>
    <p className="history-description">{t.historyDescription}</p>
    <form className="history-save" onSubmit={event => {
      event.preventDefault()
      if (!name.trim()) return
      void run(async () => { await api.saveVersion(documentId, name.trim()); setName('') })
    }}>
      <input aria-label={t.versionName} placeholder={t.versionName} value={name} maxLength={200} onChange={event => setName(event.target.value)} />
      <button disabled={busy || !ready || !name.trim()}>{t.saveVersion}</button>
    </form>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {loading ? <p role="status">{t.historyLoading}</p> : <ol className="history-list">
      {versions.map(version => <li key={version.id}>
        <strong>{version.name || t.automaticVersion}</strong>
        <time dateTime={new Date(version.createdAt).toISOString()}>{new Date(version.createdAt).toLocaleString(language)}</time>
        <span className="history-version-title">{version.title}</span>
        <div className="history-actions">
          <button disabled={busy} onClick={() => setComparisonId(version.id)}>{t.compareVersions}</button>
          <button disabled={busy || !ready} onClick={() => void run(async () => {
            const value = await showDialog('input', t.versionName, version.name ?? '')
            if (typeof value === 'string' && value.trim()) await api.nameVersion(documentId, version.id, value)
          })}>{t.nameVersion}</button>
          <button disabled={busy || !ready} onClick={() => void run(async () => {
            if (!await showDialog('confirm', t.confirmRestoreVersion)) return
            await api.restoreVersion(documentId, version.id)
            onRestore()
          })}>{t.restoreVersion}</button>
          <button disabled={busy || !ready} onClick={() => void run(async () => {
            const value = await showDialog('input', t.branchTitle, version.title)
            if (typeof value !== 'string' || !value.trim()) return
            const result = await api.branchVersion(documentId, version.id, value)
            await onBranch(result.document.id)
          })}>{t.branchVersion}</button>
        </div>
      </li>)}
      {versions.length === 0 && <li>{t.noVersions}</li>}
    </ol>}
    {comparisonVersion && <VersionDiff documentId={documentId} version={comparisonVersion} previous={versions[comparisonIndex + 1]} next={versions[comparisonIndex - 1]} position={versions.length - comparisonIndex} total={versions.length} onNavigate={setComparisonId} onClose={() => setComparisonId(null)} />}
  </aside>
}
