# SIXsens

SIXsens is an institutional desktop assistant for SIX Financial Information.
It captures expert workflows, retrieves official and tacit knowledge, answers
with citations, and routes low-confidence cases to the right SME.

## What Is In This Version

- React/Vite frontend wrapped in an Electron desktop overlay.
- FastAPI backend with workflow capture, RAG retrieval, grounded answers, expert routing, and knowledge request handling.
- Cluely/Raycast-style overlay behavior with a compact floating pill.
- Perplexity-style inline citations with document source cards and expert cards.
- Hard confidence threshold: answers below 60% become expert escalations instead of hallucinated guidance.
- Expert directory routing for domains like SFDR, ESG, SWIFT, FATCA, settlement, and Master Data opening.

## Project Structure

```text
six_start/
  backend/
    main.py                 FastAPI app and API routes
    retrieval_engine.py     Chroma retrieval helpers
    data_ingestion.py       PDF/DOCX ingestion into Chroma
    context_engine.py       User context and query planning
    escalation.py           Confidence scoring and escalation logic
    knowledge_store.py      Experts, knowledge items, requests, Chroma persistence
    SIX_Git_Sources/        Source PDFs and DOCX files for ingestion
    chroma_db/              Local vector database after ingestion
  frontend/
    electron/               Electron shell, preload bridge, dev launcher
    src/                    React app
  package.json              Root helper scripts
```

## Requirements

Backend:

- Python 3.11+
- FastAPI / Uvicorn
- LangChain, Chroma, HuggingFace embeddings stack for RAG
- Optional: `ANTHROPIC_API_KEY` in `backend/.env` for Claude-generated answers

Frontend:

- Node.js + npm
- Electron dependencies already declared in `frontend/package.json`

## First-Time Setup

Install Python dependencies:

```powershell
cd D:\Users\Houssam\Start_Hack_2026\six_start\backend
pip install -r requirements.txt
```

Install frontend dependencies:

```powershell
cd D:\Users\Houssam\Start_Hack_2026\six_start\frontend
npm install
```

Optional LLM key:

```powershell
cd D:\Users\Houssam\Start_Hack_2026\six_start\backend
New-Item -ItemType File -Path .env
```

Then add:

```text
ANTHROPIC_API_KEY=your_key_here
```

## Build The Vector Store

Put the SIX source PDFs and DOCX files in:

```text
backend/SIX_Git_Sources/
```

Then run:

```powershell
cd D:\Users\Houssam\Start_Hack_2026\six_start\backend
python data_ingestion.py
```

This creates or updates:

```text
backend/chroma_db/
```

PDF files are tagged as official rulebook knowledge. DOCX files are tagged as tacit expert knowledge.

## Run The App

Terminal 1, backend:

```powershell
cd D:\Users\Houssam\Start_Hack_2026\six_start\backend
python main.py
```

The backend runs on:

```text
http://127.0.0.1:8000
```

Terminal 2, Electron overlay:

```powershell
cd D:\Users\Houssam\Start_Hack_2026\six_start
npm run electron:dev
```

This starts Vite and opens the Electron assistant overlay.

Useful shortcuts:

- Windows/Linux: `Ctrl+Space` or `Ctrl+Shift+K`
- macOS: `Cmd+K` or `Cmd+Shift+Space`
- `Esc` inside the overlay compacts it into the floating pill.

The minimized state is a small white SIXsens floating pill. The `-` button compacts the overlay, the expand button restores it, and `X` closes the app.

## Main API Endpoints

```text
GET  /health
POST /api/process-workflow
POST /api/ask
POST /api/agent
POST /api/answer
POST /api/expert-matches
GET  /api/experts
GET  /api/knowledge
GET  /api/knowledge-requests
POST /api/knowledge-requests
POST /api/knowledge-requests/{id}/resolve
```

Important behavior:

- `/api/answer` returns grounded answers with `document_citations` and `expert_citations`.
- If confidence is below 60%, `/api/answer` returns `engine: "escalation_needed"`.
- `/api/expert-matches` returns suggested SMEs while the user types.
- Resolving a knowledge request stores reusable knowledge and best-effort embeds the expert resolution into Chroma.

## How The System Works

1. Experts use the Expert Space to capture workflows with `rrweb`.
2. Captured workflows are sent to `POST /api/process-workflow`.
3. The backend turns the trace into a reusable step-by-step procedure.
4. Employees ask questions in the SIXsens overlay.
5. The backend plans the query using context, selected text/clipboard context, target domains, and expert mappings.
6. RAG retrieves official rulebook chunks and tacit expert workflow chunks.
7. The answer is returned with inline citations like `[1]`.
8. The frontend renders those citations as clickable badges with source metadata.
9. If evidence is weak, the answer is blocked and a knowledge request is prepared for the right expert.
10. When an expert resolves the request, the new resolution becomes reusable knowledge.

## Testing

Backend smoke test:

```powershell
cd D:\Users\Houssam\Start_Hack_2026\six_start\backend
python -c "from fastapi.testclient import TestClient; import main; c=TestClient(main.app); print(c.post('/api/expert-matches', json={'query':'SWIFT settlement error'}).json()['experts'][0]['expert_name']); r=c.post('/api/answer', json={'question':'zzzz totally unknown process with no evidence', 'context':{}}).json(); print(r['engine'], r['display_format'], r.get('confidence_score'))"
```

Expected output includes:

```text
Anna Keller
escalation_needed escalation_needed 0.0
```

Frontend build:

```powershell
cd D:\Users\Houssam\Start_Hack_2026\six_start\frontend
npm run build
```

You may see a Vite chunk-size warning. That is not a failure.

## Notes For Teammates

- Work inside `six_start`; ignore the older MVP folder.
- Do not commit `backend/data/persisted_knowledge.json` unless the team decides runtime knowledge state should be shared.
- If Vite reports that port `5173` is busy, stop the old Vite/Electron process and rerun `npm run electron:dev`.
- If Git reports a stale `.git/index.lock`, make sure no commit/editor is open, then remove the lock and retry.
- The app is designed to degrade gracefully. Without a vector store or LLM key, it still opens and shows fallback/demo behavior.
