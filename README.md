# SIXsens

> An **enterprise knowledge & context copilot** for SIX — START Hack Zurich, SIX Challenge.

SIXsens helps SIX employees answer compliance questions **truthfully, with context, and with traceable sources** — and it captures the silent, undocumented workflows of experts so that knowledge never gets lost again.

It is two things at once:

1. **A knowledge copilot** (Perplexity-for-enterprise): every answer shows *what context was used, which sources back it, which expert owns the knowledge, how confident it is, and what to do next* — never a generic chatbot reply.
2. **A knowledge-capture loop**: when SIXsens can't answer confidently, it routes the question to the right expert; the expert's resolution is saved as **reusable company knowledge** that future answers can cite. The loop closes.

---

## ✨ What's new in this version

This build implements three big upgrades (specs 09 / 10 / 11) on top of the original task-mining + RAG demo:

| Pillar | What it does |
|--------|--------------|
| **09 · Knowledge & Context Engine** | Collects the user's working context → plans the query (detects intent) → retrieves across **multiple knowledge types** (rulebook docs, runbooks, policies, expert notes, resolved questions, incidents) → ranks by **relevance + trust + freshness + ownership + context** → explains *why* each source was chosen. |
| **10 · Trusted, Source-Backed Answers** | Every answer is a structured object: **Answer · Context used · Sources · Experts · Confidence · Next best actions**. Confidence is scored with reasons and limitations; low-confidence answers say so instead of bluffing. |
| **11 · Expert Escalation & Knowledge Persistence** | Low-confidence questions trigger an **escalation** to the best-matched expert. The user sends a **knowledge request** → it lands in the **Expert Inbox** → the expert **logs a resolution** → it's **persisted as reusable knowledge** and immediately citable by future questions. |

**The headline demo moment:** ask a question SIXsens *can't* answer → escalate → expert resolves it → ask again → now a **high-confidence answer citing the brand-new expert resolution**. The system visibly *learned*.

---

## 🏛️ Architecture

```
                 ┌──────────────────────── FastAPI backend (port 8000) ────────────────────────┐
  React /        │                                                                              │
  Electron  ──▶  │  POST /api/answer   ── context_engine ─▶ knowledge_store ─▶ escalation       │
  frontend       │      (the engine)      collect_context     experts + typed     confidence     │
  (port 5173)    │                        plan_query          knowledge sources   + routing      │
                 │                        retrieve+rank        (+ Chroma corpus)                  │
                 │                                                                              │
                 │  GET  /api/experts            POST /api/knowledge-requests                    │
                 │  GET  /api/knowledge          POST /api/knowledge-requests/{id}/resolve  ◀── closes the loop
                 └──────────────────────────────────────────────────────────────────────────────┘
```

### Backend (Python / FastAPI)

| File | Role |
|------|------|
| [`backend/context_engine.py`](backend/context_engine.py) | The engine pipeline: `collect_user_context → plan_query → retrieve_knowledge → rank_chunks`. Intent detection, domain taxonomy, and a transparent ranker (keyword overlap + domain + source-type priority + trust + freshness + expert ownership + current-context match) that emits a human-readable reason per source. |
| [`backend/knowledge_store.py`](backend/knowledge_store.py) | The structured knowledge layer: responsible **experts** (with expertise tags, knowledge score, "best for"), typed **knowledge sources** (runbook / policy / expert_note / resolved_question / incident), expert **routing**, and **JSON-persisted** knowledge requests + resolutions (`backend/data/`, auto-created). |
| [`backend/escalation.py`](backend/escalation.py) | Confidence scoring (high/medium/low + reason + limitations), escalation detection, and assembling the escalation block (ranked experts + pre-filled request draft). |
| [`backend/main.py`](backend/main.py) | Orchestrates `POST /api/answer` → `GroundedAnswerResponse`. Uses **Claude** to synthesize the grounded answer when a key is set, with a **deterministic fallback** otherwise. Plus the experts / knowledge / knowledge-request / resolve routes. |
| [`backend/retrieval_engine.py`](backend/retrieval_engine.py), [`backend/data_ingestion.py`](backend/data_ingestion.py) | The original dual-context RAG over the SIX corpus (Chroma + LangChain). The engine searches this **alongside** the structured store. |

### Frontend (React + Vite + Electron)

| File | Role |
|------|------|
| [`frontend/src/components/GroundedAnswer.jsx`](frontend/src/components/GroundedAnswer.jsx) | The trustworthy answer card: Answer · Context-used chips · rich Source cards (type, trust badge, freshness, score, "why used", open) · Expert cards · Confidence badge + limitations · Next-best-action buttons. Format adapts to intent (`step_by_step`, `expert_recommendation`, `escalation_needed`, `summary`, `direct_answer`). |
| [`frontend/src/components/escalation/CreateKnowledgeRequest.jsx`](frontend/src/components/escalation/CreateKnowledgeRequest.jsx) | Modal to send a knowledge request to the routed expert; shows a **"Delivered to …"** confirmation and a jump-to-inbox button. |
| [`frontend/src/components/escalation/ExpertInbox.jsx`](frontend/src/components/escalation/ExpertInbox.jsx) | The expert's mailbox: open/resolved requests (with a **"New"** marker), the **resolution logger** form, a **reusable-knowledge preview**, and the **"Knowledge loop closed"** moment. |
| [`frontend/src/lib/context.js`](frontend/src/lib/context.js) | Collects the `UserContext` (role, department, current page/workflow, live text selection) sent with each question. |
| [`frontend/src/lib/api.js`](frontend/src/lib/api.js) | Typed client for all the endpoints above. |
| [`frontend/src/components/ChatPane.jsx`](frontend/src/components/ChatPane.jsx) | Calls `/api/answer` first and renders the grounded answer; falls back to the legacy agent/RAG path if the engine is unavailable. Hosts the escalation modal. |

**"Did the expert get it?"** — A request is `POST`ed to the backend (real shared state in `backend/data/knowledge_requests.json`), so the **Inbox tab badge** lights up with the open count, the send dialog says **"Delivered to <expert>"**, and the request appears in the inbox with a pulsing **New** marker.

---

## 🚀 Run it

You need **two terminals**: one for the backend, one for the frontend.

### 1 · Backend (port 8000)
```bash
cd backend
python main.py            # uvicorn on http://localhost:8000 (auto-reload)
```
> First time only: create a venv and `pip install -r requirements.txt`. The API runs even before the heavy RAG stack is installed — see *Retrieval stack* below.

### 2 · Frontend — Electron desktop app (recommended)
From the **repo root**:
```bash
npm run install:frontend  # first time only (installs frontend/ deps)
npm run electron:dev      # launches Vite + the Electron overlay window
```
> A root [`package.json`](package.json) delegates to `frontend/`, so these work from the repo root. ([`frontend/electron/dev.cjs`](frontend/electron/dev.cjs) starts Vite, waits for it, then opens Electron.)

### …or run it in the browser
```bash
cd frontend
npm install               # first time only
npm run dev               # http://localhost:5173 (Vite proxies /api → :8000)
```

### Enable grounded LLM answers (optional but recommended)
Put an Anthropic key in `backend/.env` (gitignored):
```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > backend/.env
```
With a key, `/api/answer` returns `engine: "rag"` (Claude-synthesized). **Without** a key it still works via a deterministic composer (`engine: "grounded"`), and without the vector store it falls back to the structured knowledge only — so the demo never hard-fails.

---

## 🎬 Demo script (5 steps)

1. **Chat** → ask *"How do we handle a failed SWIFT settlement exception?"* → SIXsens shows **low confidence** (only a stale incident note exists) and an **escalation** to *Anna Keller (Market Operations)*.
2. Click **Send knowledge request** → confirm → **"Delivered to Anna Keller"**. The **Inbox** tab badge lights up.
3. Open the **Inbox** → the request is there with a **New** marker → open it → **log a resolution** (e.g. *"Retry after 30 min, max 3 attempts, then escalate"*).
4. See **"Knowledge loop closed"** — the resolution is now reusable, verified company knowledge.
5. Back in **Chat**, ask *"What is the retry window for a failed SWIFT settlement?"* → now a **high-confidence answer that cites the new expert resolution**. 🎉

---

## 🧱 The original foundation (still here)

| Space | Persona | What it does |
|-------|---------|--------------|
| **Expert Space** | Jacob · SME | A mock *Master Data Opening* dashboard. Hit **Start Capture** → `rrweb` silently records every click & input → **Stop & Save** ships the trace to `POST /api/process-workflow`, which reconstructs a structured procedure. |
| **Employee Space** | Cosmina · Compliance | The chat copilot described above. |

### Set up the retrieval stack (for `engine: "rag"`)
```bash
cd backend
pip install -r requirements.txt          # heavy: pulls torch via sentence-transformers
mkdir -p SIX_Git_Sources                 # drop the SIX rulebook PDFs + expert DOCX here
python data_ingestion.py                 # builds ./chroma_db (PDF→rulebook, DOCX→expert)
```

---

## 🛠️ Tech stack

- **Frontend:** React + Vite, Tailwind CSS, Radix UI, `lucide-react`, **`rrweb`** (task mining), **Electron** (floating overlay).
- **Backend:** Python + **FastAPI**; **Claude (`claude-opus-4-8`)** via the Anthropic SDK (`messages.parse` for guaranteed structured output, prompt caching, adaptive thinking); dual-context **RAG** over **LangChain + ChromaDB** (`all-MiniLM-L6-v2` embeddings).
- **Persistence:** JSON in `backend/data/` for the knowledge loop (a real DB would slot in here).
