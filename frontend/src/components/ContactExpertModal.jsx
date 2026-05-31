import { useState } from 'react'
import { X, Send, CheckCircle2, Loader2, Inbox, Sparkles } from 'lucide-react'
import { createKnowledgeRequest } from '../lib/api.js'

const PRIORITIES = ['low', 'medium', 'high']

const PRIORITY_COLORS = {
  low:    'border-neutral-200 text-neutral-500',
  medium: 'border-six/30 text-six bg-six-light',
  high:   'border-red-300 text-red-600 bg-red-50',
}

// Normalize an expert object coming from either ExpertsPane (local mock)
// or the knowledge_store / GroundedAnswer (backend shape).
function normalize(expert) {
  return {
    id:         expert.id ?? expert.expert_name,
    name:       expert.expert_name ?? expert.full_name ?? expert.name,
    role:       expert.role_title  ?? expert.role,
    department: expert.department  ?? '',
    initials:   initials(expert.expert_name ?? expert.name ?? '?'),
    expertise:  expert.expertise_tags ?? expert.expertise ?? [],
    best_for:   expert.best_for ?? null,
    color:      expert.color ?? 'bg-six text-white',
  }
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function autoTitle(name, body) {
  const snippet = body.trim().replace(/\n/g, ' ').slice(0, 60)
  return `Question for ${name}: ${snippet}${snippet.length >= 60 ? '…' : ''}`
}

export default function ContactExpertModal({ expert: raw, persona, onClose, onSubmitted, onGoToInbox }) {
  const expert = normalize(raw)

  const [body,     setBody]     = useState('')
  const [priority, setPriority] = useState('medium')
  const [state,    setState]    = useState('editing') // editing | sending | done | error
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState(null)

  async function submit() {
    if (!body.trim()) return
    setState('sending')
    try {
      const res = await createKnowledgeRequest({
        title:              autoTitle(expert.name, body),
        question:           body.trim(),
        context_summary:    `Sent directly to ${expert.name} (${expert.role}) via Contact Expert.`,
        requester_user_id:  persona?.id ?? 'user_cosmina',
        routed_expert_ids:  [expert.id],
        domain_tags:        [],
        priority,
      })
      setResult(res.request)
      setState('done')
      onSubmitted?.(res.request)
    } catch (err) {
      setError(err.message)
      setState('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-elevated animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
          <div className={`h-9 w-9 shrink-0 rounded-xl grid place-items-center text-sm font-bold ${expert.color}`}>
            {expert.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm font-bold text-ink truncate">{expert.name}</p>
            <p className="text-[10px] text-neutral-400 truncate">{expert.role}{expert.department ? ` · ${expert.department}` : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-ink transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {state === 'done' && result ? (
          <SuccessView expert={expert} request={result} onClose={onClose} onGoToInbox={onGoToInbox} />
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Expertise chips */}
            {expert.expertise.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {expert.expertise.slice(0, 5).map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-six-light text-six">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Message body */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5">
                Describe your question or problem
              </label>
              <textarea
                autoFocus
                rows={6}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={`Hi ${expert.name.split(' ')[0]}, I need help with…\n\nContext: I'm looking at [document / workflow] and I'm not sure how to…`}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-3.5 py-2.5 text-xs text-ink leading-relaxed resize-none outline-none transition-shadow focus:bg-white focus:border-six focus:ring-4 focus:ring-six/10"
              />
              <p className="mt-1 text-[9px] text-neutral-400">
                This will be sent as a knowledge request to {expert.name.split(' ')[0]}'s inbox. Once resolved, the answer becomes reusable company knowledge.
              </p>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5">Priority</label>
              <div className="flex gap-2">
                {PRIORITIES.map(p => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize transition-all ${
                      priority === p
                        ? PRIORITY_COLORS[p]
                        : 'border-neutral-200 text-neutral-400 hover:border-neutral-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {state === 'error' && (
              <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">
                Could not send: {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-xs font-semibold text-neutral-500 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!body.trim() || state === 'sending'}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-six py-2.5 text-xs font-semibold text-white shadow-six-glow hover:bg-six-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95"
              >
                {state === 'sending'
                  ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
                  : <><Send size={12} /> Send to {expert.name.split(' ')[0]}</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SuccessView({ expert, request, onClose, onGoToInbox }) {
  return (
    <div className="px-5 py-8 flex flex-col items-center text-center gap-3">
      <div className="h-12 w-12 rounded-full bg-six-light grid place-items-center">
        <Sparkles size={22} className="text-six" />
      </div>
      <div>
        <p className="font-display font-bold text-ink">Sent to {expert.name}</p>
        <p className="text-xs text-neutral-400 mt-0.5 max-w-xs leading-relaxed">
          Your question is in their inbox. Once {expert.name.split(' ')[0]} resolves it, the answer becomes searchable company knowledge.
        </p>
      </div>
      <div className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-left">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Knowledge request</p>
        <p className="text-xs font-semibold text-ink mt-0.5 line-clamp-2">{request.title}</p>
        <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">#{request.id} · {request.priority} priority</p>
      </div>
      <div className="flex gap-2 w-full mt-1">
        <button
          onClick={onClose}
          className="flex-1 rounded-xl border border-neutral-200 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50 transition-colors"
        >
          Done
        </button>
        {onGoToInbox && (
          <button
            onClick={onGoToInbox}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-ink py-2 text-xs font-semibold text-white hover:bg-black transition-colors"
          >
            <Inbox size={12} /> View inbox
          </button>
        )}
      </div>
    </div>
  )
}
