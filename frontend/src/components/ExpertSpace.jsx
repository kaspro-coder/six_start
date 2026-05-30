import { useState, useRef } from 'react'
import { record } from 'rrweb'
import {
  Circle,
  Square,
  Loader2,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Radio,
  ArrowRight,
} from 'lucide-react'
import { processWorkflow } from '../lib/api.js'

export default function ExpertSpace({ onWorkflowCaptured }) {
  const [recording, setRecording] = useState(false)
  const [eventCount, setEventCount] = useState(0)
  const [status, setStatus] = useState(null) // 'sending' | 'done' | 'error'
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  // rrweb's record() returns a stop function; events accumulate in a ref.
  const eventsRef = useRef([])
  const stopFnRef = useRef(null)
  const counterTimerRef = useRef(null)

  // Mock dashboard form state (the workflow the expert performs).
  const [form, setForm] = useState({
    isin: '',
    counterparty: '',
    sfdrArticle: 'Article 8',
    regulatoryBased: 'No',
  })

  function startCapture() {
    eventsRef.current = []
    setEventCount(0)
    setResult(null)
    setStatus(null)
    setErrorMsg(null)

    stopFnRef.current = record({
      // Accumulate into a ref only — do NOT setState here. Re-rendering the
      // live counter mutates the DOM, which rrweb would record as a new event,
      // emitting again → an infinite feedback loop. Keep emit() side-effect free.
      emit(event) {
        eventsRef.current.push(event)
      },
      // The Task Mining control panel is our own tooling, not the expert's
      // workflow. Exclude it from recording so its (throttled) counter updates
      // can't feed back into the capture.
      blockClass: 'rr-block',
      // Capture input values so the procedure can reference what was typed.
      maskAllInputs: false,
      recordCanvas: false,
    })
    // Reflect the event count in the UI at a low, fixed frequency. This lives
    // inside a blocked subtree, so these mutations are not recorded.
    counterTimerRef.current = setInterval(() => {
      setEventCount(eventsRef.current.length)
    }, 250)
    setRecording(true)
  }

  async function stopAndSave() {
    stopFnRef.current?.()
    stopFnRef.current = null
    clearInterval(counterTimerRef.current)
    setEventCount(eventsRef.current.length)
    setRecording(false)
    setStatus('sending')
    try {
      const data = await processWorkflow(eventsRef.current, {
        expert: 'Jacob',
        task: 'Master Data Opening — SFDR verification',
        form,
      })
      setResult(data)
      setStatus('done')
      onWorkflowCaptured?.(data.procedure)
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      {/* ── Mock financial dashboard — the hero surface Jacob works in. ── */}
      <section
        className={`bg-white rounded-2xl border shadow-elevated overflow-hidden transition-colors ${
          recording ? 'border-six/40' : 'border-neutral-200/70'
        }`}
      >
        <div className="px-5 py-4 bg-white border-b border-neutral-200/70 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-six-light">
            <Database size={16} className="text-six" />
          </span>
          <div className="leading-tight">
            <h2 className="font-bold text-ink">Master Data Opening</h2>
            <span className="text-[11px] text-neutral-400">SIX Reference Data System</span>
          </div>
          {recording && (
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-six-light px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-six animate-fade-in">
              <Radio size={11} className="animate-pulse" /> Capturing
            </span>
          )}
        </div>

        <div className="p-6 space-y-6">
          <Fieldset legend="Instrument">
            <Field label="Counterparty">
              <input
                value={form.counterparty}
                onChange={(e) => setForm({ ...form, counterparty: e.target.value })}
                placeholder="e.g. Alpen Privatbank"
                className={inputCls}
              />
            </Field>
            <Field label="ISIN">
              <input
                value={form.isin}
                onChange={(e) => setForm({ ...form, isin: e.target.value })}
                placeholder="e.g. AT0000828553"
                className={inputCls}
              />
            </Field>
          </Fieldset>

          <Fieldset legend="ESG Data" icon={ShieldCheck}>
            <Field label="SFDR Classification">
              <select
                value={form.sfdrArticle}
                onChange={(e) => setForm({ ...form, sfdrArticle: e.target.value })}
                className={inputCls}
              >
                <option>Article 6</option>
                <option>Article 8</option>
                <option>Article 9</option>
              </select>
            </Field>
            <FieldGroup label="Regulatory Based">
              <div className="flex gap-2">
                {['Yes', 'No'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={form.regulatoryBased === opt}
                    onClick={() => setForm({ ...form, regulatoryBased: opt })}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      form.regulatoryBased === opt
                        ? 'border-six bg-six-light text-six'
                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </Fieldset>

          <button
            type="button"
            className="w-full rounded-xl bg-ink hover:bg-black active:scale-[0.99] text-white py-2.5 text-sm font-semibold transition-all"
          >
            Verify &amp; Save Record
          </button>
          <p className="text-xs text-neutral-400 text-center">
            Perform your normal workflow here while capture is running.
          </p>
        </div>
      </section>

      {/* ── Task-mining control panel ────────────────────────── */}
      {/* rr-block: rrweb excludes this subtree from recording (it's our own
          tooling, and its live counter must not feed back into the capture). */}
      <aside className="rr-block space-y-3.5">
        <div
          className={`bg-white rounded-2xl border shadow-card p-5 transition-shadow ${
            recording ? 'border-six/40 shadow-six-glow' : 'border-neutral-200/70'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Radio size={15} className="text-six" />
            <h3 className="font-bold text-ink">Task Mining</h3>
          </div>
          <p className="text-xs leading-relaxed text-neutral-500 mb-4">
            Silently records DOM mutations &amp; inputs via rrweb — the expert just works,
            no documentation needed.
          </p>

          {!recording ? (
            <button
              onClick={startCapture}
              disabled={status === 'sending'}
              className="w-full rounded-xl bg-six hover:bg-six-dark disabled:opacity-50 text-white py-3 flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.99] shadow-six-glow"
            >
              <Circle size={16} fill="currentColor" /> Start Capture
            </button>
          ) : (
            <button
              onClick={stopAndSave}
              className="w-full rounded-xl bg-ink hover:bg-black text-white py-3 flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.99]"
            >
              <Square size={15} fill="currentColor" /> Stop &amp; Save Workflow
            </button>
          )}

          <div className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 border border-neutral-100 px-3 py-2.5 text-sm">
            <span className="flex items-center gap-2 text-neutral-600">
              <span className="relative flex h-2.5 w-2.5">
                {recording && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-six animate-pulse-ring" />
                )}
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    recording ? 'bg-six' : 'bg-neutral-300'
                  }`}
                />
              </span>
              {recording ? 'Recording…' : 'Idle'}
            </span>
            <span className="flex items-baseline gap-1">
              <span className="font-mono font-bold text-ink tabular-nums">{eventCount}</span>
              <span className="text-[11px] text-neutral-400">events</span>
            </span>
          </div>
        </div>

        {status === 'sending' && (
          <div className="bg-white rounded-2xl border border-neutral-200/70 shadow-card p-5 flex items-center gap-3 text-sm text-neutral-600 animate-fade-in">
            <Loader2 size={18} className="animate-spin text-six shrink-0" />
            <span>
              Parsing workflow with LLM…
              <span className="block text-xs text-neutral-400">
                Turning {eventCount} events into a structured procedure
              </span>
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700 flex gap-2 animate-fade-in">
            <AlertCircle size={18} className="shrink-0" />
            <div>
              <p className="font-semibold">Could not reach backend</p>
              <p className="text-xs mt-1">{errorMsg}</p>
            </div>
          </div>
        )}

        {status === 'done' && result && (
          <div className="bg-white rounded-2xl border border-neutral-200/70 shadow-elevated p-5 animate-reveal">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <span className="font-bold text-ink">Procedure generated</span>
            </div>
            <p className="text-sm font-semibold text-ink mt-2">{result.procedure.title}</p>
            <p className="text-[11px] text-neutral-400 mb-3">
              Reconstructed from {result.event_count} captured events
            </p>
            <ol className="space-y-2.5">
              {result.procedure.steps.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <span className="shrink-0 h-5 w-5 rounded-full bg-ink text-white text-[11px] font-bold flex items-center justify-center mt-px">
                    {i + 1}
                  </span>
                  <span className="text-ink leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
            {/* Close the loop: this captured knowledge is now retrievable by
                employees in the Employee Space. */}
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-six-light/70 border border-six/20 px-3 py-2.5 text-xs font-semibold text-six">
              <CheckCircle2 size={14} className="shrink-0" />
              <span className="flex-1">Now retrievable by employees</span>
              <ArrowRight size={14} className="shrink-0" />
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-neutral-200 bg-neutral-50/60 px-3 py-2 text-sm outline-none transition-shadow focus:bg-white focus:border-six focus:ring-4 focus:ring-six/10'

function Fieldset({ legend, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        {Icon && <Icon size={15} className="text-six" />}
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{legend}</h4>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-500 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

// Like Field, but for a group of controls (e.g. a button toggle) rather than a
// single labelable input. A <label> wrapping multiple buttons hijacks their
// accessible names; a role="group" with aria-label names the set while each
// button keeps its own name ("Yes" / "No").
function FieldGroup({ label, children }) {
  return (
    <div role="group" aria-label={label}>
      <span className="block text-xs font-medium text-neutral-500 mb-1.5">{label}</span>
      {children}
    </div>
  )
}
