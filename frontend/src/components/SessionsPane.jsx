import { useState } from 'react'
import { ArrowLeft, MessageSquare, Plus, Clock } from 'lucide-react'

export default function SessionsPane({ sessions, onLoadSession, onNewChat }) {
  const [viewing, setViewing] = useState(null) // session object being viewed

  if (viewing) {
    return <TranscriptView session={viewing} onBack={() => setViewing(null)} />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
          {sessions.length} conversation{sessions.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 rounded-lg bg-six text-white px-2.5 py-1.5 text-xs font-semibold shadow-six-glow hover:bg-six-dark transition-colors active:scale-95"
        >
          <Plus size={12} /> New chat
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scroll-slim">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <Clock size={28} className="text-neutral-300" />
            <p className="font-display font-bold text-sm text-ink">No sessions yet</p>
            <p className="text-xs text-neutral-400">Your conversations will appear here after you chat.</p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {sessions.map(session => (
              <SessionRow
                key={session.id}
                session={session}
                onOpen={() => setViewing(session)}
                onResume={() => { onLoadSession(session.id); onNewChat && null }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SessionRow({ session, onOpen }) {
  const date = new Date(session.startedAt)
  const isToday = new Date().toDateString() === date.toDateString()
  const label = isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const msgCount = session.messages?.filter(m => m.role === 'user').length ?? 0

  return (
    <li>
      <button
        onClick={onOpen}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 transition-colors group"
      >
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-six-light">
          <MessageSquare size={13} className="text-six" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-ink truncate leading-snug">{session.preview}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">
            {label} · {msgCount} message{msgCount !== 1 ? 's' : ''}
          </p>
        </div>
        <ArrowLeft size={13} className="shrink-0 text-neutral-300 group-hover:text-six rotate-180 transition-colors mt-1" />
      </button>
    </li>
  )
}

function TranscriptView({ session, onBack }) {
  const date = new Date(session.startedAt)
  const label = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 shrink-0">
        <button
          onClick={onBack}
          className="grid h-7 w-7 place-items-center rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-ink transition-colors"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink truncate">{session.preview}</p>
          <p className="text-[10px] text-neutral-400">{label}</p>
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto scroll-slim px-4 py-4 space-y-4">
        {session.messages
          .filter(m => m.kind === 'text' || m.kind === 'procedure')
          .map((m, i) => {
            const isUser = m.role === 'user'
            return (
              <div key={i} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                <div className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-[10px] font-bold ${isUser ? 'bg-neutral-200 text-ink' : 'bg-six text-white'}`}>
                  {isUser ? 'C' : <span className="h-1.5 w-1.5 rounded-[2px] bg-white/90 block" />}
                </div>
                <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
                  {m.kind === 'procedure' ? (
                    <div className="inline-block text-left bg-white rounded-xl px-3 py-2.5 border border-neutral-200 text-xs">
                      <p className="font-bold text-ink mb-1.5">{m.content.title}</p>
                      <ol className="space-y-1">
                        {m.content.steps?.map((s, j) => (
                          <li key={j} className="flex gap-1.5">
                            <span className="shrink-0 h-3.5 w-3.5 rounded-full bg-six text-white text-[8px] font-bold flex items-center justify-center mt-px">{j+1}</span>
                            <span className="text-neutral-600 leading-relaxed">{s}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <div className={`inline-block rounded-2xl px-3 py-2 text-xs leading-relaxed ${isUser ? 'bg-ink text-white rounded-tr-sm' : 'bg-neutral-100 text-ink rounded-tl-sm'}`}>
                      {m.content}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
      </div>

      <div className="px-4 py-2.5 border-t border-neutral-100 text-center">
        <p className="text-[10px] text-neutral-400">Read-only transcript</p>
      </div>
    </div>
  )
}
