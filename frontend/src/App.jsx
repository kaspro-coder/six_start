import { useState } from 'react'
import {
  MessageSquareText, ClipboardList, Gavel, Landmark, FileText,
  History, Settings, LifeBuoy,
} from 'lucide-react'
import EmployeeSpace from './components/EmployeeSpace.jsx'
import ExpertSpace from './components/ExpertSpace.jsx'

// The two real views, keyed by the sidebar nav. Each carries the persona it
// belongs to (shown as a sub-label and in the top-bar avatar).
const VIEWS = {
  employee: { label: 'Employee Space', persona: 'Cosmina · Compliance', initial: 'C', Icon: MessageSquareText },
  expert: { label: 'Expert Space', persona: 'Jacob · SME', initial: 'J', Icon: ClipboardList },
}

// Roadmap items from the institutional reference. Not yet built — shown as
// "Soon" rather than as dead links that do nothing when a judge clicks them.
const EXPLORE = [
  { label: 'Regulatory Updates', Icon: Gavel },
  { label: 'Post-Trade Support', Icon: Landmark },
  { label: 'Documentation', Icon: FileText },
]

export default function App() {
  const [active, setActive] = useState('employee')
  // Workflows captured by the expert are lifted here so the Employee Space can
  // surface them — and the same count drives the live indicator, the visible
  // thread that ties the two spaces into one capture → retrieve loop.
  const [capturedProcedures, setCapturedProcedures] = useState([])

  return (
    <div className="min-h-screen flex bg-canvas text-ink">
      <SideNav active={active} onSelect={setActive} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar active={active} captureCount={capturedProcedures.length} />

        <main className="flex-1 min-h-0 flex flex-col px-4 md:px-8 lg:px-12 pt-6 pb-24 md:pb-6">
          {active === 'employee' ? (
            // Employee chat fills the available height and gets a wider canvas.
            <div className="max-w-6xl w-full mx-auto flex-1 min-h-0 animate-fade-in" key={active}>
              <EmployeeSpace capturedProcedures={capturedProcedures} />
            </div>
          ) : (
            // Expert dashboard keeps a natural, content-sized height.
            <div className="max-w-5xl w-full mx-auto animate-fade-in" key={active}>
              <ExpertSpace
                onWorkflowCaptured={(proc) =>
                  setCapturedProcedures((prev) => [proc, ...prev])
                }
              />
            </div>
          )}
        </main>
      </div>

      <MobileNav active={active} onSelect={setActive} />
    </div>
  )
}

/* ── Left rail ─────────────────────────────────────────────────────────── */
function SideNav({ active, onSelect }) {
  return (
    <aside className="hidden md:flex flex-col sticky top-0 h-screen w-64 shrink-0 bg-white border-r border-neutral-200/80 py-6">
      {/* Brand */}
      <div className="px-5 mb-7 flex items-center gap-3">
        <BrandMark className="h-10 w-10 rounded-xl" inset="h-2.5 w-2.5 rounded-[5px]" />
        <div className="leading-none">
          <h1 className="font-display text-[19px] font-extrabold tracking-display text-ink">
            SIX<span className="text-neutral-400 font-bold">sens</span>
          </h1>
          <p className="text-[11px] text-neutral-500 mt-1">Institutional Assistant</p>
        </div>
      </div>

      {/* Primary nav — the two real views */}
      <nav className="px-3 space-y-1">
        {Object.entries(VIEWS).map(([key, v]) => (
          <NavItem key={key} {...v} active={active === key} onClick={() => onSelect(key)} />
        ))}
      </nav>

      {/* Roadmap (not yet built) */}
      <div className="px-6 mt-6 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          Explore
        </span>
      </div>
      <nav className="px-3 space-y-1">
        {EXPLORE.map((item) => (
          <NavItem key={item.label} {...item} disabled />
        ))}
      </nav>

      <div className="px-4 mt-6">
        <button className="w-full flex items-center justify-center gap-2 rounded-xl bg-six hover:bg-six-dark text-white py-2.5 text-sm font-semibold transition-colors shadow-six-glow">
          <LifeBuoy size={16} /> Contact Support
        </button>
      </div>

      <div className="mt-auto px-3 pt-4 border-t border-neutral-100 space-y-1">
        <NavItem label="History" Icon={History} disabled muted />
        <NavItem label="Settings" Icon={Settings} disabled muted />
        <p className="px-4 pt-3 text-[10px] leading-relaxed text-neutral-400">
          START Hack Zurich · SIX Challenge
        </p>
      </div>
    </aside>
  )
}

function NavItem({ label, persona, Icon, active, disabled, muted, onClick }) {
  if (disabled) {
    return (
      <div
        className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium cursor-default ${
          muted ? 'text-neutral-400' : 'text-neutral-400'
        }`}
      >
        <Icon size={18} className="shrink-0" />
        <span className="flex-1">{label}</span>
        {!muted && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-300 border border-neutral-200 rounded px-1.5 py-0.5">
            Soon
          </span>
        )}
      </div>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`group w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-all border-l-[3px] ${
        active
          ? 'border-six bg-six-light/50 text-six font-bold'
          : 'border-transparent text-neutral-500 font-medium hover:bg-neutral-50 hover:text-ink'
      }`}
    >
      <Icon size={18} className={`shrink-0 ${active ? 'text-six' : 'text-neutral-400 group-hover:text-ink'}`} />
      <span className="flex flex-col leading-tight">
        <span>{label}</span>
        {persona && (
          <span className={`text-[10px] font-medium ${active ? 'text-six/70' : 'text-neutral-400'}`}>
            {persona}
          </span>
        )}
      </span>
    </button>
  )
}

/* ── Top bar ───────────────────────────────────────────────────────────── */
function TopBar({ active, captureCount }) {
  const v = VIEWS[active]
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 px-4 md:px-8 lg:px-12 py-3.5 bg-white/90 backdrop-blur border-b border-neutral-200/80">
      <div className="flex items-center gap-3 min-w-0">
        {/* Brand mark stands in for the wordmark on mobile (sidebar is hidden) */}
        <BrandMark className="md:hidden h-8 w-8 rounded-lg" inset="h-2 w-2 rounded-[3px]" />
        <div className="leading-tight min-w-0">
          <h2 className="font-display text-sm font-bold text-ink truncate">{v.label}</h2>
          <p className="text-[11px] text-neutral-400 truncate">{v.persona}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <LiveCounter count={captureCount} />
        <button className="hidden sm:grid place-items-center h-9 w-9 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-ink transition-colors">
          <History size={17} />
        </button>
        <button className="hidden sm:grid place-items-center h-9 w-9 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-ink transition-colors">
          <Settings size={17} />
        </button>
        <span className="grid place-items-center h-9 w-9 rounded-full bg-neutral-200 text-ink text-xs font-bold">
          {v.initial}
        </span>
      </div>
    </header>
  )
}

// The connective tissue between the two spaces: a single live count of
// procedures in the shared knowledge base. Ticks up the moment Jacob captures
// a workflow — making the capture → retrieve loop legible at a glance.
function LiveCounter({ count }) {
  const live = count > 0
  return (
    <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white pl-2.5 pr-3 py-1.5">
      <span className="relative flex h-2 w-2">
        {live && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-six animate-pulse-ring" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-six' : 'bg-neutral-300'}`} />
      </span>
      <span className="text-xs font-medium text-neutral-600 whitespace-nowrap">
        {live ? (
          <>
            <span key={count} className="inline-block font-bold text-ink animate-count-pop">
              {count}
            </span>{' '}
            <span className="hidden sm:inline">procedure{count === 1 ? '' : 's'} </span>live
          </>
        ) : (
          <span className="hidden sm:inline">Knowledge base · ready</span>
        )}
        {!live && <span className="sm:hidden">ready</span>}
      </span>
    </div>
  )
}

/* ── Mobile bottom nav (sidebar pivot) ─────────────────────────────────── */
function MobileNav({ active, onSelect }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-neutral-200/80 flex justify-around py-2.5 px-4">
      {Object.entries(VIEWS).map(([key, v]) => {
        const on = active === key
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`flex flex-col items-center gap-1 px-4 ${on ? 'text-six font-bold' : 'text-neutral-400 font-medium'}`}
          >
            <v.Icon size={20} />
            <span className="text-[10px]">{v.label.replace(' Space', '')}</span>
          </button>
        )
      })}
    </nav>
  )
}

// The SIXsens mark: a red square with a white inset — used wherever the brand
// needs to appear as a glyph (sidebar, top bar). `inset` sizes the inner notch.
function BrandMark({ className = '', inset = 'h-2 w-2 rounded-[3px]' }) {
  return (
    <span className={`relative grid place-items-center bg-six shadow-six-glow shrink-0 ${className}`}>
      <span className={`bg-white/90 ${inset}`} />
    </span>
  )
}
