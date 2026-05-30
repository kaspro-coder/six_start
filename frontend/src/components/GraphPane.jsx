import { useRef, useCallback, useState, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Network, ZoomIn, ZoomOut, RotateCcw, Mail, X, Users } from 'lucide-react'

const BRAND_RED = '#DE3919'
const RING_GRAY = '#D9D5D0'
const LABEL_GRAY = '#3F3F46'

// ── Static graph data ───────────────────────────────────────────────────────
// Positions are pinned (fx/fy) so the layout stays put and well-spaced.
const DOMAIN_NODES = [
  { id: 'isin',     label: 'ISIN Management',    critical: true,  size: 26, x: -60,  y: -40,  fx: -60,  fy: -40 },
  { id: 'mifid',    label: 'MiFID II Reporting', critical: true,  size: 21, x: 220,  y: -170, fx: 220,  fy: -170 },
  { id: 'sfdr',     label: 'SFDR',               critical: true,  size: 16, x: 380,  y: 20,   fx: 380,  fy: 20 },
  { id: 'taxonomy', label: 'Securities Taxonomy', critical: false, size: 18, x: -360, y: 60,   fx: -360, fy: 60 },
  { id: 'corp',     label: 'Corporate Actions',  critical: false, size: 18, x: -190, y: 230,  fx: -190, fy: 230 },
  { id: 'datagov',  label: 'Data Governance',    critical: false, size: 18, x: 150,  y: 170,  fx: 150,  fy: 170 },
  { id: 'apigw',    label: 'API Gateway',        critical: false, size: 16, x: 370,  y: 290,  fx: 370,  fy: 290 },
]

const LINKS = [
  { source: 'isin',    target: 'mifid' },
  { source: 'mifid',   target: 'sfdr' },
  { source: 'isin',    target: 'taxonomy' },
  { source: 'isin',    target: 'corp' },
  { source: 'isin',    target: 'datagov' },
  { source: 'datagov', target: 'apigw' },
]

const GRAPH_DATA = { nodes: DOMAIN_NODES, links: LINKS }

// ── Project staffing ────────────────────────────────────────────────────────
const EMPLOYEES = {
  jacob:  { name: 'Jacob Müller',   role: 'Master Data SME',            initials: 'JM', color: 'bg-six text-white',        email: 'jacob.mueller@six-group.com' },
  elena:  { name: 'Elena Vasquez',  role: 'Regulatory Compliance Lead', initials: 'EV', color: 'bg-indigo-500 text-white', email: 'elena.vasquez@six-group.com' },
  thomas: { name: 'Thomas Brunner', role: 'Reference Data Specialist',  initials: 'TB', color: 'bg-emerald-600 text-white', email: 'thomas.brunner@six-group.com' },
  priya:  { name: 'Priya Sharma',   role: 'ESG Data Analyst',           initials: 'PS', color: 'bg-teal-600 text-white',   email: 'priya.sharma@six-group.com' },
  marco:  { name: 'Marco Ferreira', role: 'Operations Manager',         initials: 'MF', color: 'bg-amber-600 text-white',  email: 'marco.ferreira@six-group.com' },
}

// 1–4 employees working on the project from each department.
const TEAMS = {
  isin:     ['jacob', 'thomas', 'marco'],
  mifid:    ['elena', 'thomas'],
  sfdr:     ['priya', 'elena'],
  taxonomy: ['thomas', 'priya'],
  corp:     ['marco'],
  datagov:  ['jacob', 'elena', 'thomas', 'marco'],
  apigw:    ['marco', 'jacob'],
}

// ── Component ───────────────────────────────────────────────────────────────
export default function GraphPane() {
  const fgRef        = useRef()
  const containerRef = useRef()
  const [dims, setDims]     = useState({ w: 800, h: 600 })
  const [selected, setSelected] = useState(null)

  // Measure container so the canvas fills it exactly
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Frame the (fixed) layout whenever the canvas resizes — debounced so it
  // settles once after the slide animation rather than on every frame.
  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(400, 90), 280)
    return () => clearTimeout(t)
  }, [dims])

  const zoomBy = useCallback((factor) => {
    const fg = fgRef.current
    if (fg) fg.zoom(fg.zoom() * factor, 300)
  }, [])

  const reset = useCallback(() => fgRef.current?.zoomToFit(400, 90), [])

  const paintNode = useCallback((node, ctx) => {
    const r = node.size
    const isSel = node.id === selected

    if (node.critical) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, r + 10, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(222,57,25,0.10)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(222,57,25,0.16)'
      ctx.fill()
      ctx.lineWidth = 2.5
      ctx.strokeStyle = BRAND_RED
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = RING_GRAY
      ctx.stroke()
    }

    // Selection ring
    if (isSel) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, r + 6, 0, 2 * Math.PI)
      ctx.lineWidth = 2
      ctx.strokeStyle = BRAND_RED
      ctx.stroke()
    }

    // Department label below the node — the only text on the graph
    ctx.fillStyle = isSel ? BRAND_RED : LABEL_GRAY
    ctx.font = `${isSel ? '700' : '600'} 13px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(node.label, node.x, node.y + r + 9)
  }, [selected])

  // Retain last selection so the panel slides out with content intact.
  const selectedNode = DOMAIN_NODES.find(n => n.id === selected) || null
  const lastRef = useRef(null)
  if (selectedNode) lastRef.current = { node: selectedNode, team: TEAMS[selected] ?? [] }
  const shown = selectedNode ? { node: selectedNode, team: TEAMS[selected] ?? [] } : lastRef.current
  const open = !!selectedNode

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-canvas px-5 py-5">
      <div className="flex flex-1 min-h-0">
        {/* ── Graph column ──────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-neutral-200/80 bg-white overflow-hidden shadow-card">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 shrink-0">
              <div className="flex items-center gap-2">
                <Network size={15} className="text-neutral-400" />
                <h1 className="font-display font-bold text-ink text-sm">Knowledge Domain Graph</h1>
              </div>
              <div className="flex items-center gap-1">
                <IconBtn title="Zoom in"  onClick={() => zoomBy(1.3)}><ZoomIn size={15} /></IconBtn>
                <IconBtn title="Zoom out" onClick={() => zoomBy(0.77)}><ZoomOut size={15} /></IconBtn>
                <IconBtn title="Reset view" onClick={reset}><RotateCcw size={14} /></IconBtn>
              </div>
            </div>

            {/* Canvas */}
            <div ref={containerRef} className="relative flex-1 min-h-0">
              <ForceGraph2D
                ref={fgRef}
                graphData={GRAPH_DATA}
                width={dims.w}
                height={dims.h}
                nodeCanvasObject={paintNode}
                nodeCanvasObjectMode={() => 'replace'}
                nodeRelSize={6}
                nodeVal={n => (n.size / 6) ** 2}
                linkColor={() => 'rgba(180,176,170,0.55)'}
                linkWidth={1.2}
                enableNodeDrag={false}
                cooldownTicks={0}
                backgroundColor="#FFFFFF"
                onNodeClick={node => setSelected(s => (s === node.id ? null : node.id))}
                onBackgroundClick={() => setSelected(null)}
              />

              <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2">
                <span className="rounded-full border border-neutral-200 bg-white/85 px-4 py-1.5 text-[11px] text-neutral-400">
                  Click a department to see who works on the project
                </span>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 px-1 pt-4 shrink-0">
            <LegendDot critical label="Critical Domain" />
            <LegendDot label="Active Domain" />
            <LegendLine label="Knowledge Link" />
          </div>
        </div>

        {/* ── Project-team panel (slides in from the right) ─────────── */}
        <div
          className="shrink-0 overflow-hidden transition-[width] duration-300 ease-out"
          style={{ width: open ? 360 : 0 }}
        >
          <div className="w-[360px] h-full pl-4">
            <div className="h-full flex flex-col rounded-2xl border border-neutral-200/80 bg-white shadow-card overflow-hidden">
              {shown && (
                <>
                  <div className="flex items-start gap-2 px-4 py-3.5 border-b border-neutral-100 shrink-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Project team</p>
                      <p className="font-display font-bold text-ink text-sm truncate">{shown.node.label}</p>
                      <p className="flex items-center gap-1 text-[11px] text-neutral-400 mt-0.5">
                        <Users size={11} />
                        {shown.team.length} {shown.team.length > 1 ? 'people' : 'person'} on this project
                      </p>
                    </div>
                    <button
                      onClick={() => setSelected(null)}
                      className="grid h-6 w-6 place-items-center rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-ink transition-colors shrink-0"
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                    {shown.team.map(id => <TeamCard key={id} emp={EMPLOYEES[id]} />)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamCard({ emp }) {
  if (!emp) return null
  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-200/70 bg-white p-3 shadow-card">
      <div className={`h-10 w-10 rounded-xl grid place-items-center text-sm font-bold shrink-0 ${emp.color}`}>
        {emp.initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink truncate">{emp.name}</p>
        <p className="text-[11px] text-neutral-500 truncate">{emp.role}</p>
        <a
          href={`mailto:${emp.email}`}
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-neutral-400 hover:text-six transition-colors max-w-full"
        >
          <Mail size={10} className="shrink-0" />
          <span className="truncate">{emp.email}</span>
        </a>
      </div>
    </div>
  )
}

function IconBtn({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      type="button"
      className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-ink"
    >
      {children}
    </button>
  )
}

function LegendDot({ critical, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded-full shrink-0"
        style={
          critical
            ? { backgroundColor: 'rgba(222,57,25,0.16)', border: `2px solid ${BRAND_RED}` }
            : { backgroundColor: '#FFFFFF', border: `1.5px solid ${RING_GRAY}` }
        }
      />
      <span className="text-xs text-neutral-500 font-medium">{label}</span>
    </div>
  )
}

function LegendLine({ label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-px w-5 shrink-0" style={{ backgroundColor: RING_GRAY }} />
      <span className="text-xs text-neutral-500 font-medium">{label}</span>
    </div>
  )
}
