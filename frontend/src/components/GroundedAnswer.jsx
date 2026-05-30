import { useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  ShieldCheck, Landmark, UserCheck, FileText, User, ArrowUpRight, ArrowRight,
  ClipboardList, ScrollText, MessageCircle, StickyNote, AlertTriangle, Sparkles,
  Layers, Building2, Clock, Gauge, BookOpen, MessageSquarePlus, ExternalLink,
  Check, Copy, MapPin,
} from 'lucide-react'

// ── Visual vocabulary ────────────────────────────────────────────────────
const SOURCE_META = {
  official_rulebook:      { Icon: Landmark,      label: 'Official Rulebook' },
  document:               { Icon: Landmark,      label: 'Official Rulebook' },
  tacit_expert_knowledge: { Icon: UserCheck,     label: 'Expert Knowledge' },
  runbook:                { Icon: ClipboardList, label: 'Runbook' },
  policy:                 { Icon: ScrollText,    label: 'Policy' },
  resolved_question:      { Icon: MessageCircle, label: 'Resolved Question' },
  expert_note:            { Icon: StickyNote,    label: 'Expert Note' },
  incident:               { Icon: AlertTriangle, label: 'Incident' },
  expert_resolution:      { Icon: Sparkles,      label: 'Expert Resolution' },
}
const sourceMeta = (t) => SOURCE_META[t] ?? { Icon: FileText, label: 'Source' }

const TRUST_META = {
  verified: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Verified' },
  draft:    { cls: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'Draft' },
  stale:    { cls: 'bg-orange-50 text-orange-700 border-orange-200',     label: 'Stale' },
  unknown:  { cls: 'bg-neutral-50 text-neutral-500 border-neutral-200',  label: 'Unverified' },
}
const trustMeta = (t) => TRUST_META[t] ?? TRUST_META.unknown

const CONF_META = {
  high:   { cls: 'bg-emerald-500 text-white', dot: 'bg-emerald-200', label: 'High confidence' },
  medium: { cls: 'bg-amber-500 text-white',   dot: 'bg-amber-200',   label: 'Medium confidence' },
  low:    { cls: 'bg-red-500 text-white',     dot: 'bg-red-200',     label: 'Low confidence' },
}
const confMeta = (c) => CONF_META[c] ?? CONF_META.low

function cleanDoc(doc) {
  return String(doc ?? '').split('/').pop().replace(/\.(md|txt|pdf|json|html?|docx?)$/i, '')
}
function relTime(iso) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (!Number.isFinite(days)) return null
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

// Inline [n] citations — clickable, opens the doc viewer
function citationClasses(source) {
  const type = source?.source_type
  if (type === 'official_rulebook' || type === 'document' || type === 'policy') {
    return 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
  }
  if (type === 'expert_resolution' || type === 'resolved_question') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
  }
  if (type === 'tacit_expert_knowledge' || type === 'expert_note' || type === 'runbook') {
    return 'border-six/25 bg-six-light text-six hover:bg-six hover:text-white'
  }
  return 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
}

function Cite({ n, source, onClick }) {
  const meta = sourceMeta(source?.source_type)
  const freshness = relTime(source?.updated_at) || source?.page_or_line || 'freshness unavailable'
  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={() => source && onClick?.(source)}
            disabled={!source}
            className={`ml-0.5 inline-flex align-super rounded border px-1 font-mono text-[10px] font-bold transition-colors active:opacity-70 disabled:cursor-default disabled:opacity-60 ${citationClasses(source)}`}
            type="button"
          >
            [{n}]
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            className="z-[120] max-w-xs rounded-xl border border-neutral-800 bg-ink px-3 py-2 text-left text-[11px] leading-relaxed text-white shadow-elevated"
          >
            <p className="font-bold">{meta.label}</p>
            <p className="mt-0.5 text-neutral-300">Freshness: {freshness}</p>
            {source?.title && <p className="mt-1 font-semibold text-white">{source.title}</p>}
            {source?.relevant_quote && (
              <p className="mt-1 text-neutral-300">"{source.relevant_quote.slice(0, 180)}{source.relevant_quote.length > 180 ? '...' : ''}"</p>
            )}
            <Tooltip.Arrow className="fill-ink" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
function InlineCitations({ text, sources, onCiteClick }) {
  return String(text ?? '').split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/)
    if (!m) return <span key={i}>{part}</span>
    const n = Number(m[1])
    return <Cite key={i} n={n} source={sources.find(s => s.index === n)} onClick={onCiteClick} />
  })
}

function SectionLabel({ children }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
      {children}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function GroundedAnswer({ data, onAsk, onCiteClick, onSelectExpert, onEscalate }) {
  const sources = data.document_citations ?? []
  const experts = data.expert_citations ?? []
  const esc = data.escalation
  const isEscalation = data.display_format === 'escalation_needed' || esc?.needed
  const conf = confMeta(data.confidence)
  const [showExperts, setShowExperts] = useState(false)

  return (
    <div className="relative inline-block w-full max-w-[560px] text-left bg-white rounded-2xl rounded-tl-md border border-neutral-200/80 shadow-card overflow-hidden">
      <span className="absolute top-0 left-0 h-1.5 w-1.5 bg-six" />

      {/* Header: brand + confidence badge */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 border-b border-neutral-100">
        <span className="grid h-4 w-4 place-items-center rounded-md bg-six">
          <span className="h-1 w-1 rounded-[1px] bg-white/90" />
        </span>
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-ink">SIXsens</span>
        <span className="text-[10px] text-neutral-400">knowledge copilot</span>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${conf.cls}`}>
          <Gauge size={10} /> {data.confidence}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* ── Answer ─────────────────────────────────────────── */}
        <Answer data={data} sources={sources} onCiteClick={onCiteClick} />

        {/* ── Escalation block (when routing to an expert) ─────── */}
        {isEscalation && esc && (
          <EscalationBlock esc={esc} onSelectExpert={onSelectExpert} onEscalate={() => onEscalate?.(esc)} />
        )}

        {/* ── Sources (small chips; expand to full card on click) ─ */}
        <SourcePanel sources={sources} onCiteClick={onCiteClick} />

        {/* ── Confidence & limitations ───────────────────────── */}
        <ConfidencePanel
          level={data.confidence}
          reason={data.confidence_reason}
          limitations={data.limitations}
        />

        {/* ── Next best actions ──────────────────────────────── */}
        <NextBestActions
          actions={data.next_best_actions}
          sources={sources}
          experts={experts}
          onAsk={onAsk}
          onCiteClick={onCiteClick}
          onSelectExpert={onSelectExpert}
          onEscalate={() => onEscalate?.(esc)}
        />

        {/* ── Experts (collapsed; small toggle at bottom-right) ── */}
        {experts.length > 0 && (
          <div className="border-t border-neutral-100 pt-2.5">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowExperts(v => !v)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  showExperts
                    ? 'border-six bg-six-light text-six'
                    : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-six/50 hover:text-six'
                }`}
              >
                <User size={11} /> Experts ({experts.length})
              </button>
            </div>
            {showExperts && <ExpertCards experts={experts} onSelectExpert={onSelectExpert} />}
          </div>
        )}
      </div>
    </div>
  )
}

function Answer({ data, sources, onCiteClick }) {
  const steps = data.steps ?? []
  return (
    <div>
      <p className="text-xs leading-relaxed text-ink">
        <InlineCitations text={data.answer} sources={sources} onCiteClick={onCiteClick} />
      </p>
      {steps.length > 0 && (
        <ol className="mt-2.5 space-y-2">
          {steps.map((st, i) => (
            <li key={i} className="flex gap-2 text-xs">
              <span className="shrink-0 h-4 w-4 rounded-full bg-six text-white text-[9px] font-bold flex items-center justify-center mt-px">{i + 1}</span>
              <span className="text-ink leading-relaxed">
                {st.text}
                {(st.citations ?? []).map(c => (
                  <Cite key={c} n={c} source={sources.find(s => s.index === c)} onClick={onCiteClick} />
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function EscalationBlock({ esc, onSelectExpert, onEscalate }) {
  const top = esc.experts?.[0]
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white">
        <AlertTriangle size={12} />
        <span className="text-[11px] font-bold tracking-wide">Expert escalation recommended</span>
      </div>
      <div className="px-3 py-2.5 space-y-2">
        {esc.recommendation && (
          <p className="text-[11px] leading-relaxed text-amber-900">{esc.recommendation}</p>
        )}
        {esc.reasons?.length > 0 && (
          <ul className="space-y-0.5">
            {esc.reasons.map((r, i) => (
              <li key={i} className="flex gap-1.5 text-[10px] text-amber-800">
                <span className="mt-1 h-1 w-1 rounded-full bg-amber-500 shrink-0" /> {r}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {top && (
            <button
              onClick={() => onSelectExpert?.(top)}
              className="inline-flex items-center gap-1 rounded-lg bg-ink px-2.5 py-1 text-[10px] font-bold text-white hover:bg-black transition-all active:scale-95"
            >
              <User size={11} /> Contact {top.expert_name}
            </button>
          )}
          <button
            onClick={() => onEscalate?.(esc)}
            className="inline-flex items-center gap-1 rounded-lg bg-six px-2.5 py-1 text-[10px] font-bold text-white shadow-six-glow hover:bg-six-dark transition-all active:scale-95"
          >
            <MessageSquarePlus size={11} /> Send knowledge request
          </button>
        </div>
      </div>
    </div>
  )
}

function SourcePanel({ sources, onCiteClick }) {
  const [open, setOpen] = useState(() => new Set())
  if (!sources?.length) return null
  const toggle = (idx) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(idx)) next.delete(idx); else next.add(idx)
    return next
  })
  return (
    <div className="border-t border-neutral-100 pt-2.5">
      <SectionLabel>Sources</SectionLabel>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sources.map((s) => {
          const meta = sourceMeta(s.source_type)
          const isOpen = open.has(s.index)
          return (
            <button
              key={s.index}
              type="button"
              onClick={() => toggle(s.index)}
              className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition-colors ${
                isOpen
                  ? 'border-six bg-six-light text-six'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-six/50 hover:text-six'
              }`}
            >
              <meta.Icon size={10} className={isOpen ? 'text-six' : 'text-neutral-400'} />
              <span className="font-mono">[{s.index}]</span>
              <span className="max-w-[150px] truncate">{s.title || cleanDoc(s.document)}</span>
            </button>
          )
        })}
      </div>
      {open.size > 0 && (
        <div className="mt-2 space-y-1.5">
          {sources.filter((s) => open.has(s.index)).map((s) => (
            <SourceCard key={s.index} s={s} onCiteClick={onCiteClick} />
          ))}
        </div>
      )}
    </div>
  )
}

function SourceCard({ s, onCiteClick }) {
  const meta = sourceMeta(s.source_type)
  const trust = trustMeta(s.trust_level)
  const updated = relTime(s.updated_at)
  const canOpen = !!s.document
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-2.5">
      <div className="flex items-start gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-500">
          <meta.Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-neutral-400">[{s.index}]</span>
            <span className="truncate text-xs font-semibold text-ink">{s.title || cleanDoc(s.document)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">{meta.label}</span>
            <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9px] font-bold ${trust.cls}`}>{trust.label}</span>
            {s.department && <span className="text-[9px] text-neutral-400">· {s.department}</span>}
            {updated && <span className="inline-flex items-center gap-0.5 text-[9px] text-neutral-400"><Clock size={8} /> {updated}</span>}
            {typeof s.relevance_score === 'number' && (
              <span className="text-[9px] font-mono text-neutral-400">· {s.relevance_score.toFixed(1)}</span>
            )}
          </div>
        </div>
      </div>
      {s.relevant_quote && (
        <blockquote className="mt-1.5 text-[11px] leading-relaxed text-neutral-600 bg-neutral-50 border-l-2 border-six/40 px-2 py-1 rounded-r">
          {s.relevant_quote.slice(0, 180)}{s.relevant_quote.length > 180 ? '…' : ''}
        </blockquote>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {s.reason && <p className="text-[9px] italic text-neutral-400 truncate flex-1">Why: {s.reason}</p>}
        {canOpen && (
          <button
            onClick={() => onCiteClick?.(s)}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-neutral-200 px-1.5 py-0.5 text-[9px] font-semibold text-six hover:border-six hover:bg-six-light transition-all"
          >
            <ExternalLink size={9} /> {s.page_or_line?.startsWith('page') ? s.page_or_line : 'Open'}
          </button>
        )}
      </div>
    </div>
  )
}

function ExpertCards({ experts, onSelectExpert }) {
  return (
    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {experts.map((e) => (
          <article key={e.id ?? e.email} className="rounded-xl border border-six/25 bg-six-light/50 p-2.5">
            <div className="flex items-start gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-six text-white">
                <User size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-ink">{e.expert_name}</p>
                <p className="truncate text-[10px] text-neutral-500">{e.role_title}</p>
              </div>
              {typeof e.knowledge_score === 'number' && (
                <span className="shrink-0 rounded bg-white px-1 py-0.5 text-[9px] font-bold text-six">
                  {Math.round(e.knowledge_score * 100)}
                </span>
              )}
            </div>
            {e.best_for && (
              <p className="mt-1.5 text-[10px] leading-snug text-neutral-600">
                <span className="font-semibold text-neutral-500">Best for:</span> {e.best_for}
              </p>
            )}
            {e.reason && <p className="mt-1 text-[9px] italic text-neutral-400 line-clamp-2">{e.reason}</p>}
            <button
              onClick={() => onSelectExpert?.(e)}
              className="mt-2 w-full rounded-lg bg-six px-2 py-1 text-[10px] font-bold text-white shadow-six-glow hover:bg-six-dark transition-colors active:scale-95"
            >
              Contact Expert
            </button>
          </article>
        ))}
    </div>
  )
}

function ConfidencePanel({ level, reason, limitations }) {
  const conf = confMeta(level)
  return (
    <div className="border-t border-neutral-100 pt-2.5">
      <SectionLabel>Confidence</SectionLabel>
      <div className="mt-1.5 flex items-start gap-2">
        <span className={`mt-px inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shrink-0 ${conf.cls}`}>
          <Gauge size={10} /> {level}
        </span>
        <p className="text-[11px] leading-relaxed text-neutral-600">{reason}</p>
      </div>
      {limitations?.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {limitations.map((l, i) => (
            <li key={i} className="flex gap-1.5 text-[10px] text-neutral-500">
              <AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber-500" /> {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NextBestActions({ actions, sources, experts, onAsk, onCiteClick, onSelectExpert, onEscalate }) {
  if (!actions?.length) return null
  function run(a) {
    switch (a.type) {
      case 'open_document': {
        const s = sources.find(x => String(x.index) === String(a.target_id))
        if (s) onCiteClick?.(s)
        break
      }
      case 'contact_expert': {
        const e = experts.find(x => x.id === a.target_id) ?? experts[0]
        if (e) onSelectExpert?.(e)
        break
      }
      case 'create_knowledge_request':
        onEscalate?.()
        break
      case 'ask_follow_up':
        onAsk?.(a.suggested_prompt ?? a.label)
        break
      default:
        break
    }
  }
  const ICON = {
    open_document: BookOpen, contact_expert: User,
    create_knowledge_request: MessageSquarePlus, ask_follow_up: ArrowUpRight,
    save_knowledge: Sparkles,
  }
  return (
    <div className="border-t border-neutral-100 pt-2.5">
      <SectionLabel>Next best actions</SectionLabel>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {actions.map((a, i) => {
          const Icon = ICON[a.type] ?? ArrowRight
          const primary = a.type === 'create_knowledge_request' || a.type === 'contact_expert'
          return (
            <button
              key={i}
              onClick={() => run(a)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all active:scale-95 ${
                primary
                  ? 'bg-six text-white shadow-six-glow hover:bg-six-dark'
                  : 'border border-neutral-200 text-neutral-600 hover:border-six hover:text-six'
              }`}
            >
              <Icon size={11} /> {a.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

