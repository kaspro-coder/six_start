import { useState, useEffect } from 'react'
import { FileText, Landmark, UserCheck, Search, X } from 'lucide-react'
import DocViewer from './DocViewer.jsx'

export default function LibraryPane() {
  const [docs, setDocs]       = useState([])
  const [query, setQuery]     = useState('')
  const [loading, setLoading] = useState(true)
  const [cite, setCite]       = useState(null)

  useEffect(() => {
    fetch('/api/documents')
      .then(r => r.json())
      .then(data => { setDocs(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = docs.filter(d =>
    d.filename.toLowerCase().includes(query.toLowerCase())
  )

  const official = filtered.filter(d => d.source_type === 'official_rulebook')
  const expert   = filtered.filter(d => d.source_type === 'tacit_expert_knowledge')

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Document list ─────────────────────────────────────────── */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden transition-all ${cite ? 'max-w-[420px]' : ''}`}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 shrink-0 border-b border-neutral-100">
          <h1 className="font-display font-bold text-ink text-base mb-3">Knowledge Library</h1>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50/60 pl-8 pr-3 py-1.5 text-xs outline-none transition-shadow focus:bg-white focus:border-six focus:ring-4 focus:ring-six/10"
            />
          </div>
        </div>

        {/* Lists */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {loading && (
            <p className="text-xs text-neutral-400 text-center py-8">Loading…</p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-xs text-neutral-400 text-center py-8">No documents found.</p>
          )}

          {official.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Landmark size={11} className="text-neutral-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Official Rulebook</p>
              </div>
              <div className="space-y-1.5">
                {official.map(doc => (
                  <DocCard key={doc.filename} doc={doc} onOpen={setCite} active={cite?.document === doc.filename} />
                ))}
              </div>
            </section>
          )}

          {expert.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <UserCheck size={11} className="text-six" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-six">Expert Knowledge</p>
              </div>
              <div className="space-y-1.5">
                {expert.map(doc => (
                  <DocCard key={doc.filename} doc={doc} onOpen={setCite} active={cite?.document === doc.filename} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── Document viewer ───────────────────────────────────────── */}
      {cite && (
        <div className="w-[520px] shrink-0 flex flex-col overflow-hidden border-l border-neutral-200/80">
          <DocViewer cite={cite} onClose={() => setCite(null)} />
        </div>
      )}
    </div>
  )
}

function DocCard({ doc, onOpen, active }) {
  const isExpert = doc.source_type === 'tacit_expert_knowledge'
  const label    = doc.filename.replace(/\.(pdf|docx?)$/i, '').replace(/[-_]/g, ' ')

  return (
    <button
      onClick={() => onOpen({ document: doc.filename, source_type: doc.source_type, content: null, page: null })}
      className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all ${
        active
          ? 'border-six/30 bg-six-light shadow-none'
          : 'border-neutral-200/70 bg-white hover:border-six/20 hover:bg-neutral-50 shadow-card'
      }`}
    >
      <div className={`mt-0.5 shrink-0 h-7 w-7 rounded-lg grid place-items-center ${
        isExpert ? 'bg-six-light' : 'bg-neutral-100'
      }`}>
        {isExpert
          ? <UserCheck size={13} className="text-six" />
          : <Landmark size={13} className="text-neutral-500" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-ink leading-snug line-clamp-2">{label}</p>
        <p className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-wide">
          {doc.file_type} · {doc.size_kb} KB
        </p>
      </div>
    </button>
  )
}
