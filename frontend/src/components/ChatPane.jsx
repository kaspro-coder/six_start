import { useState, useRef, useEffect, useCallback } from 'react'
import DocViewer from './DocViewer.jsx'
import GroundedAnswer from './GroundedAnswer.jsx'
import CreateKnowledgeRequest from './escalation/CreateKnowledgeRequest.jsx'
import {
  Send, BookOpen, ArrowUpRight, Landmark, UserCheck,
  FileText, ShieldCheck, Check, Copy, Zap, ClipboardList, User,
} from 'lucide-react'
import { askAgent, askSixthSense, getGroundedAnswer } from '../lib/api.js'
import { collectUserContext } from '../lib/context.js'

const DEMO_ANSWER = {
  title: 'Verify SFDR data for Alpen Privatbank',
  source: "Reconstructed from Jacob's captured workflow · Master Data Opening",
  steps: [
    'Open the Master Data Opening screen and search for the counterparty "Alpen Privatbank".',
    'Enter the instrument ISIN AT0000828553 in the ISIN field and confirm the security resolves.',
    'Open the ESG Data panel and check the SFDR classification (Article 6 / 8 / 9).',
    'Verify that "Regulatory Based" is set to Yes — this confirms the data is from a regulated source.',
    'Cross-check the PAI (Principal Adverse Impact) indicators are populated before sign-off.',
    'Mark the record as Verified and save. The audit trail is updated automatically.',
  ],
}

const STARTERS = [
  'How to verify SFDR data for Alpen Privatbank?',
  'What are the FATCA reporting obligations for a US instrument?',
  'How do I tell if a fund is SFDR Article 8 or Article 9?',
]

const FOLLOW_UPS = [
  'What PAI indicators must be populated before sign-off?',
  'When does an instrument need an onboarding or extension assessment?',
]

function isUnavailableAgent(agent) {
  return !agent?.available || /^SIXth Sense agent unavailable:/i.test(agent?.message || '')
}

function buildSources(ask) {
  if (!ask?.sources) return []
  const seen = new Set()
  return ask.sources.filter(s => {
    const key = s.document ?? s.index
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 6)
}

const GREETING = {
  role: 'assistant', kind: 'text',
  content: "Guten Tag, Cosmina 👋 I'm SIXsens. Ask me how to complete a task and I'll walk you through it using procedures captured from our experts.",
}

export default function ChatPane({ capturedProcedures = [], initialMessages, onMessagesChange, onSelectExpert, onRequestCreated, onGoToInbox }) {
  const [messages,   setMessages]   = useState(initialMessages ?? [GREETING])
  const [input,      setInput]      = useState('')
  const [thinking,   setThinking]   = useState(false)
  const [activeCite, setActiveCite] = useState(null)
  const [splitPct,   setSplitPct]   = useState(50)
  const [escalation, setEscalation] = useState(null)
  const scrollRef  = useRef(null)
  const dividerRef = useRef(null)
  const isEmpty = messages.length === 1 && !thinking

  const handleCiteClick = useCallback((source) => {
    setActiveCite(prev => prev?.index === source?.index ? null : source)
  }, [])

  // Drag to resize split
  function onDividerPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const container = e.currentTarget.parentElement
    function onMove(ev) {
      const rect = container.getBoundingClientRect()
      const pct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100))
      setSplitPct(pct)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  // Persist messages to session history on every update
  useEffect(() => {
    onMessagesChange?.(messages)
  }, [messages])

  function answerFor(question) {
    const q = question.toLowerCase()
    const match = capturedProcedures.find(p => q.includes('sfdr') || q.includes(p.title?.toLowerCase() ?? ' '))
    if (q.includes('sfdr') || q.includes('alpen')) return { role: 'assistant', kind: 'procedure', content: DEMO_ANSWER }
    if (match) return { role: 'assistant', kind: 'procedure', content: match }
    return { role: 'assistant', kind: 'text', content: "I don't have a captured procedure for that yet. Ask an expert to capture this workflow." }
  }

  async function submit(text) {
    const question = (text ?? input).trim()
    if (!question) return
    const recentQueries = messages.filter(m => m.role === 'user').map(m => m.content)
    setMessages(m => [...m, { role: 'user', kind: 'text', content: question }])
    setInput('')
    setThinking(true)

    // Primary path: knowledge & context engine (specs 09/10/11)
    try {
      const context = collectUserContext({ recentQueries })
      const grounded = await getGroundedAnswer(question, context)
      if (grounded && grounded.engine !== 'unavailable') {
        setMessages(m => [...m, { role: 'assistant', kind: 'grounded', content: grounded }])
        setThinking(false)
        return
      }
    } catch {
      // fall through to legacy path
    }

    // Fallback: Phase-2 agent → RAG → local demo
    try {
      const [agentR, askR] = await Promise.allSettled([askAgent(question), askSixthSense(question)])
      const agent = agentR.status === 'fulfilled' ? agentR.value : null
      const ask   = askR.status   === 'fulfilled' ? askR.value   : null
      const sources = buildSources(ask)

      const enrichedSources = sources.map(s => {
        const chunks = [...(ask?.official_rules ?? []), ...(ask?.expert_workflow_context ?? [])]
        const match = chunks.find((_, i) => i + 1 === s.index)
        return { ...s, content: match?.content ?? null }
      })

      if (!isUnavailableAgent(agent) && agent.message) {
        setMessages(m => [...m, { role: 'assistant', kind: 'agent', content: { ...agent, sources: enrichedSources } }])
      } else if (ask?.engine === 'rag' && ask.answer) {
        setMessages(m => [...m, { role: 'assistant', kind: 'rag', content: { ...ask, sources: enrichedSources } }])
      } else {
        setMessages(m => [...m, answerFor(question)])
      }
    } catch {
      setMessages(m => [...m, answerFor(question)])
    } finally {
      setThinking(false)
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-col min-w-0" style={{ width: activeCite ? `${splitPct}%` : '100%', transition: 'width 0.15s' }}>
      {/* Messages */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto scroll-slim px-4 ${isEmpty ? 'flex' : 'py-4 space-y-4'}`}
      >
        {isEmpty ? (
          <EmptyState onPick={submit} />
        ) : (
          <>
            {messages.map((m, i) => (
              <Message
                key={i}
                message={m}
                onAsk={submit}
                onCiteClick={handleCiteClick}
                onSelectExpert={onSelectExpert}
                onEscalate={setEscalation}
              />
            ))}
            {thinking && <Thinking />}
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200/70 bg-white p-3 space-y-1.5">
        <form onSubmit={e => { e.preventDefault(); submit() }} className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask a compliance question…"
            className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50/60 px-3.5 py-2 text-sm outline-none focus:bg-white focus:border-six focus:ring-4 focus:ring-six/10 transition-shadow placeholder:text-neutral-400"
          />
          <button
            type="submit"
            className="rounded-xl bg-six hover:bg-six-dark text-white px-3.5 flex items-center gap-1.5 text-sm font-semibold transition-all shadow-six-glow active:scale-95"
          >
            <Send size={15} />
          </button>
        </form>
        <div className="flex items-center justify-center gap-1.5">
          <ShieldCheck size={10} className="text-neutral-400" />
          <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">
            Grounded in SIX corpus · expert-captured procedures
          </p>
        </div>
      </div>
      </div>

      {activeCite && (
        <>
          {/* Drag handle */}
          <div
            ref={dividerRef}
            className="w-1 bg-neutral-200 hover:bg-six cursor-col-resize shrink-0 transition-colors"
            onPointerDown={onDividerPointerDown}
          />
          <div className="min-w-0 h-full" style={{ width: `${100 - splitPct}%` }}>
            <DocViewer cite={activeCite} onClose={() => setActiveCite(null)} />
          </div>
        </>
      )}

      {escalation && (
        <CreateKnowledgeRequest
          escalation={escalation}
          onClose={() => setEscalation(null)}
          onSubmitted={() => { onRequestCreated?.() }}
          onGoToInbox={() => { setEscalation(null); onGoToInbox?.() }}
        />
      )}
    </div>
  )
}

function EmptyState({ onPick }) {
  return (
    <div className="dot-grid flex-1 flex flex-col items-center justify-center text-center px-5 -mx-4">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-six shadow-six-glow mb-3">
        <span className="h-3 w-3 rounded-[4px] bg-white/90" />
      </div>
      <h2 className="font-display text-lg font-bold tracking-display text-ink">Ask a compliance question</h2>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">
        I'll walk you through it using procedures captured from experts — step by step, with sources.
      </p>
      <div className="mt-5 flex flex-col gap-2 w-full">
        {STARTERS.map(q => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="group flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left text-xs text-ink transition-all hover:border-six hover:shadow-card hover:-translate-y-px"
          >
            <BookOpen size={13} className="shrink-0 text-neutral-400 group-hover:text-six transition-colors" />
            <span className="flex-1">{q}</span>
            <ArrowUpRight size={13} className="shrink-0 text-neutral-300 group-hover:text-six transition-colors" />
          </button>
        ))}
      </div>
    </div>
  )
}

function Message({ message, onAsk, onCiteClick, onSelectExpert, onEscalate }) {
  const isUser = message.role === 'user'
  const wide   = message.kind === 'grounded'
  return (
    <div className={`flex gap-2.5 animate-fade-up ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center shadow-sm ${isUser ? 'bg-neutral-200' : 'bg-six'}`}>
        {isUser
          ? <span className="text-[10px] font-bold text-ink">C</span>
          : <span className="h-1.5 w-1.5 rounded-[2px] bg-white/90" />}
      </div>
      <div className={`${wide ? 'flex-1 min-w-0' : 'max-w-[85%]'} ${isUser ? 'text-right' : ''}`}>
        {message.kind === 'grounded'  && <GroundedAnswer data={message.content} onAsk={onAsk} onCiteClick={onCiteClick} onSelectExpert={onSelectExpert} onEscalate={onEscalate} />}
        {message.kind === 'agent'     && <AgentAnswer data={message.content} onAsk={onAsk} onCiteClick={onCiteClick} onSelectExpert={onSelectExpert} />}
        {message.kind === 'rag'       && <RagAnswer   data={message.content} onAsk={onAsk} onCiteClick={onCiteClick} />}
        {message.kind === 'procedure' && <Procedure   data={message.content} />}
        {message.kind === 'text'      && (
          <div className={`inline-block rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${isUser ? 'bg-ink text-white rounded-tr-md' : 'bg-neutral-100 text-ink rounded-tl-md'}`}>
            {message.content}
          </div>
        )}
      </div>
    </div>
  )
}

function Procedure({ data }) {
  return (
    <div className="inline-block text-left bg-white rounded-2xl rounded-tl-md px-4 py-3 border border-neutral-200/80 shadow-card">
      <p className="font-display font-bold text-sm text-ink">{data.title}</p>
      {data.source && <p className="text-[10px] text-neutral-400 mb-2.5 italic">{data.source}</p>}
      <ol className="space-y-2">
        {data.steps.map((step, i) => (
          <li key={i} className="flex gap-2 text-xs">
            <span className="shrink-0 h-4 w-4 rounded-full bg-six text-white text-[9px] font-bold flex items-center justify-center mt-px">{i + 1}</span>
            <span className="text-ink leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function parseMessage(message) {
  const lines = (message || '').split('\n').map(l => l.trim()).filter(Boolean)
  const lead = [], bullets = []
  for (const line of lines) {
    if (/^[-•*]\s+/.test(line)) bullets.push(line.replace(/^[-•*]\s+/, ''))
    else if (bullets.length === 0) lead.push(line)
    else bullets.push(line)
  }
  return { lead: lead.join(' '), bullets }
}

function buildAgentSources(data) {
  if (Array.isArray(data.sources) && data.sources.length) return data.sources
  return (data.document_citations ?? []).map(citation => {
    const pageMatch = String(citation.page_or_line ?? '').match(/page\s+(\d+)/i)
    const page = pageMatch ? Number(pageMatch[1]) - 1 : null
    return {
      index: citation.id,
      source_type: 'official_rulebook',
      document: citation.source_file,
      page,
      content: citation.relevant_quote,
    }
  })
}

function InlineCitations({ text, sources, onCiteClick }) {
  return String(text ?? '').split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/)
    if (!m) return <span key={i}>{part}</span>
    const n = Number(m[1])
    return <Cite key={i} n={n} source={sources.find(s => s.index === n)} onClick={onCiteClick} />
  })
}

function AgentAnswer({ data, onAsk, onCiteClick, onSelectExpert }) {
  const { lead, bullets } = parseMessage(data.message)
  const sources = buildAgentSources(data)
  const expertCitations = Array.isArray(data.expert_citations) ? data.expert_citations : []
  const hasBpo = data.requires_bpo_action && data.bpo_draft_form
  return (
    <div className="relative inline-block text-left bg-white rounded-2xl rounded-tl-md px-4 py-3 border border-neutral-200/80 shadow-card overflow-hidden">
      <span className="absolute top-0 left-0 h-1.5 w-1.5 bg-six" />
      <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-neutral-100">
        <span className="grid h-4 w-4 place-items-center rounded-md bg-six">
          <span className="h-1 w-1 rounded-[1px] bg-white/90" />
        </span>
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-ink">SIXth Sense</span>
        <span className="text-[10px] text-neutral-400">compliance co-pilot</span>
      </div>
      {lead && (
        <p className="text-xs text-ink mb-2 leading-relaxed">
          <InlineCitations text={lead} sources={sources} onCiteClick={onCiteClick} />
        </p>
      )}
      {bullets.length > 0 ? (
        <ul className="space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-xs text-ink leading-relaxed">
              <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-six shrink-0" />
              <span><InlineCitations text={b} sources={sources} onCiteClick={onCiteClick} /></span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink whitespace-pre-wrap leading-relaxed">
          <InlineCitations text={data.message} sources={sources} onCiteClick={onCiteClick} />
        </p>
      )}
      <SourceChips sources={sources} onCiteClick={onCiteClick} />
      <ExpertCards experts={expertCitations} onSelectExpert={onSelectExpert} />
      {hasBpo && <BpoActionCard form={data.bpo_draft_form} />}
      <NextSteps onAsk={onAsk} form={hasBpo ? data.bpo_draft_form : null} />
    </div>
  )
}

function ExpertCards({ experts, onSelectExpert }) {
  if (!experts?.length) return null
  return (
    <div className="mt-3 border-t border-neutral-100 pt-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Knowledge Experts</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {experts.map(expert => (
          <article key={expert.id ?? expert.email} className="w-full max-w-[230px] rounded-xl border border-six/25 bg-six-light/60 p-3">
            <div className="flex items-start gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-six text-white">
                <User size={15} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-ink">{expert.expert_name}</p>
                <p className="truncate text-[10px] text-neutral-500">{expert.role_title}</p>
              </div>
            </div>
            <button
              className="mt-3 w-full rounded-lg bg-six px-3 py-1.5 text-[10px] font-bold text-white shadow-six-glow transition-colors hover:bg-six-dark"
              onClick={() => onSelectExpert?.(expert)}
              type="button"
            >
              Contact Expert
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}

function RagAnswer({ data, onAsk, onCiteClick }) {
  const a = data.answer
  const sources = buildSources(data)
  return (
    <div className="relative inline-block text-left bg-white rounded-2xl rounded-tl-md px-4 py-3 border border-neutral-200/80 shadow-card overflow-hidden">
      <span className="absolute top-0 left-0 h-1.5 w-1.5 bg-six" />
      <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-neutral-100">
        <span className="grid h-4 w-4 place-items-center rounded-md bg-six">
          <span className="h-1 w-1 rounded-[1px] bg-white/90" />
        </span>
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-ink">SIXth Sense</span>
        <span className="text-[10px] text-neutral-400">grounded answer</span>
      </div>
      <p className="font-display font-bold text-sm text-ink">{a.title}</p>
      {a.summary && <p className="mt-0.5 mb-2.5 text-xs leading-relaxed text-neutral-500">{a.summary}</p>}
      <ol className="space-y-2">
        {a.steps.map((st, i) => (
          <li key={i} className="flex gap-2 text-xs">
            <span className="shrink-0 h-4 w-4 rounded-full bg-six text-white text-[9px] font-bold flex items-center justify-center mt-px">{i + 1}</span>
            <span className="text-ink leading-relaxed">
              {st.text}
              {Array.isArray(st.citations) && st.citations.map(c => (
                <Cite key={c} n={c} source={sources.find(s => s.index === c)} onClick={onCiteClick} />
              ))}
            </span>
          </li>
        ))}
      </ol>
      <SourceChips sources={sources} onCiteClick={onCiteClick} />
      <NextSteps onAsk={onAsk} form={null} />
    </div>
  )
}

// Clickable inline citation — [n] superscript, opens doc viewer on click
function Cite({ n, source, onClick }) {
  return (
    <button
      onClick={() => source && onClick?.(source)}
      disabled={!source}
      type="button"
      className="ml-0.5 align-super font-mono text-[10px] font-semibold text-six hover:underline active:opacity-70 disabled:cursor-default disabled:opacity-60"
    >
      [{n}]
    </button>
  )
}

const SOURCE_META = {
  official_rulebook:      { Icon: Landmark,  cls: 'border-neutral-200 bg-neutral-50 text-neutral-500' },
  tacit_expert_knowledge: { Icon: UserCheck, cls: 'border-six/30 bg-six-light/60 text-six' },
}

function cleanDoc(doc) {
  return String(doc).split('/').pop().replace(/\.(md|txt|pdf|json|html?|docx?)$/i, '')
}

function SourceChips({ sources, onCiteClick }) {
  if (!sources?.length) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-neutral-100 pt-2.5">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Sources</span>
      {sources.map((s, i) => {
        const isObj = s && typeof s === 'object'
        const meta  = (isObj && SOURCE_META[s.source_type]) || { Icon: FileText, cls: 'border-neutral-200 bg-neutral-50 text-neutral-500' }
        const label = isObj ? cleanDoc(s.document ?? s.index) : String(s)
        return (
          <button
            key={i}
            onClick={() => onCiteClick?.(isObj ? s : null)}
            className={`inline-flex max-w-[180px] items-center gap-1 rounded-md border px-2 py-1 transition-all hover:brightness-95 active:scale-95 ${meta.cls}`}
          >
            {isObj && s.index != null && <span className="font-mono text-[10px] opacity-70 shrink-0">[{s.index}]</span>}
            <meta.Icon size={11} className="shrink-0" />
            <span className="truncate font-mono text-[10px] text-ink">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function NextSteps({ onAsk, form }) {
  const [copied, setCopied] = useState(false)
  function copyDraft() {
    try { navigator.clipboard?.writeText(JSON.stringify(form, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch {}
  }
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-neutral-100 pt-2.5">
      {form && (
        <button onClick={copyDraft} className="inline-flex items-center gap-1 rounded-lg border border-six px-2.5 py-1 text-[10px] font-bold text-six hover:bg-six hover:text-white transition-all active:scale-95">
          {copied ? <Check size={11} /> : <Copy size={11} />}{copied ? 'Copied' : 'Copy draft JSON'}
        </button>
      )}
      {FOLLOW_UPS.map(q => (
        <button key={q} onClick={() => onAsk?.(q)} className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-[10px] font-semibold text-neutral-500 hover:border-six hover:text-six transition-all active:scale-95">
          {q}<ArrowUpRight size={11} />
        </button>
      ))}
    </div>
  )
}

const BPO_LABELS = { instrument_id: 'Instrument ID', mifid_reportable: 'MiFID II', sfdr_ghg_emissions: 'SFDR · GHG', fatca_scope: 'FATCA scope' }

function BpoActionCard({ form }) {
  return (
    <div className="mt-3 rounded-xl border border-six/25 bg-six-light/60 overflow-hidden shadow-card animate-reveal">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-six text-white">
        <Zap size={12} fill="currentColor" />
        <span className="text-[11px] font-bold tracking-wide">Action routed · Master Data extension</span>
        <ClipboardList size={12} className="ml-auto opacity-90" />
      </div>
      <div className="px-3 py-2.5 space-y-1.5">
        {Object.entries(form).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 text-[11px]">
            <span className="w-24 font-medium text-neutral-500 shrink-0">{BPO_LABELS[key] ?? key}</span>
            {value == null
              ? <span className="text-neutral-400 italic">awaiting input</span>
              : <span className={key === 'instrument_id' ? 'font-mono font-semibold text-ink' : 'font-semibold text-ink'}>{String(value)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Thinking() {
  return (
    <div className="flex gap-2.5 animate-fade-up">
      <div className="h-7 w-7 rounded-lg bg-six flex items-center justify-center shadow-sm">
        <span className="h-1.5 w-1.5 rounded-[2px] bg-white/90" />
      </div>
      <div className="bg-neutral-100 rounded-2xl rounded-tl-md px-4 py-3 flex gap-1.5 items-center">
        {[0,1,2].map(i => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  )
}
