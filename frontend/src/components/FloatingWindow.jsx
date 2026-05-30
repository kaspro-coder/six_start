import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, Clock, Library } from 'lucide-react'

const TABS = [
  { id: 'chat',     label: 'Chat',     Icon: MessageSquare },
  { id: 'sessions', label: 'Sessions', Icon: Clock },
  { id: 'library',  label: 'Library',  Icon: Library },
]

const MIN_W = 420
const MIN_H = 520
const DEFAULT_W = 700
const DEFAULT_H = 780

function getDefaultPos() {
  return {
    x: Math.max(20, window.innerWidth  - DEFAULT_W - 32),
    y: Math.max(20, Math.round((window.innerHeight - DEFAULT_H) / 2)),
  }
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export default function FloatingWindow({ children }) {
  const [mode,      setMode]      = useState('windowed') // 'compact' | 'windowed' | 'maximized'
  const [pos,       setPos]       = useState(getDefaultPos)
  const [size,      setSize]      = useState({ w: DEFAULT_W, h: DEFAULT_H })
  const [activeTab, setActiveTab] = useState('chat')

  const dragRef   = useRef(null)
  const resizeRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') handleCompact()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleCompact() {
    if (isElectron) window.electronAPI.compact()
    setMode('compact')
  }

  function handleRestore() {
    if (isElectron) window.electronAPI.restore()
    setMode('windowed')
  }

  function handleToggleMax() {
    if (isElectron) {
      window.electronAPI.toggleMaximize()
      setMode(m => m === 'maximized' ? 'windowed' : 'maximized')
    } else {
      setMode(m => m === 'maximized' ? 'windowed' : 'maximized')
    }
  }

  function handleClose() {
    if (isElectron) window.electronAPI.close()
  }

  // ── Browser-only drag ──────────────────────────────────────────────────
  function onTitlePointerDown(e) {
    if (isElectron || mode === 'maximized') return
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
  function onTitlePointerUp() { dragRef.current = null }

  // ── Browser-only resize ────────────────────────────────────────────────
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
  function onResizePointerUp() { resizeRef.current = null }

  // ── Compact bar — always on screen, fills the 300×52 Electron window ──
  if (mode === 'compact') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center bg-white border border-neutral-200/80 shadow-elevated select-none overflow-hidden"
        style={!isElectron ? { bottom: 24, right: 24, top: 'auto', left: 'auto', width: 300, height: 52, borderRadius: 16 } : {}}
      >
        <div className="no-drag flex items-center gap-3 flex-1 pl-4 cursor-pointer" onClick={handleRestore}>
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <TrafficLight color="red"    title="Expand"   onClick={handleRestore}   />
            <TrafficLight color="yellow" title="Expand"   onClick={handleRestore}   />
            <TrafficLight color="green"  title="Maximise" onClick={handleToggleMax} />
          </div>
          <BrandGlyph size="sm" />
          <span className="font-display text-sm font-bold text-ink tracking-tight">
            SIX<span className="text-neutral-400 font-semibold">sens</span>
          </span>
        </div>
        <div className="drag-region h-full w-8 flex items-center justify-center cursor-grab shrink-0">
          <svg width="12" height="20" viewBox="0 0 12 20" className="text-neutral-300">
            <circle cx="3" cy="4"  r="1.5" fill="currentColor" />
            <circle cx="9" cy="4"  r="1.5" fill="currentColor" />
            <circle cx="3" cy="10" r="1.5" fill="currentColor" />
            <circle cx="9" cy="10" r="1.5" fill="currentColor" />
            <circle cx="3" cy="16" r="1.5" fill="currentColor" />
            <circle cx="9" cy="16" r="1.5" fill="currentColor" />
          </svg>
        </div>
      </div>
    )
  }

  const isMax = mode === 'maximized'

  const windowStyle = isElectron
    ? { inset: 0 }
    : isMax
      ? { inset: 0, borderRadius: 0 }
      : { left: pos.x, top: pos.y, width: size.w, height: size.h, borderRadius: 16 }

  return (
    <div
      className="fixed z-50 flex flex-col bg-canvas border border-neutral-200/80 shadow-elevated overflow-hidden select-none"
      style={windowStyle}
    >
      {/* ── Title bar ──────────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-white border-b border-neutral-200/80 shrink-0 ${isElectron ? 'drag-region' : ''}`}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
      >
        {/* Traffic lights — must be no-drag so clicks register */}
        <div className="no-drag flex items-center gap-1.5 shrink-0">
          <TrafficLight color="red"    title="Collapse"                       onClick={handleCompact}   />
          <TrafficLight color="yellow" title="Collapse"                       onClick={handleCompact}   />
          <TrafficLight color="green"  title={isMax ? 'Restore' : 'Maximise'} onClick={handleToggleMax} />
        </div>

        {/* Brand — draggable centre region */}
        <div className={`flex-1 flex items-center justify-center gap-2 pointer-events-none ${isElectron ? 'drag-region' : ''}`}>
          <BrandGlyph size="md" />
          <span className="font-display text-sm font-bold text-ink tracking-tight">
            SIX<span className="text-neutral-400 font-semibold">sens</span>
          </span>
          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
            Institutional Assistant
          </span>
        </div>

        <div className={`w-[62px] shrink-0 ${isElectron ? 'drag-region' : ''}`} />
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden select-text">
        {children(activeTab)}
      </div>

      {/* ── Resize grip (browser only) ─────────────────────────────────── */}
      {!isElectron && !isMax && (
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

function TabBar({ active, onChange }) {
  return (
    <div className="no-drag flex items-center gap-0.5 px-4 py-2 bg-white border-b border-neutral-200/80 shrink-0">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            active === id
              ? 'bg-six-light text-six'
              : 'text-neutral-400 hover:text-ink hover:bg-neutral-50'
          }`}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  )
}

function TrafficLight({ color, title, onClick }) {
  const colors = {
    red:    'bg-[#FF5F57] hover:bg-[#FF3B30] ring-1 ring-black/10',
    yellow: 'bg-[#FFBD2E] hover:bg-[#FFCC00] ring-1 ring-black/10',
    green:  'bg-[#28C840] hover:bg-[#34C759] ring-1 ring-black/10',
  }
  return (
    <button
      title={title}
      onClick={onClick}
      className={`h-3 w-3 rounded-full transition-all active:scale-90 ${colors[color]}`}
    />
  )
}

function BrandGlyph({ size = 'md' }) {
  const outer = size === 'sm' ? 'h-5 w-5 rounded-[6px]'    : 'h-[22px] w-[22px] rounded-[6px]'
  const inner = size === 'sm' ? 'h-2 w-2 rounded-[3px]'    : 'h-2.5 w-2.5 rounded-[3px]'
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
