import React from 'react'
import { diffArrays, diffWordsWithSpace } from 'diff'
import { X } from 'lucide-react'
import { api, type DocumentVersion, type VersionContent } from './api'
import { useLanguage } from './i18n'

type Props = { documentId: string; version: DocumentVersion; previous?: DocumentVersion; onClose: () => void }

export function VersionDiff({ documentId, version, previous, onClose }: Props) {
  const { t, language, direction } = useLanguage()
  const [mode, setMode] = React.useState<'current' | 'previous'>(previous ? 'previous' : 'current')
  const [revision, setRevision] = React.useState(0)
  const [content, setContent] = React.useState<{ before: VersionContent; after: VersionContent } | null>(null)
  const [error, setError] = React.useState(false)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const dialogRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const focused = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => focused?.focus()
  }, [])

  React.useEffect(() => {
    let active = true
    setContent(null)
    setError(false)
    const beforeId = mode === 'previous' ? previous!.id : version.id
    const afterId = mode === 'previous' ? version.id : 'current'
    void Promise.all([api.versionContent(documentId, beforeId), api.versionContent(documentId, afterId)])
      .then(([before, after]) => { if (active) setContent({ before: before.content, after: after.content }) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [documentId, version.id, previous?.id, mode, revision])

  const label = (entry: DocumentVersion) => `${entry.name || t.automaticVersion} · ${new Date(entry.createdAt).toLocaleString(language)}`
  const changed = content && (content.before.title !== content.after.title || content.before.text !== content.after.text || content.before.structure !== content.after.structure || JSON.stringify(content.before.board) !== JSON.stringify(content.after.board))

  return <div className="dialog-backdrop diff-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} className="version-diff-dialog" role="dialog" aria-modal="true" aria-labelledby="version-diff-title" dir={direction} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      if (event.key === 'Tab') {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, summary')
        const first = controls?.[0]
        const last = controls?.[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <div className="history-heading"><h2 id="version-diff-title">{t.compareVersions}</h2><button ref={closeRef} className="icon-btn" onClick={onClose} aria-label={t.close}><X size={18} /></button></div>
      <div className="diff-controls"><label>{t.compareWith}<select value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="current">{t.currentDocument}</option><option value="previous" disabled={!previous}>{t.previousVersion}</option></select></label><button onClick={() => setRevision(value => value + 1)}>{t.refreshDiff}</button></div>
      <div className="diff-version-labels"><span><b>{t.before}: </b>{label(mode === 'previous' ? previous! : version)}</span><span><b>{t.after}: </b>{mode === 'previous' ? label(version) : t.currentDocument}</span></div>
      <div className="diff-legend"><span className="diff-added">+ {t.added}</span><span className="diff-removed">− {t.removed}</span></div>
      {error ? <p role="alert" className="auth-error">{t.diffError}</p> : !content ? <p role="status">{t.diffLoading}</p> : !changed ? <p role="status">{t.noDifferences}</p> : <>
        {content.before.title !== content.after.title && <section className="diff-section"><h3>{t.documentTitle}</h3><TextDiff before={content.before.title} after={content.after.title} /></section>}
        <section className="diff-section"><h3>{t.documentTab}</h3>{content.before.text !== content.after.text ? <TextDiff before={content.before.text} after={content.after.text} /> : <p>{t.noTextDifferences}</p>}</section>
        {content.before.structure !== content.after.structure && <details className="diff-section"><summary>{t.formattingDifferences}</summary><div className="diff-rich-previews"><section><h3>{t.before}</h3><RichPreview structure={content.before.structure} /></section><section><h3>{t.after}</h3><RichPreview structure={content.after.structure} /></section></div></details>}
        {JSON.stringify(content.before.board) !== JSON.stringify(content.after.board) && <section className="diff-section"><h3>{t.boardTab}</h3><BoardDiff before={content.before.board} after={content.after.board} /></section>}
      </>}
    </div>
  </div>
}

function TextDiff({ before, after }: { before: string; after: string }) {
  const { t } = useLanguage()
  const changes = React.useMemo(() => diffWordsWithSpace(before, after, { timeout: 100 }) ?? [
    { value: before, removed: true, added: false }, { value: after, added: true, removed: false },
  ], [before, after])
  return <div className="diff-text" dir="auto">{changes.map((part, index) => part.added
    ? <ins key={index} className="diff-added" aria-label={t.added}>{part.value}</ins>
    : part.removed ? <del key={index} className="diff-removed" aria-label={t.removed}>{part.value}</del>
      : <span key={index}>{part.value}</span>)}</div>
}

type RichNode = { node?: string; attributes?: Record<string, unknown>; children?: RichNode[]; text?: { insert: string; attributes?: Record<string, Record<string, unknown>> }[] }

function RichPreview({ structure }: { structure: string }) {
  const render = (node: RichNode, key: number): React.ReactNode => {
    if (node.text) return <React.Fragment key={key}>{node.text.map((part, index) => {
      let text: React.ReactNode = part.insert
      for (const [mark, attributes] of Object.entries(part.attributes ?? {})) {
        const tag = { bold: 'strong', italic: 'em', strike: 's', code: 'code', underline: 'u' }[mark]
        if (tag) text = React.createElement(tag, null, text)
        if (mark === 'link') text = <span className="diff-link">{text}<small> ({String(attributes.href ?? '')})</small></span>
      }
      return <React.Fragment key={index}>{text}</React.Fragment>
    })}</React.Fragment>
    const tag = node.node === 'heading' ? `h${Math.max(1, Math.min(6, Number(node.attributes?.level) || 1))}`
      : ({ paragraph: 'p', bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote', codeBlock: 'pre', hardBreak: 'br', horizontalRule: 'hr' }[node.node ?? ''] ?? 'div')
    const start = Number(node.attributes?.start)
    return React.createElement(tag, { key, ...(tag === 'ol' && Number.isFinite(start) ? { start } : {}) }, ['br', 'hr'].includes(tag) ? undefined : node.children?.map(render))
  }
  return <div className="diff-rich-preview" dir="auto">{(JSON.parse(structure) as RichNode[]).map(render)}</div>
}

function BoardDiff({ before, after }: { before: VersionContent['board']; after: VersionContent['board'] }) {
  const { t } = useLanguage()
  const changes = React.useMemo(() => diffArrays(before.map(stroke => JSON.stringify(stroke)), after.map(stroke => JSON.stringify(stroke)), { timeout: 100 }) ?? [
    { value: before.map(stroke => JSON.stringify(stroke)), removed: true, added: false },
    { value: after.map(stroke => JSON.stringify(stroke)), added: true, removed: false },
  ], [before, after])
  const count = (kind: 'added' | 'removed') => changes.filter(part => part[kind]).reduce((sum, part) => sum + part.value.length, 0)
  const renderBoard = (side: 'before' | 'after') => <svg viewBox="0 0 1000 600" role="img" aria-label={`${t.boardTab}: ${side === 'before' ? t.before : t.after}`}>
    {changes.filter(part => side === 'before' ? !part.added : !part.removed).flatMap((part, partIndex) => part.value.map((value, index) => {
      const stroke = JSON.parse(value) as VersionContent['board'][number]
      return <polyline key={`${partIndex}-${index}`} points={stroke.points.map(point => `${point.x * 1000},${point.y * 600}`).join(' ')} fill="none" stroke={part.added ? '#15803d' : part.removed ? '#b91c1c' : stroke.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={part.removed ? '6 3' : undefined} />
    }))}
  </svg>
  return <><p className="diff-board-counts">+ {count('added')} {t.added} · − {count('removed')} {t.removed}</p><div className="diff-boards"><figure><figcaption>{t.before}</figcaption>{renderBoard('before')}</figure><figure><figcaption>{t.after}</figcaption>{renderBoard('after')}</figure></div></>
}
