// Thin client for the SIXsens FastAPI backend.
// In dev, Vite proxies /api -> http://localhost:8000 (see vite.config.js).

const BASE = ''

/**
 * Send a captured rrweb session to the backend for "LLM" processing.
 * @param {Array} events - raw rrweb event payload
 * @param {object} meta  - optional metadata (expert name, task title, ...)
 * @returns {Promise<{procedure: {title: string, steps: string[]}, event_count: number}>}
 */
export async function processWorkflow(events, meta = {}) {
  const res = await fetch(`${BASE}/api/process-workflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events, meta }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`Backend error ${res.status}: ${detail}`)
  }
  return res.json()
}

/**
 * Ask SIXsens a question. The backend retrieves dual-context chunks and (when
 * an ANTHROPIC_API_KEY is configured) has Claude synthesize a grounded, cited
 * step-by-step answer.
 *
 * `engine` tells you what came back:
 *   - "rag"        → `answer` is populated (title/summary/steps with citations)
 *   - "retrieval"  → chunks only (no API key/SDK); `answer` is null
 *   - "unavailable"→ vector store not built; only `detail` is set
 * Callers should fall back to the local demo answer unless engine === "rag".
 *
 * @param {string} question
 * @returns {Promise<{
 *   question: string,
 *   engine: 'rag'|'retrieval'|'unavailable',
 *   answer: {title: string, summary: string, steps: {text: string, citations: number[]}[]} | null,
 *   sources: {index: number, source_type: string, document: string}[],
 *   official_rules: {content: string, metadata: object}[],
 *   expert_workflow_context: {content: string, metadata: object}[],
 *   detail?: string
 * }>}
 */
export async function askSixthSense(question) {
  const res = await fetch(`${BASE}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`Backend error ${res.status}: ${detail}`)
  }
  return res.json()
}

/**
 * Ask the Phase-2 agent (agent.py). Retrieves dual-context, applies the expert
 * "Walter's Workflow" protocols, and returns guidance plus an action-routing
 * decision and a pre-filled BPO draft form. `available` is false (with
 * `detail`) when the agent can't run, so callers fall back to the local demo.
 * @param {string} question
 * @returns {Promise<{
 *   question: string,
 *   available: boolean,
 *   message: string | null,
 *   requires_bpo_action: boolean,
 *   bpo_draft_form: Record<string, string|null> | null,
 *   detail?: string
 * }>}
 */
export async function askAgent(question) {
  const res = await fetch(`${BASE}/api/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`Backend error ${res.status}: ${detail}`)
  }
  return res.json()
}

// ── Knowledge & context engine (specs 09 / 10 / 11) ──────────────────────

async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`Backend error ${res.status}: ${detail}`)
  }
  return res.json()
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`Backend error ${res.status}: ${detail}`)
  }
  return res.json()
}

/**
 * The trustworthy, source-backed answer pipeline (spec 10). Sends the question
 * plus the user's working-context snapshot; the backend collects context,
 * plans the query, retrieves + ranks across corpus and structured knowledge,
 * scores confidence, and decides whether to escalate.
 *
 * @param {string} question
 * @param {object} context  — { current_page, selected_text, recent_queries, ... }
 * @returns {Promise<GroundedAnswerResponse>}
 */
export function getGroundedAnswer(question, context = {}) {
  return postJson('/api/answer', { question, context })
}

/** List responsible experts (for the directory / inbox). */
export function listExperts() {
  return getJson('/api/experts')
}

/** All structured knowledge — seed + resolutions persisted via the loop. */
export function listKnowledge() {
  return getJson('/api/knowledge')
}

/** List knowledge requests (the expert inbox feed). */
export function listKnowledgeRequests() {
  return getJson('/api/knowledge-requests')
}

/** Submit a structured knowledge request from the assistant escalation. */
export function createKnowledgeRequest(payload) {
  return postJson('/api/knowledge-requests', payload)
}

/**
 * Log an expert resolution; the backend converts it into reusable knowledge
 * that future questions can cite. Closes the loop (spec 11).
 */
export function resolveKnowledgeRequest(requestId, resolution) {
  return postJson(`/api/knowledge-requests/${requestId}/resolve`, resolution)
}
