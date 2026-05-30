import { X, Landmark, UserCheck, FileText } from 'lucide-react'

const SOURCE_META = {
  official_rulebook:      { Icon: Landmark,  label: 'Official Rulebook',    cls: 'bg-neutral-100 text-neutral-600' },
  tacit_expert_knowledge: { Icon: UserCheck, label: 'Expert Knowledge',     cls: 'bg-six-light text-six' },
}

export default function DocViewer({ cite, onClose }) {
  if (!cite) return null

  const meta    = SOURCE_META[cite.source_type] ?? { Icon: FileText, label: 'Document', cls: 'bg-neutral-100 text-neutral-600' }
  const isPdf   = cite.document?.toLowerCase().endsWith('.pdf')
  const isDocx  = cite.document?.toLowerCase().endsWith('.docx')
  const hasPage = isPdf && cite.page != null

  let docUrl
  if (isDocx) {
    docUrl = `/api/documents/${encodeURIComponent(cite.document)}/html`
  } else if (hasPage) {
    docUrl = `/api/documents/${encodeURIComponent(cite.document)}/pages/${cite.page}`
  } else {
    docUrl = `/api/documents/${encodeURIComponent(cite.document)}`
  }

  return (
    <div className="flex flex-col h-full border-l border-neutral-200/80 bg-white animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 py-3 border-b border-neutral-100 shrink-0">
        <div className="flex-1 min-w-0">
          <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-1 ${meta.cls}`}>
            <meta.Icon size={10} />
            {meta.label}
          </div>
          <p className="text-xs font-semibold text-ink truncate">{cleanName(cite.document)}</p>
          {hasPage && (
            <p className="text-[10px] text-neutral-400 mt-0.5">Page {cite.page + 1} · showing ±1 page window</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-ink transition-colors shrink-0"
        >
          <X size={13} />
        </button>
      </div>

      {/* Relevant chunk */}
      {cite.content && (
        <div className="px-4 py-3 border-b border-neutral-100 shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Relevant excerpt</p>
          <blockquote className="text-xs leading-relaxed text-ink bg-six-light/60 border-l-2 border-six px-3 py-2 rounded-r-lg">
            {cite.content.slice(0, 400)}{cite.content.length > 400 ? '…' : ''}
          </blockquote>
        </div>
      )}

      {/* Document */}
      <div className="flex-1 min-h-0">
        {isPdf || isDocx ? (
          <iframe
            src={docUrl}
            className="w-full h-full border-0"
            title={cite.document}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <FileText size={28} className="text-neutral-300" />
            <p className="text-xs font-semibold text-ink">{cleanName(cite.document)}</p>
            <p className="text-[10px] text-neutral-400">Preview not available for this file type.</p>
            <a
              href={`/api/documents/${encodeURIComponent(cite.document)}`}
              download={cite.document}
              className="mt-1 text-[11px] font-semibold text-six hover:underline"
            >
              Download file
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function cleanName(doc) {
  return String(doc).split('/').pop().replace(/\.(pdf|docx?|txt)$/i, '').replace(/[-_]/g, ' ')
}
