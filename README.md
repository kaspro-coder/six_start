# SIXsens

> Capturing **tacit knowledge that doesn't scale** — START Hack Zurich, SIX Challenge.

SIXsens captures the silent, undocumented workflows of Subject Matter Experts
(like **Jacob**) via task mining, and turns them into step-by-step procedures
that junior employees (like **Cosmina**, a Compliance Officer) can follow on
demand — without ever asking the expert to write documentation.

## The two spaces

| Space | Persona | What it does |
|-------|---------|--------------|
| **Employee Space** | Cosmina · Compliance | Chat UI. Ask *"How to verify SFDR data for Alpen Privatbank?"* → get a procedure reconstructed from an expert's captured workflow. |
| **Expert Space** | Jacob · SME | A mock *Master Data Opening* dashboard (ISIN, ESG/SFDR data). Hit **Start Capture** → `rrweb` silently records every click & input → **Stop & Save** ships the JSON to the backend, which returns a structured procedure. |

## Tech stack

- **Frontend:** React + Vite, Tailwind CSS, Radix UI, `lucide-react`, **`rrweb`** (task mining)
- **Backend:** Python + **FastAPI** — task-mining mock (`/api/process-workflow`)
  plus a dual-context **retrieval engine** (`/api/ask`, RAG over LangChain +
  ChromaDB).

## Run it

### Backend (port 8000)
```bash
cd backend
source .venv/bin/activate        # venv already created during scaffold
uvicorn main:app --reload --port 8000
```

### Frontend (port 5173)
```bash
cd frontend
npm run dev
```

Open http://localhost:5173. Vite proxies `/api/*` to the FastAPI backend.

## How the "magic" works

1. In **Expert Space**, `rrweb.record()` streams events into memory as Jacob fills the form.
2. **Stop & Save** POSTs `{ events, meta }` to `POST /api/process-workflow`.
3. The backend introspects the rrweb trace (input snapshots, type/source codes)
   and synthesizes a clean SOP. *This mock stands in for an LLM prompt.*
4. The returned procedure is lifted into shared app state and instantly
   answerable in the **Employee Space**.

## Dual-context retrieval engine (RAG)

`retrieval_engine.py` + `data_ingestion.py` (contributed from the
[sixth-sense-six-brain](https://github.com/housss77/sixth-sense-six-brain)
repo) implement the knowledge-retrieval half:

- **Ingestion** — `data_ingestion.py` loads source documents from
  `backend/SIX_Git_Sources/`, tagging **PDF → `explicit_rulebook`** and
  **DOCX → `tacit_expert_knowledge`**, chunks them, embeds with
  `all-MiniLM-L6-v2`, and persists a Chroma store to `backend/chroma_db/`.
- **Retrieval** — `query_sixth_sense(question)` runs two filtered similarity
  searches and returns *official rules* + *expert workflow context* side by
  side. Exposed at `POST /api/ask` (see `askSixthSense` in `frontend/src/lib/api.js`).

### LLM generation (grounded answers)

`/api/ask` doesn't just retrieve — when an `ANTHROPIC_API_KEY` is configured it
has **Claude (`claude-opus-4-8`)** synthesize a grounded, cited, step-by-step
procedure from the retrieved chunks (`_generate_answer` in `main.py`, using the
Anthropic SDK with `messages.parse` for a guaranteed `{title, summary, steps[]}`
shape and adaptive thinking). The tuned `SIXSENS_SYSTEM_PROMPT` is the quality
lever — Claude has no API-side weight fine-tuning, so this is prompt-tuning:
ground every claim in context, cite chunk indices, prefer rulebook for *what
the rule is* and expert transcripts for *how it's done*, and flag gaps instead
of guessing. The system prompt is marked cacheable (prompt caching activates
once it exceeds Opus's ~4096-token minimum).

`engine` in the response tells you what came back: `"rag"` (answer + sources),
`"retrieval"` (chunks only — no key/SDK), or `"unavailable"` (no vector store).
The Employee Space renders the `"rag"` answer with citation chips and a sources
list, and falls back to the local demo otherwise.

**Enable it:** put your key in `backend/.env` (gitignored):

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > backend/.env   # loaded via python-dotenv
# restart uvicorn; /api/ask now returns engine="rag"
```

### Set up the retrieval stack

The API runs **without** this stack installed — `/api/ask` reports
`engine: "unavailable"` with a `detail` message until it's set up:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt          # heavy: pulls torch via sentence-transformers
# the embedding model is loaded with local_files_only=True, so cache it once:
#   python -c "from huggingface_hub import snapshot_download; snapshot_download('sentence-transformers/all-MiniLM-L6-v2')"
mkdir -p SIX_Git_Sources                 # drop the SIX rulebook PDFs + expert DOCX here
python data_ingestion.py                 # builds ./chroma_db
python test_phase1.py                    # smoke-test retrieval
```
