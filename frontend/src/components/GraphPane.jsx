import { useRef, useCallback, useState, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

const BRAND_RED = '#DE3919'
const INK       = '#1A1A1A'
const NEUTRAL   = '#D4D0CB'

// ── Static graph data ──────────────────────────────────────────────────────

const EXPERT_NODES = [
  { id: 'jacob',  label: 'Jacob M.',  role: 'Master Data SME',           color: BRAND_RED,  group: 'expert' },
  { id: 'elena',  label: 'Elena V.',  role: 'Regulatory Compliance Lead', color: '#6366F1',  group: 'expert' },
  { id: 'thomas', label: 'Thomas B.', role: 'Reference Data Specialist',  color: '#059669',  group: 'expert' },
  { id: 'priya',  label: 'Priya S.',  role: 'ESG Data Analyst',           color: '#0D9488',  group: 'expert' },
  { id: 'marco',  label: 'Marco F.',  role: 'Operations Manager',         color: '#D97706',  group: 'expert' },
]

const DOMAIN_NODES = [
  { id: 'd-sfdr',         label: 'SFDR',                  group: 'domain' },
  { id: 'd-mifid',        label: 'MiFID II',              group: 'domain' },
  { id: 'd-fatca',        label: 'FATCA',                 group: 'domain' },
  { id: 'd-masterdata',   label: 'Master Data',           group: 'domain' },
  { id: 'd-esg',          label: 'ESG Data',              group: 'domain' },
  { id: 'd-counterparty', label: 'Counterparty',          group: 'domain' },
  { id: 'd-taxonomy',     label: 'EU Taxonomy',           group: 'domain' },
  { id: 'd-pai',          label: 'PAI Indicators',        group: 'domain' },
  { id: 'd-reconcile',    label: 'Reconciliation',        group: 'domain' },
  { id: 'd-reporting',    label: 'Regulatory Reporting',  group: 'domain' },
  { id: 'd-bulk',         label: 'Bulk Processing',       group: 'domain' },
  { id: 'd-vendor',       label: 'Vendor Feeds',          group: 'domain' },
]

const SOURCE_NODES = [
  { id: 's-rulebook', label: 'Official Rulebook',   group: 'source', color: '#78716C' },
  { id: 's-expert',   label: 'Expert Knowledge',    group: 'source', color: BRAND_RED },
]

const LINKS = [
  // Jacob
  { source: 'jacob', target: 'd-masterdata' },
  { source: 'jacob', target: 'd-sfdr' },
  { source: 'jacob', target: 'd-esg' },
  { source: 'jacob', target: 'd-counterparty' },
  // Elena
  { source: 'elena', target: 'd-fatca' },
  { source: 'elena', target: 'd-mifid' },
  { source: 'elena', target: 'd-reporting' },
  // Thomas
  { source: 'thomas', target: 'd-masterdata' },
  { source: 'thomas', target: 'd-counterparty' },
  { source: 'thomas', target: 'd-reconcile' },
  // Priya
  { source: 'priya', target: 'd-sfdr' },
  { source: 'priya', target: 'd-taxonomy' },
  { source: 'priya', target: 'd-pai' },
  { source: 'priya', target: 'd-esg' },
  // Marco
  { source: 'marco', target: 'd-bulk' },
  { source: 'marco', target: 'd-vendor' },
  { source: 'marco', target: 'd-reconcile' },
  // Domains → sources
  { source: 'd-sfdr',         target: 's-rulebook' },
  { source: 'd-sfdr',         target: 's-expert' },
  { source: 'd-mifid',        target: 's-rulebook' },
  { source: 'd-fatca',        target: 's-rulebook' },
  { source: 'd-masterdata',   target: 's-expert' },
  { source: 'd-esg',          target: 's-expert' },
  { source: 'd-counterparty', target: 's-expert' },
  { source: 'd-taxonomy',     target: 's-rulebook' },
  { source: 'd-pai',          target: 's-rulebook' },
  { source: 'd-pai',          target: 's-expert' },
  { source: 'd-reconcile',    target: 's-expert' },
  { source: 'd-reporting',    target: 's-rulebook' },
  { source: 'd-bulk',         target: 's-expert' },
  { source: 'd-vendor',       target: 's-expert' },
]

const GRAPH_DATA = {
  nodes: [...EXPERT_NODES, ...DOMAIN_NODES, ...SOURCE_NODES],
  links: LINKS,
}

// ── Component ──────────────────────────────────────────────────────────────

export default function GraphPane() {
  const fgRef                   = useRef()
  const containerRef            = useRef()
  const [dims, setDims]         = useState({ w: 800, h: 600 })
  const [hovered, setHovered]   = useState(null)
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

  // Zoom to fit after mount
  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(400, 60), 300)
    return () => clearTimeout(t)
  }, [dims])

  // Which node IDs are connected to the selected node
  const connectedIds = useCallback((nodeId) => {
    if (!nodeId) return new Set()
    const ids = new Set([nodeId])
    LINKS.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      if (s === nodeId) ids.add(t)
      if (t === nodeId) ids.add(s)
    })
    return ids
  }, [])

  const activeIds = connectedIds(selected)

  const paintNode = useCallback((node, ctx, globalScale) => {
    const isExpert = node.group === 'expert'
    const isDomain = node.group === 'domain'
    const isSource = node.group === 'source'

    const dimmed = selected && !activeIds.has(node.id)
    const alpha  = dimmed ? 0.2 : 1

    ctx.globalAlpha = alpha

    if (isExpert) {
      const r = 18
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = node.color
      ctx.fill()
      // Initials
      ctx.globalAlpha = dimmed ? 0.2 : 1
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(7, 10 / globalScale * 2)}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(node.label.split(' ')[0][0] + node.label.split(' ')[1]?.[0] ?? '', node.x, node.y)
    } else if (isDomain) {
      const r = 10
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = selected && activeIds.has(node.id) ? '#F0EDEA' : '#F0EDEA'
      ctx.fill()
      ctx.strokeStyle = selected && activeIds.has(node.id) ? BRAND_RED : NEUTRAL
      ctx.lineWidth = selected && activeIds.has(node.id) ? 2 : 1
      ctx.stroke()
    } else if (isSource) {
      const r = 14
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = node.color + '22'
      ctx.fill()
      ctx.strokeStyle = node.color
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Label below node
    const labelSize = isExpert ? 9 : isDomain ? 8 : 8
    ctx.globalAlpha = dimmed ? 0.15 : 0.85
    ctx.fillStyle = INK
    ctx.font = `${isExpert ? '600' : '500'} ${labelSize}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const yOff = isExpert ? 22 : isDomain ? 13 : 18
    ctx.fillText(node.label, node.x, node.y + yOff)

    ctx.globalAlpha = 1
  }, [selected, activeIds])

  const linkColor = useCallback((link) => {
    if (!selected) return NEUTRAL + '99'
    const s = typeof link.source === 'object' ? link.source.id : link.source
    const t = typeof link.target === 'object' ? link.target.id : link.target
    return (activeIds.has(s) && activeIds.has(t)) ? BRAND_RED + 'CC' : NEUTRAL + '22'
  }, [selected, activeIds])

  const linkWidth = useCallback((link) => {
    if (!selected) return 1
    const s = typeof link.source === 'object' ? link.source.id : link.source
    const t = typeof link.target === 'object' ? link.target.id : link.target
    return (activeIds.has(s) && activeIds.has(t)) ? 2 : 0.5
  }, [selected, activeIds])

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-3 shrink-0 border-b border-neutral-100 flex items-end justify-between">
        <div>
          <h1 className="font-display font-bold text-ink text-base">Knowledge Graph</h1>
          <p className="text-xs text-neutral-400 mt-0.5">Click a node to highlight its connections</p>
        </div>
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="text-[10px] font-semibold text-neutral-400 hover:text-ink transition-colors"
          >
            Clear selection
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-6 py-2 shrink-0 border-b border-neutral-100">
        <LegendItem color={BRAND_RED}  filled label="Expert" />
        <LegendItem color={NEUTRAL}    border label="Knowledge domain" />
        <LegendItem color="#78716C"    border label="Source type" />
      </div>

      {/* Tooltip */}
      {hovered && (
        <div className="absolute z-10 pointer-events-none left-1/2 -translate-x-1/2 mt-2">
          <div className="bg-white border border-neutral-200/80 shadow-elevated rounded-xl px-3 py-2 text-xs">
            <p className="font-semibold text-ink">{hovered.label}</p>
            {hovered.role && <p className="text-neutral-400">{hovered.role}</p>}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-canvas">
        <ForceGraph2D
          ref={fgRef}
          graphData={GRAPH_DATA}
          width={dims.w}
          height={dims.h}
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => 'replace'}
          nodeRelSize={6}
          nodeVal={n => n.group === 'expert' ? 4 : n.group === 'source' ? 2.5 : 1.5}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalParticles={selected ? 2 : 0}
          linkDirectionalParticleColor={() => BRAND_RED}
          linkDirectionalParticleWidth={2}
          onNodeHover={node => setHovered(node || null)}
          onNodeClick={node => setSelected(s => s === node.id ? null : node.id)}
          cooldownTicks={120}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          backgroundColor="#F7F5F3"
        />
      </div>
    </div>
  )
}

function LegendItem({ color, filled, border, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{
          backgroundColor: filled ? color : color + '22',
          border: border ? `1.5px solid ${color}` : 'none',
        }}
      />
      <span className="text-[10px] text-neutral-500 font-medium">{label}</span>
    </div>
  )
}
