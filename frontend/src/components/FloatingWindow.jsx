import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Clock, Library, Users, Network, Inbox, Minus, X, Maximize2 } from 'lucide-react'

const TABS = [
  { id: 'chat',     label: 'Assistant',       Icon: MessageSquare },
  { id: 'library',  label: 'Library',         Icon: Library },
  { id: 'experts',  label: 'Experts',         Icon: Users },
  { id: 'graph',    label: 'Knowledge Graph', Icon: Network },
  { id: 'inbox',    label: 'Expert Inbox',    Icon: Inbox },
  { id: 'sessions', label: 'Sessions',        Icon: Clock },
]

const MIN_W = 480
const MIN_H = 520
const DEFAULT_W = 760
const DEFAULT_H = 780
const COMPACT_W = 244
const COMPACT_H = 64

function getDefaultPos() {
  return {
    x: Math.max(20, window.innerWidth - DEFAULT_W - 32),
    y: Math.max(20, Math.round((window.innerHeight - DEFAULT_H) / 2)),
  }
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export default function FloatingWindow({ children, tabBadges = {} }) {
  const [mode, setMode] = useState('windowed')
  const [pos, setPos] = useState(getDefaultPos)
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H })
  const [activeTab, setActiveTab] = useState('chat')

  const dragRef = useRef(null)
  const resizeRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') handleCompact()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('sixsens-compact-mode', mode === 'compact')
    return () => document.body.classList.remove('sixsens-compact-mode')
  }, [mode])

  function handleCompact() {
    if (isElectron) window.electronAPI.compact()
    setMode('compact')
  }

  function handleRestore() {
    if (isElectron) window.electronAPI.restore()
    setMode('windowed')
  }

  function handleClose() {
    if (isElectron) window.electronAPI.close()
  }

  function onTitlePointerDown(e) {
    if (isElectron) return
    if (e.target.closest('.no-drag')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y }
  }

  function onTitlePointerMove(e) {
    if (!dragRef.current) return
    setPos({
      x: dragRef.current.ox + (e.clientX - dragRef.current.startX),
      y: dragRef.current.oy + (e.clientY - dragRef.current.startY),
    })
  }

  function onTitlePointerUp() {
    dragRef.current = null
  }

  function onResizePointerDown(e) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = { startX: e.clientX, startY: e.clientY, sw: size.w, sh: size.h }
  }

  function onResizePointerMove(e) {
    if (!resizeRef.current) return
    setSize({
      w: Math.max(MIN_W, resizeRef.current.sw + (e.clientX - resizeRef.current.startX)),
      h: Math.max(MIN_H, resizeRef.current.sh + (e.clientY - resizeRef.current.startY)),
    })
  }

  function onResizePointerUp() {
    resizeRef.current = null
  }

  if (mode === 'compact') {
    return (
      <div
        className={`sixsens-floating-window fixed inset-0 z-50 overflow-hidden rounded-[22px] border border-neutral-200 bg-white shadow-elevated ring-1 ring-black/10 select-none ${isElectron ? 'drag-region' : ''}`}
      >
        <div className="relative flex h-full items-center gap-3 px-3">
          <span className="pointer-events-none absolute inset-y-2 left-2 w-16 rounded-[18px] bg-six/10 blur-xl" />

          <button
            className="no-drag relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-six text-white shadow-six-glow transition-transform hover:scale-105 active:scale-95"
            onClick={handleRestore}
            title="Open SIXsens"
            type="button"
          >
            <span className="h-3.5 w-3.5 rounded-[5px] bg-white/90" />
          </button>

          <button className="no-drag relative min-w-0 flex-1 text-left" onClick={handleRestore} type="button">
            <p className="truncate font-display text-[13px] font-extrabold tracking-tight text-ink">
              SIX<span className="text-neutral-400 font-semibold">sens</span>
            </p>
            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Ready
            </p>
          </button>

          <div className="no-drag relative flex items-center gap-1">
            <CompactButton title="Open" onClick={handleRestore}>
              <Maximize2 size={13} />
            </CompactButton>
            <CompactButton title="Close" onClick={handleClose}>
              <X size={13} />
            </CompactButton>
          </div>
        </div>
      </div>
    )
  }

  const windowStyle = isElectron
    ? { inset: 0 }
    : { left: pos.x, top: pos.y, width: size.w, height: size.h, borderRadius: 16 }

  return (
    <div
      className="sixsens-floating-window fixed z-50 flex flex-col bg-canvas border border-neutral-200/80 shadow-elevated overflow-hidden select-none"
      style={windowStyle}
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-white border-b border-neutral-200/80 shrink-0 ${isElectron ? 'drag-region' : ''}`}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
      >
        <div className={`flex-1 flex items-center gap-2 pointer-events-none ${isElectron ? 'drag-region' : ''}`}>
          <BrandGlyph size="md" />
          <span className="font-display text-sm font-bold text-ink tracking-tight">
            SIX<span className="text-neutral-400 font-semibold">sens</span>
          </span>
          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
            Institutional Assistant
          </span>
        </div>

        <div className="no-drag flex items-center gap-1 shrink-0">
          <WindowButton title="Minimize" onClick={handleCompact}>
            <Minus size={14} />
          </WindowButton>
          <WindowButton title="Close" onClick={handleClose}>
            <X size={14} />
          </WindowButton>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="no-drag w-44 shrink-0 flex flex-col bg-white border-r border-neutral-200/80 select-text">
          <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
            {TABS.map(({ id, label, Icon }) => {
              const badge = tabBadges[id] ?? 0
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all w-full text-left ${
                    activeTab === id
                      ? 'bg-six-light text-six'
                      : 'text-neutral-500 hover:text-ink hover:bg-neutral-50'
                  }`}
                  type="button"
                >
                  <Icon size={13} className="shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badge > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-six px-1 text-[9px] font-bold text-white shadow-six-glow">
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="px-3 py-3 border-t border-neutral-100 flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-neutral-200 grid place-items-center text-[10px] font-bold text-ink shrink-0">C</div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-ink truncate">Cosmina</p>
              <p className="text-[9px] text-neutral-400 truncate">Compliance Officer</p>
            </div>
          </div>
        </aside>

        <div className="no-drag flex-1 min-w-0 flex flex-col overflow-hidden select-text">
          {children(activeTab, setActiveTab)}
        </div>
      </div>

      {!isElectron && (
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-10"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        >
          <ResizeGrip />
        </div>
      )}
    </div>
  )
}

function WindowButton({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      type="button"
      className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 transition-all hover:bg-neutral-100 hover:text-ink active:scale-95"
    >
      {children}
    </button>
  )
}

function CompactButton({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      type="button"
      className="grid h-8 w-8 place-items-center rounded-xl border border-neutral-200/70 bg-white/80 text-neutral-400 shadow-sm transition-all hover:border-six/25 hover:bg-six-light hover:text-six active:scale-95"
    >
      {children}
    </button>
  )
}

function BrandGlyph({ size = 'md' }) {
  const outer = size === 'sm' ? 'h-5 w-5 rounded-[6px]' : 'h-[22px] w-[22px] rounded-[6px]'
  const inner = size === 'sm' ? 'h-2 w-2 rounded-[3px]' : 'h-2.5 w-2.5 rounded-[3px]'
  return (
    <span className={`grid place-items-center bg-six shadow-six-glow shrink-0 ${outer}`}>
      <span className={`bg-white/90 ${inner}`} />
    </span>
  )
}

function ResizeGrip() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="absolute bottom-1 right-1 text-neutral-300">
      <circle cx="13" cy="13" r="1.2" fill="currentColor" />
      <circle cx="9"  cy="13" r="1.2" fill="currentColor" />
      <circle cx="13" cy="9"  r="1.2" fill="currentColor" />
      <circle cx="5"  cy="13" r="1.2" fill="currentColor" />
      <circle cx="9"  cy="9"  r="1.2" fill="currentColor" />
      <circle cx="13" cy="5"  r="1.2" fill="currentColor" />
    </svg>
  )
}
