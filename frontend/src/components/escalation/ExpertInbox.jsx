import { useState, useEffect, useCallback } from 'react'
import {
  Inbox, ArrowLeft, User, Clock, AlertTriangle, CheckCircle2, Sparkles,
  ClipboardList, Loader2, Plus, X, RefreshCw,
} from 'lucide-react'
import { listKnowledgeRequests, resolveKnowledgeRequest } from '../../lib/api.js'

const STATUS_META = {
  open:                  { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Open' },
  in_review:             { cls: 'bg-blue-50 text-blue-700 border-blue-200',     label: 'In review' },
  resolved:              { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Resolved' },
  converted_to_knowledge:{ cls: 'bg-six-light text-six border-six/30',          label: 'Knowledge' },
}
const PRIORITY_CLS = { high: 'text-red-600', medium: 'text-amber-600', low: 'text-neutral-400' }

// Expert-facing inbox (spec 11 §4-6 + §8). Lists routed knowledge requests;
// opening one lets the expert log a resolution that becomes reusable knowledge.
export default function ExpertInbox({ refreshSignal, onChanged }) {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await listKnowledgeRequests()
      setRequests(data.requests ?? [])
      setError(null)
    } catch (err) {
      setError(err.message)
      setRequests([])
    }
  }, [])

  // Refetch on mount and whenever a request is sent/resolved elsewhere.
  useEffect(() => { refresh() }, [refresh, refreshSignal])

  if (viewing) {
    return (
      <RequestDetail
        request={viewing}
        onBack={() => setViewing(null)}
        onResolved={async () => { await refresh(); onChanged?.() }}
      />
    )
  }

  const open = (requests ?? []).filter(r => r.status === 'open' || r.status === 'in_review')
  const closed = (requests ?? []).filter(r => r.status === 'resolved' || r.status === 'converted_to_knowledge')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
          {open.length} open · {closed.length} resolved
        </span>
        <button onClick={refresh} className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-ink transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-slim">
        {requests === null ? (
          <Centered><Loader2 size={22} className="animate-spin text-six" /><p className="text-xs text-neutral-400">Loading inbox…</p></Centered>
        ) : error ? (
          <Centered><AlertTriangle size={22} className="text-amber-500" /><p className="text-xs text-neutral-500">{error}</p></Centered>
        ) : requests.length === 0 ? (
          <Centered>
            <Inbox size={28} className="text-neutral-300" />
            <p className="font-display text-sm font-bold text-ink">Inbox is empty</p>
            <p className="max-w-[240px] text-xs text-neutral-400">When the assistant escalates a question, the knowledge request lands here for the routed expert.</p>
          </Centered>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {[...open, ...closed].map(r => (
              <RequestRow key={r.id} request={r} onOpen={() => setViewing(r)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function isRecent(iso, minutes = 10) {
  if (!iso) return false
  return (Date.now() - new Date(iso).getTime()) < minutes * 60000
}

function RequestRow({ request, onOpen }) {
  const status = STATUS_META[request.status] ?? STATUS_META.open
  const isNew = request.status === 'open' && isRecent(request.created_at)
  return (
    <li>
      <button onClick={onOpen} className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${isNew ? 'bg-six-light/40 hover:bg-six-light/60' : 'hover:bg-neutral-50'}`}>
        <span className="relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-six-light">
          {request.status === 'converted_to_knowledge'
            ? <Sparkles size={13} className="text-six" />
            : <ClipboardList size={13} className="text-six" />}
          {isNew && (
            <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-six animate-pulse-ring" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-six" />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold leading-snug text-ink">{request.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-neutral-400">
            {isNew && <span className="inline-flex items-center rounded-full bg-six px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">New</span>}
            <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9px] font-bold ${status.cls}`}>{status.label}</span>
            <span className={`font-semibold capitalize ${PRIORITY_CLS[request.priority] ?? ''}`}>{request.priority}</span>
            {request.domain_tags?.[0] && <span>· {request.domain_tags[0]}</span>}
          </p>
        </div>
        <ArrowLeft size={13} className="mt-1 shrink-0 rotate-180 text-neutral-300 group-hover:text-six transition-colors" />
      </button>
    </li>
  )
}

function RequestDetail({ request, onBack, onResolved }) {
  const resolved = request.status === 'resolved' || request.status === 'converted_to_knowledge'
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
        <button onClick={onBack} className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-ink transition-colors">
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink">{request.title}</p>
          <p className="font-mono text-[10px] text-neutral-400">#{request.id}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-slim px-4 py-4 space-y-4">
        <Field label="Question"><p className="text-xs text-ink">{request.question}</p></Field>
        {request.context_summary && (
          <Field label="Context"><p className="text-[11px] leading-relaxed text-neutral-500">{request.context_summary}</p></Field>
        )}
        {request.related_source_ids?.length > 0 && (
          <Field label={`Related sources (${request.related_source_ids.length})`}>
            <div className="flex flex-wrap gap-1">
              {request.related_source_ids.map((id, i) => (
                <span key={i} className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[9px] text-neutral-500">{id}</span>
              ))}
            </div>
          </Field>
        )}
        {request.notes && <Field label="Requester notes"><p className="text-[11px] text-neutral-500">{request.notes}</p></Field>}

        {resolved
          ? <ResolvedView request={request} />
          : <ResolutionLogger request={request} onResolved={onResolved} />}
      </div>
    </div>
  )
}

// ── Resolution logging form (spec 11 §5) ─────────────────────────────────
function ResolutionLogger({ request, onResolved }) {
  const [summary, setSummary] = useState('')
  const [detailed, setDetailed] = useState('')
  const [steps, setSteps] = useState([''])
  const [tags, setTags] = useState((request.domain_tags ?? []).join(', '))
  const [confidence, setConfidence] = useState('high')
  const [reusable, setReusable] = useState(true)
  const [state, setState] = useState('editing') // editing | sending | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  function setStep(i, v) { setSteps(s => s.map((x, j) => j === i ? v : x)) }
  function addStep() { setSteps(s => [...s, '']) }
  function removeStep(i) { setSteps(s => s.filter((_, j) => j !== i)) }

  async function submit() {
    setState('sending'); setError(null)
    try {
      const res = await resolveKnowledgeRequest(request.id, {
        expert_id: request.routed_expert_ids?.[0],
        summary_answer: summary,
        detailed_resolution: detailed,
        steps_taken: steps.map(s => s.trim()).filter(Boolean),
        new_tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        confidence,
        reusable_knowledge_title: request.title,
        make_reusable: reusable,
      })
      setResult(res)
      setState('done')
      onResolved?.(res)
    } catch (err) {
      setError(err.message)
      setState('error')
    }
  }

  if (state === 'done' && result) {
    return <ClosedLoop result={result} />
  }

  const previewItem = {
    title: request.title,
    summary: summary || '—',
    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    trust_level: confidence === 'high' ? 'verified' : 'draft',
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 space-y-3">
      <div className="flex items-center gap-1.5">
        <ClipboardList size={13} className="text-six" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink">Log resolution</span>
      </div>

      <Labeled label="Short answer">
        <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="The bottom line, one sentence" className={inputCls} />
      </Labeled>
      <Labeled label="Detailed resolution">
        <textarea value={detailed} onChange={e => setDetailed(e.target.value)} placeholder="The full explanation future colleagues will read" className={`${inputCls} min-h-20 resize-none`} />
      </Labeled>

      <Labeled label="Steps taken">
        <div className="space-y-1.5">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-six text-[9px] font-bold text-white">{i + 1}</span>
              <input value={s} onChange={e => setStep(i, e.target.value)} placeholder={`Step ${i + 1}`} className={inputCls} />
              {steps.length > 1 && (
                <button onClick={() => removeStep(i)} className="grid h-5 w-5 shrink-0 place-items-center rounded text-neutral-300 hover:text-red-500"><X size={12} /></button>
              )}
            </div>
          ))}
          <button onClick={addStep} className="inline-flex items-center gap-1 text-[10px] font-semibold text-six hover:underline"><Plus size={11} /> Add step</button>
        </div>
      </Labeled>

      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Tags (comma-separated)">
          <input value={tags} onChange={e => setTags(e.target.value)} className={inputCls} />
        </Labeled>
        <Labeled label="Confidence">
          <div className="flex gap-1">
            {['high', 'medium', 'low'].map(c => (
              <button key={c} onClick={() => setConfidence(c)} className={`flex-1 rounded-lg border px-1 py-1.5 text-[10px] font-semibold capitalize transition-colors ${confidence === c ? 'border-six bg-six-light text-six' : 'border-neutral-200 text-neutral-500'}`}>{c}</button>
            ))}
          </div>
        </Labeled>
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 cursor-pointer">
        <input type="checkbox" checked={reusable} onChange={e => setReusable(e.target.checked)} className="accent-six" />
        <span className="text-[11px] font-medium text-ink">Save as reusable company knowledge</span>
      </label>

      {reusable && <ReusableKnowledgePreview item={previewItem} />}

      {state === 'error' && <p className="text-[11px] text-red-600">Could not save: {error}</p>}

      <button
        onClick={submit}
        disabled={state === 'sending' || !summary.trim()}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-six px-4 py-2 text-xs font-semibold text-white shadow-six-glow hover:bg-six-dark disabled:opacity-50 transition-colors active:scale-95"
      >
        {state === 'sending' ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={13} /> Resolve & save knowledge</>}
      </button>
    </div>
  )
}

// ── Preview of how the knowledge item will look once saved (spec 11 §5) ───
function ReusableKnowledgePreview({ item }) {
  return (
    <div className="rounded-xl border border-six/25 bg-six-light/40 p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles size={11} className="text-six" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-six">Reusable knowledge preview</span>
      </div>
      <p className="text-xs font-semibold text-ink">{item.title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-600">{item.summary}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className={`rounded border px-1 py-px text-[9px] font-bold ${item.trust_level === 'verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {item.trust_level === 'verified' ? 'Verified' : 'Draft'}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-six">Expert Resolution</span>
        {item.tags.map((t, i) => (
          <span key={i} className="rounded bg-white px-1.5 py-px text-[9px] text-neutral-500">{t}</span>
        ))}
      </div>
    </div>
  )
}

// ── The "we learned something" moment (spec 11 §8) ────────────────────────
function ClosedLoop({ result }) {
  const ki = result.knowledge_item
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-center animate-reveal">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-100">
        <Sparkles size={22} className="text-emerald-600" />
      </div>
      <h3 className="mt-2 font-display text-sm font-bold text-ink">Knowledge loop closed</h3>
      {ki ? (
        <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-neutral-600">
          Resolution saved as reusable knowledge: <span className="font-semibold text-ink">"{ki.title}"</span>.
          Future questions on this topic can now cite this expert resolution as a {ki.trust_level} source.
        </p>
      ) : (
        <p className="mx-auto mt-1 max-w-xs text-[11px] text-neutral-600">Resolution logged for this request.</p>
      )}
      {ki && (
        <p className="mx-auto mt-2 inline-block rounded-lg border border-emerald-200 bg-white px-2.5 py-1 font-mono text-[10px] text-emerald-700">
          {ki.id} · trust: {ki.trust_level}
        </p>
      )}
    </div>
  )
}

function ResolvedView({ request }) {
  const res = request.resolution
  if (!res) return null
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 size={13} className="text-emerald-600" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink">Resolution</span>
      </div>
      <p className="text-xs font-semibold text-ink">{res.summary_answer}</p>
      {res.detailed_resolution && <p className="text-[11px] leading-relaxed text-neutral-600">{res.detailed_resolution}</p>}
      {res.steps_taken?.length > 0 && (
        <ol className="space-y-1">
          {res.steps_taken.map((s, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-neutral-600">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">{i + 1}</span>{s}
            </li>
          ))}
        </ol>
      )}
      {request.status === 'converted_to_knowledge' && (
        <div className="flex items-center gap-1.5 rounded-lg bg-six-light/70 border border-six/20 px-2.5 py-1.5 text-[10px] font-semibold text-six">
          <Sparkles size={12} /> Now retrievable as company knowledge
        </div>
      )}
    </div>
  )
}

// ── Small shared bits ─────────────────────────────────────────────────────
function Centered({ children }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">{children}</div>
}
function Field({ label, children }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">{label}</span>
      {children}
    </div>
  )
}
function Labeled({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">{label}</span>
      {children}
    </label>
  )
}
const inputCls = 'w-full rounded-lg border border-neutral-200 bg-neutral-50/60 px-2.5 py-1.5 text-xs text-ink outline-none transition-shadow focus:bg-white focus:border-six focus:ring-4 focus:ring-six/10'
