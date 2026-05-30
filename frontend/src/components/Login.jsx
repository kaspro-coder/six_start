import { ChevronRight, Inbox } from 'lucide-react'
import { USERS } from '../lib/users.js'

export default function Login({ onLogin }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-six shadow-six-glow">
            <span className="h-3.5 w-3.5 rounded-[5px] bg-white/90" />
          </span>
          <h1 className="mt-3 font-display text-xl font-bold tracking-tight text-ink">
            SIX<span className="text-neutral-400 font-semibold">sens</span>
          </h1>
          <p className="mt-1 text-xs text-neutral-400">Choose an account to sign in</p>
        </div>

        {/* Accounts */}
        <div className="space-y-2">
          {USERS.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => onLogin(u)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-neutral-200/80 bg-white p-3.5 text-left shadow-card transition-all hover:border-six/30 hover:shadow-elevated hover:-translate-y-px"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-100 text-sm font-bold text-neutral-500">
                {u.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-ink truncate">{u.name}</span>
                  {u.isExpert && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-six-light px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-six">
                      <Inbox size={9} /> Expert
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-neutral-500 truncate">{u.role}</span>
                <span className="block text-[10px] text-neutral-400 truncate">{u.department}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-neutral-300 transition-colors group-hover:text-six" />
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-[10px] text-neutral-400">
          Experts receive the Expert Inbox · others do not
        </p>
      </div>
    </div>
  )
}
