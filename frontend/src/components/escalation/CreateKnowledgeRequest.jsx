import { useState } from 'react'
import { X, MessageSquarePlus, User, CheckCircle2, ArrowRight, Loader2, Inbox } from 'lucide-react'
import { createKnowledgeRequest } from '../../lib/api.js'

const PRIORITIES = ['low', 'medium', 'high']

// Modal launched from an answer's escalation block (spec 11 §3).
// Pre-filled from the backend's request_draft + ranked experts; the user can
// adjust priority and add notes, then submit. On success it shows the
// communication path ("sent to <expert>") and lands in the Expert Inbox.
export default function CreateKnowledgeRequest({ escalation, onClose, onSubmitted, onGoToInbox }) {
  const draft = escalation?.request_draft ?? {}
  const experts = escalation?.experts ?? []
  const [title, setTitle] = useState(draft.title ?? '')
  const [question, setQuestion] = useState(draft.question ?? '')
  const [contextSummary, setContextSummary] = useState(draft.context_summary ?? '')
  const [priority, setPriority] = useState(draft.priority ?? 'medium')
  const [notes, setNotes] = useState('')
  const [attachment, setAttachment] = useState('')
  const [routedId, setRoutedId] = useState(draft.routed_expert_ids?.[0] ?? experts[0]?.id ?? '')
  const [state, setState] = useState('editing') // editing | sending | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const routedExpert = experts.find(e => e.id === routedId) ?? experts[0]

  async function submit() {
    setState('sending'); setError(null)
    try {
      const payload = {
        ...draft,
        title,
        question,
        context_summary: contextSummary,
        priority,
        notes: [notes, attachment ? `Mock attachment: ${attachment}` : ''].filter(Boolean).join('\n'),
        routed_expert_ids: routedId ? [routedId] : draft.routed_expert_ids ?? [],
      }
      const res = await createKnowledgeRequest(payload)
      setResult(res.request)
      setState('done')
      onSubmitted?.(res.request)
    } catch (err) {
      setError(err.message)
      setState('error')
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/70 px-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-elevated"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-six-light">
            <MessageSquarePlus size={16} className="text-six" />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-sm font-bold text-ink">Send knowledge request</h2>
            <p className="text-[11px] text-neutral-400">Route this question to the responsible expert</p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-ink transition-colors">
            <X size={15} />
          </button>
        </div>

        {state === 'done' && result ? (
          <SuccessView request={result} expert={routedExpert} onClose={onClose} onGoToInbox={onGoToInbox} />
        ) : (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto scroll-slim px-5 py-4">
            <Labeled label="Title">
              <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
            </Labeled>

            <Labeled label="Question">
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                className={`${inputCls} min-h-16 resize-none`}
              />
            </Labeled>

            <Labeled label="Context summary">
              <textarea
                value={contextSummary}
                onChange={e => setContextSummary(e.target.value)}
                className={`${inputCls} min-h-20 resize-none text-[11px] leading-relaxed`}
              />
            </Labeled>

            {draft.related_source_ids?.length > 0 && (
              <Labeled label={`Related sources already found (${draft.related_source_ids.length})`}>
                <div className="flex flex-wrap gap-1">
                  {draft.related_source_ids.slice(0, 6).map((id, i) => (
                    <span key={i} className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[9px] text-neutral-500">{id}</span>
                  ))}
                </div>
              </Labeled>
            )}

            <Labeled label="Route to expert">
              <div className="space-y-1.5">
                {experts.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setRoutedId(e.id)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                      routedId === e.id ? 'border-six bg-six-light/60' : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-six text-white"><User size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-ink">{e.expert_name}</span>
                      <span className="block truncate text-[10px] text-neutral-500">{e.reason}</span>
                    </span>
                    {routedId === e.id && <CheckCircle2 size={15} className="shrink-0 text-six" />}
                  </button>
                ))}
              </div>
            </Labeled>

            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Priority">
                <div className="flex gap-1">
                  {PRIORITIES.map(p => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                        priority === p ? 'border-six bg-six-light text-six' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Labeled>
            </div>

            <Labeled label="Additional notes (optional)">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Anything that would help the expert…"
                className={`${inputCls} min-h-16 resize-none`}
              />
            </Labeled>

            <Labeled label="Attach supporting document (mock)">
              <input
                value={attachment}
                onChange={e => setAttachment(e.target.value)}
                placeholder="e.g. ESG structured product term sheet.pdf"
                className={inputCls}
              />
            </Labeled>

            {state === 'error' && <p className="text-[11px] text-red-600">Could not send: {error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50 transition-colors">Cancel</button>
              <button
                onClick={submit}
                disabled={state === 'sending'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-six px-4 py-2 text-xs font-semibold text-white shadow-six-glow hover:bg-six-dark disabled:opacity-60 transition-colors active:scale-95"
              >
                {state === 'sending' ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><ArrowRight size={13} /> Send request</>}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function SuccessView({ request, expert, onClose, onGoToInbox }) {
  return (
    <div className="px-5 py-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50">
        <CheckCircle2 size={26} className="text-emerald-600" />
      </div>
      <h3 className="mt-3 font-display text-sm font-bold text-ink">Delivered to {expert?.expert_name ?? 'the expert'}</h3>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">
        The request is now in <span className="font-semibold text-ink">{expert?.expert_name ?? 'the expert'}</span>'s
        inbox{expert?.department ? ` (${expert.department})` : ''}. Once resolved, the answer becomes reusable company knowledge.
      </p>
      <div className="mx-auto mt-3 max-w-xs rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Sent to expert inbox</p>
        <p className="mt-0.5 text-xs font-semibold text-ink">{request.title}</p>
        <p className="mt-0.5 font-mono text-[10px] text-neutral-400">#{request.id} · {request.priority} priority · delivered</p>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50 transition-colors">Done</button>
        {onGoToInbox && (
          <button onClick={onGoToInbox} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-black transition-colors">
            <Inbox size={13} /> Open expert inbox
          </button>
        )}
      </div>
    </div>
  )
}

function Labeled({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'w-full rounded-lg border border-neutral-200 bg-neutral-50/60 px-3 py-2 text-xs text-ink outline-none transition-shadow focus:bg-white focus:border-six focus:ring-4 focus:ring-six/10'
