import { useRef, useCallback, useState, useEffect, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Network, ZoomIn, ZoomOut, RotateCcw, Mail, X, Users, ChevronDown, Search, Check } from 'lucide-react'

const BRAND_RED  = '#DE3919'
const ORANGE     = '#F97316' // the signed-in user's own department
const RING_GRAY  = '#D9D5D0'
const LABEL_GRAY = '#3F3F46'

// The signed-in employee's department — highlighted so the user can locate
// themselves in the graph relative to the other departments.
const USER_DEPARTMENT = 'Regulatory Affairs'

// ── People (aligned with the Employees directory) ───────────────────────────
const EMPLOYEES = {
  anna:  { name: 'Anna Steiner',  role: 'Senior Settlement Specialist', initials: 'AS', email: 'anna.steiner@six-group.com' },
  tom:   { name: 'Tom Burkhard',  role: 'Lead Post-Trade Engineer',     initials: 'TB', email: 'tom.burkhard@six-group.com' },
  priya: { name: 'Priya Rajan',   role: 'Head of Regulatory Compliance', initials: 'PR', email: 'priya.rajan@six-group.com' },
  marc:  { name: 'Marc Dubois',   role: 'Data Governance Lead',         initials: 'MD', email: 'marc.dubois@six-group.com' },
  sofia: { name: 'Sofia Novak',   role: 'Senior Clearing Operations Manager', initials: 'SN', email: 'sofia.novak@six-group.com' },
  lukas: { name: 'Lukas Weber',   role: 'Platform Architect',           initials: 'LW', email: 'lukas.weber@six-group.com' },
  lena:  { name: 'Lena Hofer',    role: 'Operations Associate',         initials: 'LH', email: 'lena.hofer@six-group.com' },
  david: { name: 'David Meier',   role: 'Compliance Analyst',           initials: 'DM', email: 'david.meier@six-group.com' },
  nina:  { name: 'Nina Roth',     role: 'Client Support Specialist',    initials: 'NR', email: 'nina.roth@six-group.com' },
  felix: { name: 'Felix Brunner', role: 'Junior Data Analyst',          initials: 'FB', email: 'felix.brunner@six-group.com' },
}

// ── Projects (inspired by real SIX initiatives) ─────────────────────────────
// Node x/y are hand-placed per project so the links never cross (planar).
const PROJECTS = [
  {
    id: 'sdx',
    name: 'SDX — Digital Asset Tokenization',
    progress: 68,
    summary: 'Regulated issuance, trading and settlement of tokenized securities on SIX Digital Exchange.',
    nodes: [
      { id: 'digital',  label: 'Digital Assets',        critical: true, x: 0,    y: -150, team: ['lukas', 'marc', 'felix'] },
      { id: 'clearing', label: 'Clearing & Settlement', critical: true, x: -330, y: -170, team: ['sofia', 'anna'] },
      { id: 'api',      label: 'API & Connectivity',                    x: -390, y: 40,   team: ['lukas', 'tom'] },
      { id: 'datagov',  label: 'Data Governance',                       x: -250, y: 40,   team: ['marc', 'felix'] },
      { id: 'refdata',  label: 'Reference Data',                        x: 250,  y: 40,   team: ['anna', 'lena'] },
      { id: 'rega',     label: 'Regulatory Affairs',                    x: 0,    y: 220,  team: ['priya', 'david'] },
    ],
    links: [
      ['digital', 'clearing'], ['digital', 'datagov'], ['digital', 'refdata'],
      ['clearing', 'api'], ['datagov', 'rega'], ['refdata', 'rega'],
    ],
  },
  {
    id: 't1',
    name: 'T+1 Settlement Migration',
    progress: 41,
    summary: 'Shortening the securities settlement cycle to T+1 across post-trade operations.',
    nodes: [
      { id: 'posttrade', label: 'Post-Trade Operations', critical: true, x: 0,    y: 0,    team: ['tom', 'sofia'] },
      { id: 'secserv',   label: 'Securities Services',   critical: true, x: -230, y: -170, team: ['anna', 'lena'] },
      { id: 'rega',      label: 'Regulatory Affairs',                    x: 230,  y: -170, team: ['priya'] },
      { id: 'clearing',  label: 'Clearing (SIX x-clear)',               x: 230,  y: 170,  team: ['sofia'] },
      { id: 'core',      label: 'Core Infrastructure',                  x: -230, y: 170,  team: ['tom'] },
      { id: 'refdata',   label: 'Reference Data',                       x: -440, y: -160, team: ['marc', 'felix'] },
      { id: 'mktops',    label: 'Market Operations',                    x: -440, y: 250,  team: ['lukas'] },
    ],
    links: [
      ['secserv', 'posttrade'], ['rega', 'posttrade'], ['posttrade', 'clearing'],
      ['posttrade', 'core'], ['secserv', 'refdata'], ['core', 'mktops'],
    ],
  },
  {
    id: 'sfdr',
    name: 'SFDR & ESG Data Services',
    progress: 83,
    summary: 'Sourcing, classifying and disclosing ESG/SFDR regulatory data for instruments.',
    nodes: [
      { id: 'susfin',   label: 'Sustainable Finance', critical: true, x: 0,    y: -150, team: ['priya'] },
      { id: 'prodcov',  label: 'Product Coverage',                    x: -260, y: -210, team: ['nina', 'anna'] },
      { id: 'client',   label: 'Client Services',                     x: -450, y: -160, team: ['nina'] },
      { id: 'rega',     label: 'Regulatory Affairs',  critical: true, x: -220, y: 70,   team: ['priya', 'david'] },
      { id: 'datamgmt', label: 'Data Management',                     x: 220,  y: 70,   team: ['marc', 'felix'] },
      { id: 'refdata',  label: 'Reference Data',                      x: 410,  y: 210,  team: ['marc', 'lena'] },
    ],
    links: [
      ['susfin', 'rega'], ['susfin', 'datamgmt'], ['rega', 'datamgmt'],
      ['datamgmt', 'refdata'], ['prodcov', 'susfin'], ['client', 'prodcov'],
    ],
  },
]

// ── Component ───────────────────────────────────────────────────────────────
export default function GraphPane() {
  const fgRef        = useRef()
  const containerRef = useRef()
  const [dims, setDims]         = useState({ w: 800, h: 600 })
  const [projectId, setProjectId] = useState(PROJECTS[0].id)
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery]       = useState('')
  const [selected, setSelected] = useState(null)

  const project = PROJECTS.find(p => p.id === projectId) ?? PROJECTS[0]

  const graphData = useMemo(() => ({
    nodes: project.nodes.map((n) => {
      const isUser = n.label === USER_DEPARTMENT
      return {
        ...n,
        isUser,
        size: isUser ? 22 : n.critical ? 20 : 16,
        fx: n.x, fy: n.y,
      }
    }),
    links: project.links.map(([source, target]) => ({ source, target })),
  }), [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(400, 90), 280)
    return () => clearTimeout(t)
  }, [dims, projectId])

  const zoomBy = useCallback((factor) => {
    const fg = fgRef.current
    if (fg) fg.zoom(fg.zoom() * factor, 300)
  }, [])
  const reset = useCallback(() => fgRef.current?.zoomToFit(400, 90), [])

  function switchProject(id) {
    setProjectId(id)
    setSelected(null)
    setMenuOpen(false)
    setQuery('')
  }

  const paintNode = useCallback((node, ctx) => {
    const r = node.size
    const isSel = node.id === selected

    if (node.isUser) {
      // Soft halo + solid opaque orange — "you are here".
      ctx.beginPath(); ctx.arc(node.x, node.y, r + 10, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(249,115,22,0.18)'; ctx.fill()
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = ORANGE; ctx.fill()
      ctx.lineWidth = 2; ctx.strokeStyle = '#C2410C'; ctx.stroke()
    } else if (node.critical) {
      ctx.beginPath(); ctx.arc(node.x, node.y, r + 10, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(222,57,25,0.10)'; ctx.fill()
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(222,57,25,0.16)'; ctx.fill()
      ctx.lineWidth = 2.5; ctx.strokeStyle = BRAND_RED; ctx.stroke()
    } else {
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = '#FFFFFF'; ctx.fill()
      ctx.lineWidth = 1.5; ctx.strokeStyle = RING_GRAY; ctx.stroke()
    }

    if (isSel) {
      ctx.beginPath(); ctx.arc(node.x, node.y, r + 6, 0, 2 * Math.PI)
      ctx.lineWidth = 2; ctx.strokeStyle = node.isUser ? '#C2410C' : BRAND_RED; ctx.stroke()
    }

    ctx.fillStyle = node.isUser ? '#C2410C' : isSel ? BRAND_RED : LABEL_GRAY
    ctx.font = `${node.isUser || isSel ? '700' : '600'} 13px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(node.label, node.x, node.y + r + 9)
  }, [selected])

  // Selected node + team, retained during slide-out.
  const selNode = project.nodes.find(n => n.id === selected) || null
  const lastRef = useRef(null)
  if (selNode) lastRef.current = { node: selNode, team: selNode.team ?? [] }
  const shown = selNode ? { node: selNode, team: selNode.team ?? [] } : lastRef.current
  const open = !!selNode

  const filteredProjects = PROJECTS.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-canvas px-5 py-5">
      <div className="flex flex-1 min-h-0">
        {/* ── Graph column ──────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-neutral-200/80 bg-white overflow-hidden shadow-card">
            {/* Header: project title (dropdown) + progress + zoom */}
            <div className="relative px-5 py-3.5 shrink-0 border-b border-neutral-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setMenuOpen(o => !o)}
                    className="group flex items-center gap-2 text-left"
                  >
                    <Network size={15} className="text-neutral-400 shrink-0" />
                    <span className="font-display font-bold text-ink text-sm truncate">{project.name}</span>
                    <ChevronDown size={15} className={`shrink-0 text-neutral-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <p className="mt-0.5 text-[11px] text-neutral-400 truncate">{project.summary}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconBtn title="Zoom in"  onClick={() => zoomBy(1.3)}><ZoomIn size={15} /></IconBtn>
                  <IconBtn title="Zoom out" onClick={() => zoomBy(0.77)}><ZoomOut size={15} /></IconBtn>
                  <IconBtn title="Reset view" onClick={reset}><RotateCcw size={14} /></IconBtn>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">Progress</span>
                <div className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full rounded-full bg-six transition-all" style={{ width: `${project.progress}%` }} />
                </div>
                <span className="text-[11px] font-bold text-ink tabular-nums shrink-0">{project.progress}%</span>
              </div>

              {/* Project dropdown */}
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-5 top-14 z-30 w-[340px] rounded-xl border border-neutral-200 bg-white shadow-elevated overflow-hidden">
                    <div className="relative border-b border-neutral-100">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search a project…"
                        className="w-full bg-transparent pl-9 pr-3 py-2.5 text-sm outline-none"
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {filteredProjects.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => switchProject(p.id)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-50 ${
                            p.id === projectId ? 'bg-six-light/50' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-ink truncate">{p.name}</p>
                            <p className="text-[10px] text-neutral-400 truncate">{p.progress}% · {p.nodes.length} departments</p>
                          </div>
                          {p.id === projectId && <Check size={14} className="text-six shrink-0" />}
                        </button>
                      ))}
                      {filteredProjects.length === 0 && (
                        <p className="px-3 py-4 text-center text-xs text-neutral-400">No project found.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Canvas */}
            <div ref={containerRef} className="relative flex-1 min-h-0">
              <ForceGraph2D
                key={projectId}
                ref={fgRef}
                graphData={graphData}
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

              {/* Legend — top-right, below the progress bar */}
              <div className="absolute top-3 right-3 rounded-xl border border-neutral-200 bg-white/90 px-3 py-2 space-y-1.5 shadow-sm backdrop-blur-sm">
                <LegendDot variant="user" label="Your department" />
                <LegendDot variant="critical" label="Critical Domain" />
                <LegendDot variant="active" label="Active Domain" />
                <LegendLine label="Knowledge Link" />
              </div>

              <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2">
                <span className="rounded-full border border-neutral-200 bg-white/85 px-4 py-1.5 text-[11px] text-neutral-400">
                  Click a department to see who works on the project
                </span>
              </div>
            </div>
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
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-sm font-bold text-neutral-500">
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

function LegendDot({ variant, label }) {
  const style =
    variant === 'user'
      ? { backgroundColor: ORANGE, border: '2px solid #C2410C' }
      : variant === 'critical'
      ? { backgroundColor: 'rgba(222,57,25,0.16)', border: `2px solid ${BRAND_RED}` }
      : { backgroundColor: '#FFFFFF', border: `1.5px solid ${RING_GRAY}` }
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full shrink-0" style={style} />
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
