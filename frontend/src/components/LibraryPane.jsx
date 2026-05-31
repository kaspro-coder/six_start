import { useState, useEffect, useRef, useMemo } from 'react'
import { FileText, Search, Download, Sparkles, CheckCircle2 } from 'lucide-react'
import DocViewer from './DocViewer.jsx'
import { listKnowledge } from '../lib/api.js'

// Nicer display titles for the known corpus files (fallback cleans the rest).
const TITLES = {
  'Confidential_SIX_master-data-openining-and-mutations-facsheet.pdf': 'Master Data Opening & Mutations Factsheet',
  'EU-MiIFID_six-infographics-mifid-II-reference-data-en.pdf': 'MiFID II Reference Data — Infographic',
  'EU_ESG_jc_2021_50_-_final_report_on_taxonomy-related_product_disclosure_rts.pdf': 'Taxonomy-Related Product Disclosure RTS',
  'EU_MIFIR_CELEX_32014R0600_EN_TXT.pdf': 'MiFIR — Regulation (EU) 600/2014',
  'EU_MiFID_2015-1787_-_guidelines_on_complex_debt_instruments_and_structured_deposits.pdf': 'Guidelines — Complex Debt Instruments & Structured Deposits',
  'EU_MiFID_CELEX_32014L0065_EN_TXT.pdf': 'MiFID II — Directive 2014/65/EU',
  'EU_MiFID_esma35-43-620_guidelines_on_mifid_ii_product_governance_requirements_0.pdf': 'Guidelines — MiFID II Product Governance',
  'EU_SFDR_CELEX_32019R2088_EN_TXT.pdf': 'SFDR — Regulation (EU) 2088/2019',
  'EU_SFDR_jc_2021_03_joint_esas_final_report_on_rts_under_sfdr.pdf': 'Joint ESAs Final Report on RTS under SFDR',
  'Product Coverage transcript (1).docx': 'Product Coverage — Expert Transcript',
  'Regulatory Update transcript.docx': 'Regulatory Update — Expert Transcript',
  'Start Hack ZH_SIX_Presentation.pdf': 'SIX × START Hack Zurich — Presentation',
  'US_FATCA.pdf': 'FATCA — US Regulation',
  'US_six-factsheet-fatca-en.pdf': 'FATCA Factsheet',
  'six-handbook-regulatory-navigator-en.pdf': 'Regulatory Navigator Handbook',
  'six-handbook-tax-navigator-en.pdf': 'Tax Navigator Handbook',
}

function titleOf(name) {
  if (TITLES[name]) return TITLES[name]
  return name
    .replace(/\.(pdf|docx?)$/i, '')
    .replace(/\(\d+\)/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function deptOf(name) {
  const f = name.toLowerCase()
  if (f.includes('master-data') || f.includes('product coverage')) return 'Reference Data Services'
  if (f.includes('sfdr') || f.includes('esg') || f.includes('taxonomy')) return 'Sustainable Finance'
  if (f.includes('mifid') || f.includes('mifir')) return 'Markets & MiFID'
  if (f.includes('regulatory') || (f.includes('navigator') && !f.includes('tax'))) return 'Regulatory Affairs'
  if (f.includes('fatca') || f.includes('tax')) return 'Tax & FATCA'
  if (f.includes('presentation') || f.includes('start hack')) return 'Innovation'
  return 'General'
}

function typeOf(name, sourceType) {
  const f = name.toLowerCase()
  if (f.includes('facsheet') || f.includes('factsheet')) return 'Factsheet'
  if (f.includes('infographic')) return 'Infographic'
  if (f.includes('handbook') || f.includes('navigator')) return 'Handbook'
  if (f.includes('guidelines')) return 'Guidelines'
  if (f.includes('transcript')) return 'Expert Note'
  if (f.includes('presentation')) return 'Presentation'
  if (f.includes('report') || f.includes('rts')) return 'Report'
  if (f.includes('celex') || f.includes('directive')) return 'Regulation'
  if (sourceType === 'tacit_expert_knowledge') return 'Expert Note'
  return 'Document'
}

const GRID = 'grid grid-cols-[minmax(0,1fr)_180px_150px_120px_56px] items-center gap-3'

export default function LibraryPane() {
  const [docs, setDocs]       = useState([])
  const [knowledge, setKnowledge] = useState([])
  const [query, setQuery]     = useState('')
  const [dept, setDept]       = useState('All')
  const [type, setType]       = useState('All')
  const [loading, setLoading] = useState(true)
  const [cite, setCite]       = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/documents').then(r => r.json()),
      listKnowledge().catch(() => ({ persisted: [] })),
    ])
      .then(([documents, knowledgeData]) => {
        if (cancelled) return
        setDocs(documents)
        // Library should show explicit source documents plus knowledge that an
        // expert deliberately saved through the resolution form. Seed knowledge
        // remains available to retrieval, but is not displayed as user-saved library content.
        setKnowledge(knowledgeData.persisted ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [])

  // Enrich each doc with derived display fields.
  const rows = useMemo(() => [
    ...docs.map(d => ({
      ...d,
      row_id: `doc:${d.filename}`,
      row_kind: 'document',
      title: titleOf(d.filename),
      dept: deptOf(d.filename),
      type: typeOf(d.filename, d.source_type),
      searchable: `${d.filename} ${titleOf(d.filename)}`,
    })),
    ...knowledge.map(k => ({
      ...k,
      row_id: `knowledge:${k.id}`,
      row_kind: 'knowledge',
      filename: k.source_file ?? k.id,
      title: k.title,
      dept: k.department ?? 'Company Knowledge',
      type: k.type === 'expert_resolution' ? 'Expert Resolution' : typeLabel(k.type),
      updated: (k.updated_at ?? k.created_at ?? '').slice(0, 10),
      searchable: `${k.title ?? ''} ${k.summary ?? ''} ${k.content ?? ''} ${(k.tags ?? []).join(' ')}`,
    })),
  ], [docs, knowledge])

  const depts = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.dept))).sort()], [rows])
  const types = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.type))).sort()], [rows])

  const filtered = rows.filter(r =>
    (r.searchable ?? '').toLowerCase().includes(query.toLowerCase()) &&
    (dept === 'All' || r.dept === dept) &&
    (type === 'All' || r.type === type)
  )

  // Keep the last cite mounted so the preview can slide out with content intact.
  const open = !!cite
  const lastRef = useRef(null)
  if (cite) lastRef.current = cite
  const shownCite = cite ?? lastRef.current

  return (
    <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden bg-canvas">
      {/* Search + filters */}
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 py-2.5 text-sm outline-none transition-shadow focus:border-six focus:ring-4 focus:ring-six/10"
            />
          </div>
          <FilterSelect value={dept} onChange={setDept} options={depts} />
          <FilterSelect value={type} onChange={setType} options={types} />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="rounded-2xl border border-neutral-200/80 bg-white overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              {/* Column headers */}
              <div className={`${GRID} px-5 py-3.5 border-b border-neutral-100 text-[10px] font-bold uppercase tracking-widest text-neutral-400`}>
                <span>Document</span>
                <span>Dept</span>
                <span>Type</span>
                <span>Updated</span>
                <span />
              </div>

              {loading && <p className="px-5 py-10 text-center text-xs text-neutral-400">Loading…</p>}
              {!loading && filtered.length === 0 && (
                <p className="px-5 py-10 text-center text-xs text-neutral-400">No documents found.</p>
              )}

              {filtered.map(doc => (
                <DocRow
                  key={doc.row_id}
                  doc={doc}
                  active={cite?.document === doc.filename || cite?.knowledge?.id === doc.id}
                  onOpen={() => setCite(doc.row_kind === 'knowledge'
                    ? { knowledge: doc }
                    : { document: doc.filename, source_type: doc.source_type, content: null, page: null })}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preview drawer (slides in from the right) */}
      <div
        onClick={() => setCite(null)}
        className={`absolute inset-0 bg-black/20 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        className={`absolute inset-y-0 right-0 z-10 w-[540px] max-w-[94%] flex flex-col bg-white border-l border-neutral-200/80 shadow-elevated transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {shownCite?.knowledge
          ? <KnowledgeViewer item={shownCite.knowledge} onClose={() => setCite(null)} />
          : shownCite && <DocViewer cite={shownCite} onClose={() => setCite(null)} />}
      </aside>
    </div>
  )
}

function typeLabel(type) {
  return String(type ?? 'Knowledge')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="shrink-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-600 outline-none transition-shadow focus:border-six focus:ring-4 focus:ring-six/10 cursor-pointer"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function DocRow({ doc, active, onOpen }) {
  const isKnowledge = doc.row_kind === 'knowledge'
  return (
    <div
      onClick={onOpen}
      className={`${GRID} px-5 py-3 border-b border-neutral-100/70 last:border-0 cursor-pointer transition-colors ${
        active ? 'bg-neutral-50 shadow-[inset_3px_0_0_0_var(--color-six)]' : 'bg-white hover:bg-neutral-50'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {isKnowledge
          ? <Sparkles size={15} className="shrink-0 text-six" />
          : <FileText size={15} className="shrink-0 text-neutral-300" />}
        <span className="truncate text-sm font-semibold text-ink">{doc.title}</span>
      </div>

      <span>
        <span className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
          {doc.dept}
        </span>
      </span>

      <span className="text-sm text-neutral-500">{doc.type}</span>

      <span className="font-mono text-xs text-neutral-400">{doc.updated ?? '—'}</span>

      <span className="flex items-center justify-end">
        {isKnowledge ? (
          <span className="grid h-7 w-7 place-items-center rounded-lg text-emerald-600">
            <CheckCircle2 size={15} />
          </span>
        ) : (
          <a
            href={`/api/documents/${encodeURIComponent(doc.filename)}`}
            download
            title="Download"
            onClick={e => e.stopPropagation()}
            className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-six"
          >
            <Download size={15} />
          </a>
        )}
      </span>
    </div>
  )
}

function KnowledgeViewer({ item, onClose }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-neutral-100 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-six-light text-six">
          <Sparkles size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-ink">{item.title}</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {typeLabel(item.type)} · {item.department ?? 'Company Knowledge'} · {item.updated ?? 'no date'}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-semibold text-neutral-400 hover:bg-neutral-100 hover:text-ink">
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-slim px-5 py-4 space-y-4">
        {item.summary && (
          <section>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Summary</p>
            <p className="text-sm leading-relaxed text-ink">{item.summary}</p>
          </section>
        )}
        <section>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Reusable knowledge</p>
          <div className="whitespace-pre-wrap rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700">
            {item.content ?? 'No content saved for this knowledge item.'}
          </div>
        </section>
        {item.related_documents?.length > 0 && (
          <section>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Attached documents</p>
            <div className="flex flex-wrap gap-1.5">
              {item.related_documents.map(doc => (
                <span key={doc} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-500">{doc}</span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
