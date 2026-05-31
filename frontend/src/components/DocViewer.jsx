import { X, Landmark, UserCheck, FileText } from 'lucide-react'

const SOURCE_META = {
  official_rulebook: { Icon: Landmark, label: 'Official Rulebook', cls: 'bg-neutral-100 text-neutral-600' },
  tacit_expert_knowledge: { Icon: UserCheck, label: 'Expert Knowledge', cls: 'bg-six-light text-six' },
  document: { Icon: Landmark, label: 'Official Rulebook', cls: 'bg-neutral-100 text-neutral-600' },
  runbook: { Icon: UserCheck, label: 'Runbook', cls: 'bg-six-light text-six' },
  expert_note: { Icon: UserCheck, label: 'Expert Note', cls: 'bg-six-light text-six' },
}

export default function DocViewer({ cite, onClose }) {
  if (!cite) return null

  const meta = SOURCE_META[cite.source_type] ?? { Icon: FileText, label: 'Document', cls: 'bg-neutral-100 text-neutral-600' }
  const isPdf = cite.document?.toLowerCase().endsWith('.pdf')
  const isDocx = cite.document?.toLowerCase().endsWith('.docx')
  const hasPage = isPdf && cite.page != null
  const highlights = Array.isArray(cite.demo_highlights) ? cite.demo_highlights : []

  let docUrl
  if (isDocx) {
    docUrl = `/api/documents/${encodeURIComponent(cite.document)}/html`
  } else if (hasPage && cite.demo_pdf_highlight && cite.source_id) {
    docUrl = `/api/documents/${encodeURIComponent(cite.document)}/pages/${cite.page}/highlighted/${encodeURIComponent(cite.source_id)}`
  } else if (hasPage) {
    docUrl = `/api/documents/${encodeURIComponent(cite.document)}/pages/${cite.page}`
  } else if (cite.document) {
    docUrl = `/api/documents/${encodeURIComponent(cite.document)}`
  }

  return (
    <div className="flex h-full flex-col border-l border-neutral-200/80 bg-white animate-fade-in">
      <div className="flex shrink-0 items-start gap-2 border-b border-neutral-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className={`mb-1 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.cls}`}>
            <meta.Icon size={10} />
            {meta.label}
          </div>
          <p className="truncate text-xs font-semibold text-ink">{cleanName(cite.document ?? cite.title ?? 'Knowledge source')}</p>
          {hasPage && (
            <p className="mt-0.5 text-[10px] text-neutral-400">Cited page {cite.page + 1} · showing surrounding pages</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-ink"
          type="button"
        >
          <X size={13} />
        </button>
      </div>

      {(cite.content || highlights.length > 0) && !cite.demo_pdf_highlight && (
        <div className="shrink-0 border-b border-neutral-100 px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              {highlights.length > 0 ? 'Highlighted evidence' : 'Relevant excerpt'}
            </p>
            {highlights.length > 0 && (
              <span className="rounded-full bg-six px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                demo highlight
              </span>
            )}
          </div>
          {cite.content && (
            <blockquote className="text-xs leading-relaxed text-ink bg-six-light border-l-2 border-six px-3 py-2 rounded-r-lg">
              <HighlightedText text={cite.content.slice(0, 500)} highlights={highlights} />
              {cite.content.length > 500 ? '...' : ''}
            </blockquote>
          )}
          {highlights.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {highlights.map(h => (
                <span key={h} className="rounded-md border border-six/25 bg-white px-2 py-1 text-[10px] font-semibold text-six shadow-sm">
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {cite.demo_pdf_highlight && (
        <div className="shrink-0 border-b border-neutral-100 bg-six-light px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-six">
              Highlighted directly on the cited PDF page
            </p>
            <span className="rounded-full bg-six px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              page evidence
            </span>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {isPdf || isDocx ? (
          <iframe
            src={docUrl}
            className="h-full w-full border-0"
            title={cite.document}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <FileText size={28} className="text-neutral-300" />
            <p className="text-xs font-semibold text-ink">{cleanName(cite.document ?? cite.title ?? 'Knowledge source')}</p>
            <p className="text-[10px] text-neutral-400">Preview not available for this source.</p>
            {cite.document && (
              <a
                href={`/api/documents/${encodeURIComponent(cite.document)}`}
                download={cite.document}
                className="mt-1 text-[11px] font-semibold text-six hover:underline"
              >
                Download file
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function HighlightedText({ text, highlights }) {
  if (!highlights?.length) return text

  const escaped = highlights
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  if (!escaped.length) return text

  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  return String(text).split(re).map((part, i) => {
    const isHit = highlights.some(h => h.toLowerCase() === part.toLowerCase())
    if (!isHit) return <span key={i}>{part}</span>
    return (
      <mark key={i} className="rounded bg-six px-1 py-0.5 font-semibold text-white">
        {part}
      </mark>
    )
  })
}

function cleanName(doc) {
  return String(doc).split('/').pop().replace(/\.(pdf|docx?|txt)$/i, '').replace(/[-_]/g, ' ')
}
