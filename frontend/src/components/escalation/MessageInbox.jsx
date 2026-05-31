import { useCallback, useEffect, useState } from 'react'
import {
  Inbox, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Clock, Sparkles,
  ClipboardList, MessageCircle,
} from 'lucide-react'
import { listKnowledgeRequests } from '../../lib/api.js'

const STATUS_META = {
  open: { cls: 'bg-six-light text-six border-six/30', label: 'Awaiting expert' },
  in_review: { cls: 'bg-blue-50 text-blue-700 border-blue-200', label: 'In review' },
  resolved: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Resolved' },
  converted_to_knowledge: { cls: 'bg-six-light text-six border-six/30', label: 'Reusable knowledge' },
}

export default function MessageInbox({ persona, refreshSignal }) {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState(null)

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

  useEffect(() => { refresh() }, [refresh, refreshSignal])

  const mine = (requests ?? []).filter(r => !persona?.id || r.requester_user_id === persona.id)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Message inbox</p>
          <p className="text-[10px] text-neutral-400">Expert answers to your submitted knowledge requests.</p>
        </div>
        <button onClick={refresh} className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-ink transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-slim">
        {requests === null ? (
          <Centered><Loader2 size={22} className="animate-spin text-six" /><p className="text-xs text-neutral-400">Loading messages...</p></Centered>
        ) : error ? (
          <Centered><AlertTriangle size={22} className="text-six" /><p className="text-xs text-neutral-500">{error}</p></Centered>
        ) : mine.length === 0 ? (
          <Centered>
            <Inbox size={28} className="text-neutral-300" />
            <p className="font-display text-sm font-bold text-ink">No expert replies yet</p>
            <p className="max-w-[260px] text-xs text-neutral-400">When CorteX routes a question to an expert, the answer will appear here once resolved.</p>
          </Centered>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {mine.map(r => <MessageRow key={r.id} request={r} />)}
          </ul>
        )}
      </div>
    </div>
  )
}

function MessageRow({ request }) {
  const status = STATUS_META[request.status] ?? STATUS_META.open
  const resolved = request.status === 'resolved' || request.status === 'converted_to_knowledge'
  const res = request.resolution
  return (
    <li className="px-4 py-3">
      <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-card">
        <div className="flex items-start gap-2.5">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${resolved ? 'bg-emerald-50 text-emerald-600' : 'bg-six-light text-six'}`}>
            {resolved ? <CheckCircle2 size={15} /> : <ClipboardList size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold leading-snug text-ink">{request.title}</p>
            <p className="mt-0.5 text-[10px] text-neutral-400">{request.question}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${status.cls}`}>{status.label}</span>
              <span className="inline-flex items-center gap-1 text-[9px] text-neutral-400">
                <Clock size={9} /> {new Date(request.updated_at ?? request.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {resolved && res && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <MessageCircle size={12} className="text-emerald-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Expert answer</span>
            </div>
            <p className="text-xs font-semibold text-ink">{res.summary_answer}</p>
            {res.detailed_resolution && <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">{res.detailed_resolution}</p>}
            {res.steps_taken?.length > 0 && (
              <ol className="mt-2 space-y-1">
                {res.steps_taken.map((step, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] text-neutral-600">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
            {request.status === 'converted_to_knowledge' && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-six/20 bg-six-light/70 px-2.5 py-1.5 text-[10px] font-semibold text-six">
                <Sparkles size={12} /> Saved to Library as reusable CorteX knowledge
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function Centered({ children }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">{children}</div>
}
