import { useState, useRef, useEffect } from 'react'
import {
  Send, FileCheck2, Zap, ClipboardList, Search,
  ArrowUpRight, BookOpen, FileText, Copy, Check, ShieldCheck, Landmark, UserCheck,
} from 'lucide-react'
import { askAgent, askSixthSense } from '../lib/api.js'

// Collapse /api/ask's retrieved chunks into a tidy, de-duplicated citation
// list: one chip per source document, capped so the answer stays readable.
function buildSources(ask) {
  if (!ask || !Array.isArray(ask.sources)) return []
  const seen = new Set()
  const out = []
  for (const s of ask.sources) {
    const key = s.document ?? s.index
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= 6) break
  }
  return out
}

// The flagship demo answer: a procedure reconstructed from Jacob's captured
// workflow, surfaced (offline fallback) when Cosmina asks the SFDR question.
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

// Curated "golden" questions — grounded in the SIX corpus (SFDR, MiFID, FATCA,
// ESG structured products, master data). Searchable in the side panel.
const GOLDEN_QUESTIONS = [
  'How to verify SFDR data for Alpen Privatbank?',
  'How do we handle ESG-linked structured products?',
  'Is ISIN AT0000828553 in standard coverage?',
  'What are the FATCA reporting obligations for a US instrument?',
  'Which MiFID II reference-data attributes are required for a structured product?',
  'How do I tell if a fund is SFDR Article 8 or Article 9?',
  'What PAI indicators must be populated before sign-off?',
  'When does an instrument need an onboarding or extension assessment?',
]

// Three opener prompts for the empty state — the strongest demo entry points.
const STARTERS = [
  'How to verify SFDR data for Alpen Privatbank?',
  'What are the FATCA reporting obligations for a US instrument?',
  'How do I tell if a fund is SFDR Article 8 or Article 9?',
]

// "Suggested next steps" rendered as chips under each answer (à la Stitch).
// These are real golden questions, not fabricated follow-ups — clicking one
// continues the conversation.
const FOLLOW_UPS = [
  'What PAI indicators must be populated before sign-off?',
  'When does an instrument need an onboarding or extension assessment?',
]

export default function EmployeeSpace({ capturedProcedures = [] }) {
  const GREETING = {
    role: 'assistant',
    kind: 'text',
    content:
      "Guten Tag, Cosmina 👋 I'm SIXsens. Ask me how to complete a task and I'll walk you through it using procedures captured from our experts.",
  }
  const [messages, setMessages] = useState([GREETING])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [search, setSearch] = useState('')
  const scrollRef = useRef(null)

  // Conversation hasn't started yet — show the hero opener instead of a void.
  const isEmpty = messages.length === 1 && !thinking

  const goldenMatches = GOLDEN_QUESTIONS.filter((q) =>
    q.toLowerCase().includes(search.trim().toLowerCase()),
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  function answerFor(question) {
    const q = question.toLowerCase()
    // Prefer a live-captured procedure if its title matches the question.
    const match = capturedProcedures.find((p) =>
      q.includes('sfdr') || q.includes(p.title?.toLowerCase() ?? ' '),
    )
    if (q.includes('sfdr') || q.includes('alpen')) {
      return { role: 'assistant', kind: 'procedure', content: DEMO_ANSWER }
    }
    if (match) {
      return { role: 'assistant', kind: 'procedure', content: match }
    }
    return {
      role: 'assistant',
      kind: 'text',
      content:
        "I don't have a captured procedure for that yet. Try the demo question, or ask an expert (Jacob) to capture this workflow in the Expert Space.",
    }
  }

  async function submit(text) {
    const question = (text ?? input).trim()
    if (!question) return
    setMessages((m) => [...m, { role: 'user', kind: 'text', content: question }])
    setInput('')
    setThinking(true)
    try {
      // Two grounded paths, run in parallel:
      //  • /api/agent — Walter's-Workflow guidance + BPO action routing
      //  • /api/ask   — dual-context RAG that also returns real source citations
      // We render the agent's answer + BPO card (the primary experience) and
      // attach /api/ask's retrieved sources as citation chips.
      const [agentR, askR] = await Promise.allSettled([
        askAgent(question),
        askSixthSense(question),
      ])
      const agent = agentR.status === 'fulfilled' ? agentR.value : null
      const ask = askR.status === 'fulfilled' ? askR.value : null
      const sources = buildSources(ask)

      if (agent?.available && agent.message) {
        setMessages((m) => [
          ...m,
          { role: 'assistant', kind: 'agent', content: { ...agent, sources } },
        ])
      } else if (ask?.engine === 'rag' && ask.answer) {
        // Agent unavailable but the RAG path answered — render its fully-cited
        // structured procedure (per-step [n] citations + sources).
        setMessages((m) => [...m, { role: 'assistant', kind: 'rag', content: ask }])
      } else {
        // Neither grounded path is active — local demo fallback.
        setMessages((m) => [...m, answerFor(question)])
      }
    } catch {
      // Backend unreachable — offline demo fallback.
      setMessages((m) => [...m, answerFor(question)])
    } finally {
      setThinking(false)
    }
  }

  return (
    <div className="grid md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_340px] gap-6 md:h-full md:min-h-0">
      {/* ── Hero surface: the chat. Elevated above the quiet side panels.
          Fills the available viewport height on desktop; a tall, bounded
          panel on mobile so it never collapses in the stacked layout. ── */}
      <section className="bg-white rounded-2xl border border-neutral-200/70 shadow-elevated flex flex-col h-[68vh] min-h-[460px] md:h-full md:min-h-0 overflow-hidden">
        <div
          ref={scrollRef}
          className={`flex-1 overflow-y-auto scroll-slim px-5 ${isEmpty ? 'flex' : 'py-5 space-y-5'}`}
        >
          {isEmpty ? (
            <EmptyState onPick={submit} />
          ) : (
            <>
              {messages.map((m, i) => (
                <Message key={i} message={m} onAsk={submit} />
              ))}
              {thinking && <Thinking />}
            </>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="p-3 border-t border-neutral-200/70 bg-white flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask how to complete a compliance task…"
            className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-2.5 text-sm outline-none transition-shadow placeholder:text-neutral-400 focus:bg-white focus:border-six focus:ring-4 focus:ring-six/10"
          />
          <button
            type="submit"
            className="rounded-xl bg-six hover:bg-six-dark active:scale-[0.98] text-white px-4 flex items-center gap-1.5 text-sm font-semibold transition-all shadow-six-glow"
          >
            <Send size={16} /> Send
          </button>
        </form>
        <div className="flex items-center justify-center gap-1.5 pb-2.5 -mt-1">
          <ShieldCheck size={11} className="text-neutral-400" />
          <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">
            Grounded in the SIX corpus · expert-captured procedures
          </p>
        </div>
      </section>

      {/* ── Quiet supporting rail ─────────────────────────────────────── */}
      <aside className="flex flex-col gap-3.5 md:min-h-0">
        <div className="bg-white rounded-2xl border border-neutral-200/70 shadow-card p-4 flex flex-col md:min-h-0 md:flex-1">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-six" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Golden questions
            </h3>
          </div>
          <div className="relative mb-2.5">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions…"
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50/60 pl-8 pr-2 py-1.5 text-xs outline-none transition-shadow focus:bg-white focus:border-six focus:ring-4 focus:ring-six/10"
            />
          </div>
          <div className="space-y-1 max-h-[19rem] md:max-h-none md:flex-1 overflow-y-auto scroll-slim -mr-1 pr-1">
            {goldenMatches.length === 0 ? (
              <p className="text-xs text-neutral-400 px-1 py-2">No matching questions.</p>
            ) : (
              goldenMatches.map((q) => (
                <button
                  key={q}
                  onClick={() => submit(q)}
                  className="group flex w-full items-start gap-2 text-left text-xs rounded-lg border border-transparent text-ink hover:border-six/30 hover:bg-six-light px-2.5 py-2 transition-colors"
                >
                  <span className="flex-1 leading-snug">{q}</span>
                  <ArrowUpRight
                    size={13}
                    className="mt-px shrink-0 text-neutral-300 transition-colors group-hover:text-six"
                  />
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200/70 shadow-card p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-six-light">
              <FileCheck2 size={15} className="text-six" />
            </span>
            <span className="text-sm font-bold text-ink">
              {capturedProcedures.length} procedure{capturedProcedures.length === 1 ? '' : 's'}
            </span>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              in knowledge base
            </span>
          </div>
          <p className="text-xs leading-relaxed text-neutral-500">
            Answers are grounded in the SIX corpus and procedures captured from experts via
            task mining. Capture more in the{' '}
            <span className="font-semibold text-ink">Expert Space</span>.
          </p>
        </div>
      </aside>
    </div>
  )
}

// Replaces the empty-chat void with a confident opener: value prop + the three
// strongest starter prompts. The demo opens on intent, not blankness.
function EmptyState({ onPick }) {
  return (
    <div className="dot-grid relative flex-1 flex flex-col items-center justify-center text-center px-6 -mx-5">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-six shadow-six-glow mb-4">
        <span className="h-3.5 w-3.5 rounded-[5px] bg-white/90" />
      </div>
      <h2 className="font-display text-xl font-bold tracking-display text-ink">
        Ask how to complete a compliance task
      </h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-neutral-500">
        I'll walk you through a procedure an expert already performed — step by step, with the
        source it came from.
      </p>
      <div className="mt-6 flex flex-col gap-2 w-full max-w-md">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          Try one
        </span>
        {STARTERS.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="group flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-left text-sm text-ink transition-all hover:border-six hover:shadow-card hover:-translate-y-px"
          >
            <BookOpen size={15} className="shrink-0 text-neutral-400 transition-colors group-hover:text-six" />
            <span className="flex-1">{q}</span>
            <ArrowUpRight size={15} className="shrink-0 text-neutral-300 transition-colors group-hover:text-six" />
          </button>
        ))}
      </div>
    </div>
  )
}

function Message({ message, onAsk }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-3 animate-fade-up ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center shadow-sm ${
          isUser ? 'bg-neutral-200 text-ink' : 'bg-six'
        }`}
      >
        {isUser ? (
          <span className="text-xs font-bold">C</span>
        ) : (
          <span className="h-2 w-2 rounded-[3px] bg-white/90" />
        )}
      </div>
      <div className={`max-w-[82%] ${isUser ? 'text-right' : ''}`}>
        {message.kind === 'agent' ? (
          <AgentAnswer data={message.content} onAsk={onAsk} />
        ) : message.kind === 'rag' ? (
          <RagAnswer data={message.content} onAsk={onAsk} />
        ) : message.kind === 'procedure' ? (
          <Procedure data={message.content} />
        ) : (
          <div
            className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              isUser ? 'bg-ink text-white rounded-tr-md' : 'bg-neutral-100 text-ink rounded-tl-md'
            }`}
          >
            {message.content}
          </div>
        )}
      </div>
    </div>
  )
}

function Procedure({ data }) {
  return (
    <div className="inline-block text-left bg-white rounded-2xl rounded-tl-md px-4 py-3.5 border border-neutral-200/80 shadow-card">
      <p className="font-display font-bold text-ink">{data.title}</p>
      {data.source && (
        <p className="text-[11px] text-neutral-500 mb-3 italic">{data.source}</p>
      )}
      <ol className="space-y-2.5 mt-1">
        {data.steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <span className="shrink-0 h-5 w-5 rounded-full bg-six text-white text-[11px] font-bold flex items-center justify-center mt-px">
              {i + 1}
            </span>
            <span className="text-ink leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// Split the agent's message into an optional lead line + bullet points. The
// model is prompted to emit "- " bullets; we render them as a branded list so
// the answer reads natively in the UI rather than as a wall of text.
function parseMessage(message) {
  const lines = (message || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const lead = []
  const bullets = []
  for (const line of lines) {
    if (/^[-•*]\s+/.test(line)) bullets.push(line.replace(/^[-•*]\s+/, ''))
    else if (bullets.length === 0) lead.push(line) // intro before any bullet
    else bullets.push(line) // wrapped continuation — keep as its own point
  }
  return { lead: lead.join(' '), bullets }
}

// Phase-2 agent answer rendered as an institutional "synthesis" card (inspired
// by the Stitch reference): a kicker label, the guidance as bullets, optional
// source citations, the auto-drafted BPO form on action-routing, and suggested
// next steps. The red corner square is the SIX framing motif.
function AgentAnswer({ data, onAsk }) {
  const { lead, bullets } = parseMessage(data.message)
  // Forward-compatible: the agent endpoint doesn't return citations yet, but
  // the retrieval path (/api/ask) does — render them as mono chips if present.
  const sources = Array.isArray(data.sources) ? data.sources : []
  const hasBpo = data.requires_bpo_action && data.bpo_draft_form
  return (
    <div className="relative inline-block text-left bg-white rounded-2xl rounded-tl-md px-4 py-3.5 border border-neutral-200/80 shadow-card overflow-hidden">
      <span className="absolute top-0 left-0 h-1.5 w-1.5 bg-six" />
      <div className="flex items-center gap-1.5 mb-2.5 pb-2.5 border-b border-neutral-100">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-six">
          <span className="h-1.5 w-1.5 rounded-[2px] bg-white/90" />
        </span>
        <span className="font-display text-[11px] font-bold uppercase tracking-widest text-ink">
          SIXth Sense
        </span>
        <span className="text-[10px] font-medium text-neutral-400">compliance assistant</span>
      </div>
      {lead && <p className="text-sm text-ink mb-2.5 leading-relaxed">{lead}</p>}
      {bullets.length > 0 ? (
        <ul className="space-y-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-ink leading-relaxed">
              <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-six shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{data.message}</p>
      )}

      <SourceChips sources={sources} />

      {hasBpo && <BpoActionCard form={data.bpo_draft_form} />}

      <NextSteps onAsk={onAsk} form={hasBpo ? data.bpo_draft_form : null} />
    </div>
  )
}

// Suggested next steps as chips — real follow-up questions (re-submit on click)
// plus a functional "copy the draft form" action when one was routed.
function NextSteps({ onAsk, form }) {
  const [copied, setCopied] = useState(false)
  function copyDraft() {
    try {
      navigator.clipboard?.writeText(JSON.stringify(form, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable (e.g. insecure context) — no-op */
    }
  }
  return (
    <div className="mt-3.5 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
      {form && (
        <button
          onClick={copyDraft}
          className="inline-flex items-center gap-1.5 rounded-lg border border-six px-3 py-1.5 text-[11px] font-bold text-six transition-all hover:bg-six hover:text-white active:scale-95"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy draft as JSON'}
        </button>
      )}
      {FOLLOW_UPS.map((q) => (
        <button
          key={q}
          onClick={() => onAsk?.(q)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-500 transition-all hover:border-six hover:text-six active:scale-95"
        >
          {q}
          <ArrowUpRight size={12} />
        </button>
      ))}
    </div>
  )
}

// Presentation per retrieval source type. The distinction is the product's
// core story made visible: answers are grounded in BOTH the official rulebook
// and tacit expert knowledge captured via task mining.
const SOURCE_META = {
  official_rulebook: { Icon: Landmark, cls: 'border-neutral-200 bg-neutral-50 text-neutral-500' },
  tacit_expert_knowledge: { Icon: UserCheck, cls: 'border-six/30 bg-six-light/60 text-six' },
}

// Strip a corpus path down to a readable document label.
function cleanDoc(doc) {
  return String(doc)
    .split('/')
    .pop()
    .replace(/\.(md|markdown|txt|pdf|json|html?)$/i, '')
}

// Real citations from /api/ask. Each chip is type-tagged so official-rulebook
// and captured-expert sources read differently at a glance. Renders nothing
// when no sources came back, so it's safe on every answer.
function SourceChips({ sources }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-neutral-100 pt-3">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        Sources
      </span>
      {sources.map((s, i) => {
        const isObj = s && typeof s === 'object'
        const meta = (isObj && SOURCE_META[s.source_type]) || {
          Icon: FileText,
          cls: 'border-neutral-200 bg-neutral-50 text-neutral-500',
        }
        const label = isObj ? cleanDoc(s.document ?? s.index) : String(s)
        const tip = isObj
          ? `${s.document ?? ''} · ${s.source_type?.replace(/_/g, ' ') ?? ''}`.trim()
          : undefined
        return (
          <span
            key={i}
            title={tip}
            className={`inline-flex max-w-[220px] items-center gap-1 rounded-md border px-2 py-1 ${meta.cls}`}
          >
            {isObj && s.index != null && (
              <span className="font-mono text-[10px] opacity-70 shrink-0">[{s.index}]</span>
            )}
            <meta.Icon size={12} className="shrink-0" />
            <span className="truncate font-mono text-[11px] text-ink">{label}</span>
          </span>
        )
      })}
    </div>
  )
}

// A single inline citation marker (e.g. ¹ ²) used by RagAnswer's steps.
function Cite({ n }) {
  return (
    <sup className="ml-0.5 font-mono text-[10px] font-semibold text-six">[{n}]</sup>
  )
}

// Fully-cited structured answer from the RAG path (/api/ask). Used when the
// agent is unavailable but retrieval + generation succeeded — each step shows
// the source indices it rests on, tying directly to the source chips below.
function RagAnswer({ data, onAsk }) {
  const a = data.answer
  const sources = buildSources(data)
  return (
    <div className="relative inline-block text-left bg-white rounded-2xl rounded-tl-md px-4 py-3.5 border border-neutral-200/80 shadow-card overflow-hidden">
      <span className="absolute top-0 left-0 h-1.5 w-1.5 bg-six" />
      <div className="flex items-center gap-1.5 mb-2.5 pb-2.5 border-b border-neutral-100">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-six">
          <span className="h-1.5 w-1.5 rounded-[2px] bg-white/90" />
        </span>
        <span className="font-display text-[11px] font-bold uppercase tracking-widest text-ink">
          SIXth Sense
        </span>
        <span className="text-[10px] font-medium text-neutral-400">grounded answer</span>
      </div>
      <p className="font-display font-bold text-ink">{a.title}</p>
      {a.summary && <p className="mt-1 mb-3 text-sm leading-relaxed text-neutral-600">{a.summary}</p>}
      <ol className="space-y-2.5">
        {a.steps.map((st, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <span className="shrink-0 h-5 w-5 rounded-full bg-six text-white text-[11px] font-bold flex items-center justify-center mt-px">
              {i + 1}
            </span>
            <span className="text-ink leading-relaxed">
              {st.text}
              {Array.isArray(st.citations) &&
                st.citations.map((c) => <Cite key={c} n={c} />)}
            </span>
          </li>
        ))}
      </ol>
      <SourceChips sources={sources} />
      <NextSteps onAsk={onAsk} form={null} />
    </div>
  )
}

// Human-readable labels for the BPO draft-form fields the agent fills.
const BPO_FIELD_LABELS = {
  instrument_id: 'Instrument ID (ISIN)',
  mifid_reportable: 'MiFID II reportable',
  sfdr_ghg_emissions: 'SFDR · GHG emissions',
  fatca_scope: 'FATCA scope',
}

// The "wow" artifact: the agent didn't just answer — it drafted the actual BPO
// extension form. Rendered as a crisp, confident hand-off card.
function BpoActionCard({ form }) {
  return (
    <div className="mt-3.5 rounded-xl border border-six/25 bg-six-light/60 overflow-hidden shadow-card animate-reveal">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-six text-white">
        <Zap size={13} fill="currentColor" />
        <span className="text-xs font-bold tracking-wide">Action routed · Master Data extension</span>
        <ClipboardList size={13} className="ml-auto opacity-90" />
      </div>
      <div className="px-3.5 py-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-six/80">
          Draft BPO form · auto-filled
        </p>
        <div className="divide-y divide-six/10">
          {Object.entries(form).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 text-xs py-1.5 first:pt-0 last:pb-0">
              <span className="shrink-0 w-32 font-medium text-neutral-500">
                {BPO_FIELD_LABELS[key] ?? key}
              </span>
              {value == null ? (
                <span className="text-neutral-400 italic">awaiting input</span>
              ) : (
                <span
                  className={
                    key === 'instrument_id'
                      ? 'font-mono font-semibold text-ink'
                      : 'font-semibold text-ink'
                  }
                >
                  {String(value)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Thinking() {
  return (
    <div className="flex gap-3 animate-fade-up">
      <div className="h-8 w-8 rounded-lg bg-six flex items-center justify-center shadow-sm">
        <span className="h-2 w-2 rounded-[3px] bg-white/90" />
      </div>
      <div className="bg-neutral-100 rounded-2xl rounded-tl-md px-4 py-3.5 flex gap-1.5 items-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-neutral-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}
