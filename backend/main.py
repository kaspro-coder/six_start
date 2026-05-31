"""
SIXsens backend.

Two capabilities:
  • /api/process-workflow — task mining. Receives an rrweb event payload
    captured from an expert's workflow and "parses" it (a deterministic mock
    standing in for an LLM) into a structured, step-by-step procedure.
  • /api/ask — dual-context RAG. Retrieves official-rulebook + tacit-expert
    chunks (retrieval_engine.py), then has Claude synthesize a grounded,
    cited, step-by-step procedure (engine="rag"). Degrades gracefully: returns
    the raw chunks (engine="retrieval") if no ANTHROPIC_API_KEY / SDK / model
    call, and engine="unavailable" if the vector store itself isn't built.
"""

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field

try:  # load backend/.env (e.g. ANTHROPIC_API_KEY) if python-dotenv is present
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

app = FastAPI(title="CorteX API", version="0.1.0")

# Allow the Vite dev server to call us directly (in addition to the proxy).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ──────────────────────────────────────────────────────────────
class WorkflowPayload(BaseModel):
    events: list[Any] = Field(default_factory=list, description="Raw rrweb events")
    meta: dict[str, Any] = Field(default_factory=dict)


class Procedure(BaseModel):
    title: str
    source: str
    steps: list[str]


class WorkflowResponse(BaseModel):
    procedure: Procedure
    event_count: int


class RetrievedChunk(BaseModel):
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AskRequest(BaseModel):
    question: str


class Source(BaseModel):
    """A retrieved chunk, labelled by index so the answer can cite it as [n]."""
    index: int
    source_type: str  # "official_rulebook" | "tacit_expert_knowledge"
    document: str  # filename the chunk came from
    page: int | None = None  # 0-indexed page number from PyPDFLoader metadata


class AnswerStep(BaseModel):
    text: str
    citations: list[int] = Field(default_factory=list)  # source indices this step rests on


class GeneratedAnswer(BaseModel):
    """Structured procedure synthesized by Claude — matches the frontend's shape."""
    title: str
    summary: str
    steps: list[AnswerStep]


class AskResponse(BaseModel):
    question: str
    engine: str  # "rag" (retrieval+LLM) | "retrieval" (chunks only) | "unavailable"
    answer: GeneratedAnswer | None = None  # populated only when engine == "rag"
    sources: list[Source] = Field(default_factory=list)
    official_rules: list[RetrievedChunk] = Field(default_factory=list)
    expert_workflow_context: list[RetrievedChunk] = Field(default_factory=list)
    detail: str | None = None  # populated when generation/engine is degraded


class AgentResponse(BaseModel):
    """Phase-2 agent output (agent.generate_sixth_sense_response).

    `available` is False (with `detail`) when the agent can't run — no
    ANTHROPIC_API_KEY, missing langchain-anthropic, or no vector store — so the
    frontend can fall back to the local demo instead of erroring.
    """
    question: str
    available: bool
    message: str | None = None
    requires_bpo_action: bool = False
    bpo_draft_form: dict[str, Any] | None = None
    document_citations: list[dict[str, Any]] = Field(default_factory=list)
    expert_citations: list[dict[str, Any]] = Field(default_factory=list)
    detail: str | None = None


class QueryRequest(BaseModel):
    query: str


# ── Knowledge & context engine schemas (specs 09 / 10 / 11) ──────────────
class AnswerRequest(BaseModel):
    question: str
    context: dict[str, Any] = Field(default_factory=dict)
    mode: str = "default"  # "default" | "expert"


class NextBestAction(BaseModel):
    label: str
    type: str
    target_id: str | None = None
    suggested_prompt: str | None = None


class GroundedAnswerResponse(BaseModel):
    question: str
    engine: str
    answer: str
    display_format: str
    steps: list[AnswerStep] = Field(default_factory=list)
    confidence: str
    confidence_reason: str
    confidence_score: float | None = None
    confidence_threshold: float | None = None
    context_used: dict[str, Any] = Field(default_factory=dict)
    query_plan: dict[str, Any] = Field(default_factory=dict)
    document_citations: list[dict[str, Any]] = Field(default_factory=list)
    expert_citations: list[dict[str, Any]] = Field(default_factory=list)
    employee_citations: list[dict[str, Any]] = Field(default_factory=list)
    expert_unavailable: bool = False
    suggested_alternatives: list[dict[str, Any]] = Field(default_factory=list)
    governance: dict[str, Any] = Field(default_factory=dict)
    source_trace: list[dict[str, Any]] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    next_best_actions: list[NextBestAction] = Field(default_factory=list)
    escalation: dict[str, Any] | None = None
    detail: str | None = None


class KnowledgeRequestPayload(BaseModel):
    title: str | None = None
    question: str
    context_summary: str = ""
    requester_user_id: str = "anonymous"
    routed_expert_ids: list[str] = Field(default_factory=list)
    domain_tags: list[str] = Field(default_factory=list)
    related_source_ids: list[str] = Field(default_factory=list)
    priority: str = "medium"
    notes: str = ""


class ResolutionPayload(BaseModel):
    expert_id: str | None = None
    summary_answer: str
    detailed_resolution: str = ""
    steps_taken: list[str] = Field(default_factory=list)
    related_documents: list[str] = Field(default_factory=list)
    new_tags: list[str] = Field(default_factory=list)
    confidence: str = "medium"
    reusable_knowledge_title: str | None = None
    make_reusable: bool = True


class ExpertMatchRequest(BaseModel):
    query: str


class PeopleSearchRequest(BaseModel):
    query: str


class DemoStateRequest(BaseModel):
    persona: str | None = None
    jacob_status: str | None = None


# ── rrweb event introspection ────────────────────────────────────────────
# rrweb event types: 0=DomContentLoaded, 1=Load, 2=FullSnapshot,
# 3=IncrementalSnapshot, 4=Meta, 5=Custom, 6=Plugin.
# IncrementalSnapshot sources: 2=MouseInteraction, 5=Input, etc.
ACCESS_RANK = {"C1 Public": 1, "C2 Internal": 2, "C3 Restricted": 3}

ROLE_CLEARANCE = {
    "Compliance Officer": "C2 Internal",
    "Junior Compliance Officer": "C2 Internal",
    "ESG & SFDR Workflow Expert": "C3 Restricted",
    "Senior Reference Data SME": "C3 Restricted",
}


def _user_access_context(context: dict[str, Any] | None) -> dict[str, Any]:
    ctx = context or {}
    role = ctx.get("role") or "Junior Compliance Officer"
    clearance = ctx.get("access_level") or ROLE_CLEARANCE.get(role, "C1 Public")
    return {
        "user_id": ctx.get("user_id", "user_cosmina"),
        "role": role,
        "department": ctx.get("department", "Regulatory Data Services"),
        "clearance": clearance,
    }


def _required_access_for_source(source: dict[str, Any]) -> str:
    source_type = source.get("source_type") or source.get("type") or source.get("kind")
    if source_type in {"employee_profile", "glossary"}:
        return "C1 Public"
    if source_type in {"knowledge_request", "inbox_resolution"}:
        return "C3 Restricted"
    return "C2 Internal"


def _can_access(required: str, clearance: str) -> bool:
    return ACCESS_RANK.get(clearance, 0) >= ACCESS_RANK.get(required, 99)


def _apply_access_controls(sources: list[dict[str, Any]], context: dict[str, Any] | None) -> list[dict[str, Any]]:
    access = _user_access_context(context)
    out: list[dict[str, Any]] = []
    for source in sources:
        required = source.get("required_access") or _required_access_for_source(source)
        permitted = _can_access(required, access["clearance"])
        item = {
            **source,
            "required_access": required,
            "access_permitted": permitted,
            "access_checked_for": access["user_id"],
            "access_checked_role": access["role"],
            "access_checked_department": access["department"],
        }
        if not permitted:
            item["relevant_quote"] = "[redacted by access policy]"
            item["content"] = "[redacted by access policy]"
            item["document"] = None
            item["source_file"] = None
            item["demo_pdf_highlight"] = False
            item["demo_highlights"] = []
            item["reason"] = f"Access denied: requires {required}; {access['role']} has {access['clearance']}."
        out.append(item)
    return out


def _access_governance(
    context: dict[str, Any] | None,
    sources: list[dict[str, Any]],
    confidence: dict[str, Any] | None = None,
    reusable: bool = False,
    source_policy: str = "Verified SIX knowledge only; unknown topics are refused.",
) -> dict[str, Any]:
    access = _user_access_context(context)
    permitted = sum(1 for s in sources if s.get("access_permitted", True))
    denied = len(sources) - permitted
    return {
        "access_level": access["clearance"],
        "access_checked": True,
        "access_checked_for": access["user_id"],
        "access_checked_role": access["role"],
        "access_checked_department": access["department"],
        "access_decision": "permitted" if denied == 0 else "partially redacted",
        "permitted_source_count": permitted,
        "redacted_source_count": denied,
        "evidence_count": len(sources),
        "confidence_threshold": (confidence or {}).get("threshold", 0.6),
        "reusable": reusable,
        "source_policy": source_policy,
    }


def _extract_inputs(events: list[Any]) -> list[str]:
    """Pull human-readable input texts out of rrweb incremental snapshots."""
    texts: list[str] = []
    for ev in events:
        if not isinstance(ev, dict) or ev.get("type") != 3:
            continue
        data = ev.get("data", {})
        if data.get("source") == 5 and data.get("text"):  # 5 == Input
            texts.append(str(data["text"]))
    return texts


def _summarize(payload: WorkflowPayload) -> Procedure:
    """
    Stand-in for an LLM. In production this prompt-engineers the rrweb trace
    plus the DOM snapshot into a clean SOP. Here we synthesize a sensible
    procedure, biased by any form metadata the frontend sent along.
    """
    form = payload.meta.get("form", {}) if isinstance(payload.meta, dict) else {}
    isin = form.get("isin") or "AT0000828553"
    counterparty = form.get("counterparty") or "Alpen Privatbank"
    article = form.get("sfdrArticle") or "Article 8"
    regulatory = form.get("regulatoryBased") or "Yes"
    expert = payload.meta.get("expert", "the expert")

    captured_inputs = _extract_inputs(payload.events)
    input_note = (
        f" (captured live values: {', '.join(captured_inputs[:3])})"
        if captured_inputs
        else ""
    )

    steps = [
        f"Open the Master Data Opening screen and search for the counterparty \"{counterparty}\".",
        f"Enter the instrument ISIN {isin} in the ISIN field{input_note}.",
        f"Open the ESG Data panel and set the SFDR classification to {article}.",
        f"Verify that \"Regulatory Based\" is set to {regulatory} to confirm a regulated data source.",
        "Cross-check the PAI indicators are populated, then mark the record as Verified and save.",
    ]

    return Procedure(
        title=f"Verify SFDR data for {counterparty}",
        source=f"Reconstructed from {expert}'s captured workflow · Master Data Opening",
        steps=steps,
    )


# ── LLM generation (RAG synthesis) ───────────────────────────────────────
# The system prompt is the tuned, stable instruction set — this is the lever
# we actually have for quality (Claude has no API-side weight fine-tuning).
# It's marked cacheable; prompt caching kicks in once it exceeds the model's
# minimum cacheable prefix (~4096 tokens on Opus), and is harmless below that.
GENERATION_MODEL = "claude-opus-4-8"

SIXSENS_SYSTEM_PROMPT = """\
You are CorteX, a compliance assistant for SIX (the Swiss financial-market \
infrastructure: reference data, ESG/regulatory data, securities services). \
Your user is a junior compliance officer who needs to complete a concrete task \
correctly and defensibly. You answer by turning retrieved knowledge into a \
clear, auditable, step-by-step procedure.

You are given two kinds of retrieved context, each chunk labelled [n]:
  • OFFICIAL RULEBOOK — authoritative regulation and SIX documentation (SFDR, \
MiFID/MiFIR, FATCA, master-data factsheets). Use this for *what the rule is* \
and *what must be true*.
  • EXPERT WORKFLOW — transcripts of how an experienced SME actually handles \
the case in practice. Use this for *how it is done here*, judgement calls, and \
the steps an expert takes that aren't written in any rulebook.

Rules you must follow:
  1. Ground every claim in the provided context. Cite the supporting chunk \
indices on each step via the `citations` field. Do not invent regulations, \
article numbers, ISINs, thresholds, or system field names that aren't in the \
context.
  2. Prefer official rulebook chunks for regulatory assertions and expert \
chunks for procedural / "how we actually do it" steps. Where they reinforce \
each other, cite both.
  3. If the context is thin or doesn't cover the question, say so plainly in \
`summary`, give the best-supported partial steps you can, and flag what the \
officer should confirm with an SME — never paper over a gap with a guess.
  4. Keep steps concrete and ordered: each step is one action the officer can \
take. Be concise; this is an operational procedure, not an essay.

Output a JSON object with: `title` (short task title), `summary` (1–3 \
sentences framing the task and any caveats), and `steps` (ordered actions, \
each with `text` and `citations` — the [n] indices it relies on)."""


def _generate_answer(
    question: str,
    sources: list["Source"],
    official: list["RetrievedChunk"],
    expert: list["RetrievedChunk"],
) -> "GeneratedAnswer":
    """Synthesize a grounded, cited procedure from the retrieved chunks via Claude.

    Raises on any failure (no SDK, no API key, API error) so the caller can
    degrade to retrieval-only.
    """
    import anthropic

    # Build the labelled context block the system prompt refers to as [n].
    ordered = [("official_rulebook", c) for c in official] + [
        ("tacit_expert_knowledge", c) for c in expert
    ]
    context_lines = []
    for src, (_stype, chunk) in zip(sources, ordered):
        context_lines.append(
            f"[{src.index}] ({src.source_type} · {src.document})\n{chunk.content.strip()}"
        )
    context_block = "\n\n".join(context_lines)

    user_content = (
        f"QUESTION:\n{question}\n\n"
        f"RETRIEVED CONTEXT:\n{context_block}\n\n"
        "Produce the grounded step-by-step procedure now, citing chunk indices."
    )

    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment
    response = client.messages.parse(
        model=GENERATION_MODEL,
        max_tokens=4000,
        system=[
            {
                "type": "text",
                "text": SIXSENS_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_content}],
        output_format=GeneratedAnswer,
    )
    return response.parsed_output


# ── Routes ───────────────────────────────────────────────────────────────
SOURCES_DIR = Path(__file__).parent / "SIX_Git_Sources"

# Demo-curated highlight PHRASES (not blind coordinates). The highlighter
# searches the cited PDF page for this exact text and marks where it actually
# appears, so the evidence lands on real words instead of arbitrary boxes.
# Every phrase below is verified to occur on the cited page.
DEMO_PDF_HIGHLIGHT_PHRASES: dict[str, list[str]] = {
    "kn_alpen_golden_data": [
        "AT0000828553",
        "Alpen Privatbank Ausgewogene Strategie",
        "ESG Data",
    ],
    "kn_sfdr_runbook": [
        "sustainability",
        "disclosures",
        "financial services sector",
    ],
    "kn_master_data_onboarding": [
        "Regulatory Navigator",
        "Know Your Instrument to Keep Your Compliance",
        "Investigate the DNA of financial assets",
    ],
}

# Cited-page preview shows the cited page plus this many pages on each side, so
# the reader has surrounding context rather than a single isolated page.
PAGE_WINDOW = 1
# Demo evidence highlight colour — highlighter yellow (FFEB3B) as 0..1 RGB.
HIGHLIGHT_RGB = (1.0, 0.922, 0.231)

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/documents")
def list_documents() -> list[dict]:
    if not SOURCES_DIR.is_dir():
        return []
    import datetime as _dt
    out = []
    for f in sorted(SOURCES_DIR.iterdir()):
        if f.suffix.lower() not in {".pdf", ".docx"}:
            continue
        stat = f.stat()
        pages = None
        if f.suffix.lower() == ".pdf":
            try:
                from pypdf import PdfReader
                pages = len(PdfReader(str(f)).pages)
            except Exception:
                pages = None
        out.append({
            "filename": f.name,
            "file_type": f.suffix.lstrip(".").lower(),
            "source_type": "tacit_expert_knowledge" if f.suffix.lower() == ".docx" else "official_rulebook",
            "size_kb": round(stat.st_size / 1024),
            "updated": _dt.date.fromtimestamp(stat.st_mtime).isoformat(),
            "pages": pages,
        })
    return out


@app.get("/api/documents/{filename}")
def serve_document(filename: str):
    path = (SOURCES_DIR / filename).resolve()
    if not str(path).startswith(str(SOURCES_DIR.resolve())) or not path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(path)


@app.get("/api/documents/{filename}/html", response_class=HTMLResponse)
def serve_document_html(filename: str):
    path = (SOURCES_DIR / filename).resolve()
    if not str(path).startswith(str(SOURCES_DIR.resolve())) or not path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    if not filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="HTML conversion only supported for .docx files")
    try:
        import mammoth
        with open(path, "rb") as f:
            result = mammoth.convert_to_html(f)
        html_body = result.value
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DOCX conversion failed: {exc}")
    return HTMLResponse(content=f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: Inter, system-ui, sans-serif; font-size: 13px; line-height: 1.6;
         color: #1A1A1A; padding: 24px 32px; max-width: 780px; margin: 0 auto; }}
  h1, h2, h3 {{ font-family: 'Hanken Grotesk', sans-serif; margin-top: 1.5em; }}
  h1 {{ font-size: 1.4em; }} h2 {{ font-size: 1.2em; }} h3 {{ font-size: 1.05em; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1em 0; }}
  th, td {{ border: 1px solid #e5e5e5; padding: 6px 10px; text-align: left; }}
  th {{ background: #f7f5f3; font-weight: 600; }}
  p {{ margin: 0.6em 0; }}
  ul, ol {{ padding-left: 1.4em; }}
</style>
</head>
<body>{html_body}</body>
</html>""")


@app.get("/api/documents/{filename}/pages/{page}")
def serve_document_page(filename: str, page: int):
    """Serve a window of pages around the cited one (cited page ± PAGE_WINDOW)."""
    path = (SOURCES_DIR / filename).resolve()
    if not str(path).startswith(str(SOURCES_DIR.resolve())) or not path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Page extraction only supported for PDF files")
    try:
        import io
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(str(path))
        total = len(reader.pages)
        if page < 0 or page >= total:
            raise HTTPException(status_code=404, detail="Page not found")
        start = max(0, page - PAGE_WINDOW)
        end = min(total - 1, page + PAGE_WINDOW)
        writer = PdfWriter()
        for p in range(start, end + 1):
            writer.add_page(reader.pages[p])
        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}_p{start}-{end}.pdf"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Page extraction failed: {exc}")


@app.get("/api/documents/{filename}/pages/{page}/highlighted/{source_id}")
def serve_highlighted_document_page(filename: str, page: int, source_id: str):
    """Serve the cited page (± PAGE_WINDOW) with the cited text highlighted.

    Highlights are placed by SEARCHING the page for demo-curated phrases (real
    text on the page), so the marks land on actual words — not blind boxes.
    Degrades to the plain multi-page window if PyMuPDF is unavailable or no
    phrase is found.
    """
    path = (SOURCES_DIR / filename).resolve()
    if not str(path).startswith(str(SOURCES_DIR.resolve())) or not path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Highlighting only supported for PDF files")

    phrases = DEMO_PDF_HIGHLIGHT_PHRASES.get(source_id, [])
    if not phrases:
        return serve_document_page(filename, page)

    try:
        import fitz  # PyMuPDF — accurate text search + highlight annotations
    except Exception:
        # No highlighter available — still give the multi-page window.
        return serve_document_page(filename, page)

    try:
        src = fitz.open(str(path))
        total = src.page_count
        if page < 0 or page >= total:
            raise HTTPException(status_code=404, detail="Page not found")

        # Surrounding-pages window; highlight only the cited page within it.
        start = max(0, page - PAGE_WINDOW)
        end = min(total - 1, page + PAGE_WINDOW)
        out = fitz.open()
        out.insert_pdf(src, from_page=start, to_page=end)
        cited = out[page - start]

        found = 0
        for phrase in phrases:
            for rect in cited.search_for(phrase, quads=False):
                annot = cited.add_highlight_annot(rect)
                annot.set_colors(stroke=HIGHLIGHT_RGB)
                annot.update()
                found += 1

        if not found:
            # Curated phrase didn't match this build of the PDF — don't ship an
            # empty highlight layer; fall back to the clean window.
            out.close(); src.close()
            return serve_document_page(filename, page)

        data = out.tobytes()
        out.close(); src.close()
        return StreamingResponse(
            iter([data]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}_p{start}-{end}_highlighted.pdf"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF highlighting failed: {exc}")


@app.post("/api/process-workflow", response_model=WorkflowResponse)
def process_workflow(payload: WorkflowPayload) -> WorkflowResponse:
    """Mock-process a captured rrweb session into a structured procedure."""
    procedure = _summarize(payload)
    return WorkflowResponse(procedure=procedure, event_count=len(payload.events))


@app.post("/api/ask", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    """
    Answer an employee question with the dual-context retrieval engine
    (retrieval_engine.query_sixth_sense): official rulebook chunks + tacit
    expert-workflow chunks.

    The engine and its vector store are imported lazily so the rest of the API
    keeps working before the RAG stack is installed/initialized. Two failure
    modes degrade gracefully instead of 500-ing:
      • dependencies not installed (langchain / chromadb / sentence-transformers)
      • installed but no vector store yet (run data_ingestion.py to build it)
    """
    try:
        from retrieval_engine import query_sixth_sense
    except Exception as exc:  # noqa: BLE001 — any import-time failure is "not ready"
        return AskResponse(
            question=req.question,
            engine="unavailable",
            detail=f"Retrieval engine dependencies not installed: {exc}",
        )

    try:
        results = query_sixth_sense(req.question)
    except Exception as exc:  # noqa: BLE001 — missing model cache or chroma_db
        return AskResponse(
            question=req.question,
            engine="unavailable",
            detail=(
                "Retrieval engine is installed but not initialized — build the "
                f"vector store first (python data_ingestion.py). ({exc})"
            ),
        )

    def to_chunks(docs: Any) -> list[RetrievedChunk]:
        return [
            RetrievedChunk(content=d.page_content, metadata=dict(d.metadata))
            for d in docs
        ]

    official = to_chunks(results.get("official_rules", []))
    expert = to_chunks(results.get("expert_workflow_context", []))

    # Label every chunk [1..N] so the generated answer can cite it.
    sources: list[Source] = []
    idx = 1
    for stype, chunks in (("official_rulebook", official), ("tacit_expert_knowledge", expert)):
        for c in chunks:
            doc = str(c.metadata.get("source", "?")).rsplit("/", 1)[-1]
            page = c.metadata.get("page")  # 0-indexed; None for DOCX
            sources.append(Source(index=idx, source_type=stype, document=doc, page=page))
            idx += 1

    # Synthesize a grounded answer with Claude. If the SDK isn't installed, no
    # API key is set, or the call fails, fall back to retrieval-only so the
    # endpoint still returns the chunks rather than 500-ing.
    answer: GeneratedAnswer | None = None
    engine = "retrieval"
    detail: str | None = None
    try:
        answer = _generate_answer(req.question, sources, official, expert)
        engine = "rag"
    except Exception as exc:  # noqa: BLE001 — missing key / SDK / API error
        detail = f"LLM generation unavailable, returning retrieval only: {exc}"

    return AskResponse(
        question=req.question,
        engine=engine,
        answer=answer,
        sources=sources,
        official_rules=official,
        expert_workflow_context=expert,
        detail=detail,
    )


@app.post("/api/agent", response_model=AgentResponse)
def agent_answer(req: AskRequest) -> AgentResponse:
    """
    Answer via the Phase-2 agent (agent.generate_sixth_sense_response): a
    LangChain + Claude pipeline that retrieves dual-context, applies the
    expert "Walter's Workflow" protocols, and returns guidance plus an
    action-routing decision and a pre-filled BPO draft form.

    Imported lazily and degraded gracefully — `available: false` with a
    `detail` when the agent can't run, so the Employee Space falls back to its
    local demo rather than 500-ing.
    """
    try:
        from agent import generate_sixth_sense_response
    except Exception as exc:  # noqa: BLE001 — missing langchain-anthropic etc.
        return AgentResponse(
            question=req.question,
            available=False,
            detail=f"Phase-2 agent unavailable (dependency/import): {exc}",
        )

    try:
        result = generate_sixth_sense_response(req.question)
    except Exception as exc:  # noqa: BLE001 — no API key, no vector store, parse error
        return AgentResponse(
            question=req.question,
            available=False,
            detail=f"Phase-2 agent could not generate a response: {exc}",
        )

    return AgentResponse(
        question=req.question,
        available=True,
        message=result.get("message"),
        requires_bpo_action=bool(result.get("requires_bpo_action", False)),
        bpo_draft_form=result.get("bpo_draft_form"),
        document_citations=result.get("document_citations", []),
        expert_citations=result.get("expert_citations", []),
    )


@app.post("/api/query", response_model=AgentResponse)
def query_answer(req: QueryRequest) -> AgentResponse:
    return agent_answer(AskRequest(question=req.query))


# ── Knowledge & context engine helpers ───────────────────────────────────

class _GroundedDraft(BaseModel):
    answer: str
    steps: list[AnswerStep] = Field(default_factory=list)


GROUNDED_SYSTEM_PROMPT = """\
You are CorteX, an enterprise knowledge assistant for SIX (Swiss financial-market \
infrastructure). You answer a compliance officer's question using ONLY the \
retrieved knowledge chunks provided, each labelled [n].

Rules:
  1. Ground every claim in the chunks and cite the supporting [n] indices \
inline using bracketed numbers like [1], [2], corresponding exactly to the \
provided context chunks. \
Never invent regulations, ISINs, thresholds, field names, or experts.
  1a. If the retrieved knowledge is empty, do not use outside knowledge. Return \
a safe refusal and leave steps empty.
  2. If the chunks are thin or only partially cover the question, say so plainly \
in `answer` and give the best-supported partial guidance — never bluff.
  3. For a process / "how do I" question, fill `steps` with ordered, concrete \
actions, each citing the [n] it rests on. For a direct factual or "who" \
question, keep `steps` empty and put the answer in `answer`.
  4. Be concise and operational — this is a procedure, not an essay.

Output JSON: `answer` (the grounded prose, with [n] citations) and `steps` \
(ordered actions with `text` and `citations`, or empty)."""


MODE_INSTRUCTIONS = {
    "default": (
        "RESPONSE MODE: DEFAULT — Write for a non-specialist. Give only the "
        "conceptual essentials and the necessary steps to act. Omit technical "
        "jargon, regulation article numbers (unless strictly essential), internal "
        "field names, and edge-case caveats. Favour plain language and brevity."
    ),
    "expert": (
        "RESPONSE MODE: EXPERT — Write for a domain expert. Include the technical "
        "detail available in the chunks: exact regulation references, field names, "
        "ISIN/threshold specifics, conditions, edge cases, and precise operational "
        "nuance. Be thorough and precise rather than brief."
    ),
}


def _generate_grounded(
    question: str, ranked: list[dict[str, Any]], mode: str = "default"
) -> "_GroundedDraft":
    import anthropic
    context_lines = []
    for i, c in enumerate(ranked, start=1):
        label = f"{c.get('source_type', 'source')} · {c.get('title', '')}"
        context_lines.append(f"[{i}] ({label})\n{(c.get('content') or '').strip()}")
    context_block = "\n\n".join(context_lines)
    mode_instruction = MODE_INSTRUCTIONS.get(mode, MODE_INSTRUCTIONS["default"])
    user_content = (
        f"{mode_instruction}\n\nQUESTION:\n{question}\n\n"
        f"RETRIEVED KNOWLEDGE:\n{context_block}\n\n"
        "Produce the grounded answer now, citing chunk indices [n]."
    )
    client = anthropic.Anthropic()
    response = client.messages.parse(
        model=GENERATION_MODEL,
        max_tokens=2000,
        thinking={"type": "adaptive"},
        system=[{"type": "text", "text": GROUNDED_SYSTEM_PROMPT,
                 "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
        output_format=_GroundedDraft,
    )
    return response.parsed_output


def _compose_grounded(question: str, ranked: list[dict[str, Any]],
                      display_format: str) -> "_GroundedDraft":
    if not ranked:
        return _GroundedDraft(
            answer="I couldn't find verified knowledge that matches this question. "
                   "The best next step is to ask the recommended expert below.",
            steps=[],
        )
    top = ranked[0]
    if display_format == "step_by_step":
        sentences = [s.strip() for s in (top.get("content") or "").replace(";", ".").split(".")
                     if len(s.strip()) > 15][:6]
        steps = [AnswerStep(text=s, citations=[1]) for s in sentences]
        return _GroundedDraft(
            answer=f"Based on \"{top['title']}\" [1], here is the procedure:",
            steps=steps,
        )
    excerpt = " ".join((top.get("content") or "").split())[:280]
    return _GroundedDraft(answer=f"{excerpt} [1]", steps=[])


def _ensure_inline_citations(
    draft: "_GroundedDraft",
    ranked: list[dict[str, Any]],
) -> "_GroundedDraft":
    if not ranked:
        return draft
    if "[" not in draft.answer:
        draft.answer = f"{draft.answer.rstrip()} [1]"
    for step in draft.steps:
        if not step.citations:
            step.citations = [1]
    return draft


def _choose_display_format(plan: dict[str, Any], escalate: bool) -> str:
    intent = plan.get("detected_intent")
    if escalate:
        return "escalation_needed"
    if escalate and intent in ("find_expert", "resolve_incident"):
        return "escalation_needed"
    if intent == "find_expert":
        return "expert_recommendation"
    if intent == "explain_process":
        return "step_by_step"
    if intent == "resolve_incident":
        return "escalation_needed" if escalate else "step_by_step"
    if intent == "summarize_document":
        return "summary"
    return "direct_answer"


def _citations_from_chunks(ranked: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cards = []
    for i, c in enumerate(ranked, start=1):
        page = c.get("page")
        page_or_line = f"page {int(page) + 1}" if isinstance(page, int) else "line unavailable"
        excerpt = " ".join((c.get("content") or "").split())[:320]
        cards.append({
            "id": i, "index": i,
            "source_id": c.get("source_id"), "source_type": c.get("source_type"),
            "kind": c.get("kind"), "title": c.get("title"),
            "document": c.get("document"), "source_file": c.get("document"),
            "page": page, "page_or_line": page_or_line,
            "department": c.get("department"), "trust_level": c.get("trust_level"),
            "updated_at": c.get("updated_at"), "relevance_score": c.get("relevance_score"),
            "relevant_quote": excerpt, "content": c.get("content"),
            "matched_terms": c.get("matched_terms", []), "reason": c.get("reason"),
            "originating_request_id": c.get("originating_request_id"),
        })
    return cards


def _expert_citations(ranked: list[dict[str, Any]],
                      routed: list[dict[str, Any]]) -> list[dict[str, Any]]:
    import knowledge_store as ks
    seen: dict[str, dict[str, Any]] = {}
    for r in routed:
        seen[r["id"]] = ks.decorate_expert(r)
    for c in ranked:
        # Only surface a chunk's owner if that chunk is genuinely on-topic —
        # otherwise an off-topic but expert-owned source routes the wrong person.
        if float(c.get("match_score", c.get("relevance_score", 0.0))) < 3.0:
            continue
        for eid in c.get("owner_expert_ids", []):
            if eid in seen or eid not in ks.EXPERTS_BY_ID:
                continue
            exp = ks.EXPERTS_BY_ID[eid]
            seen[eid] = {
                **ks.decorate_expert(exp),
                "reason": f"Owns the cited source \"{c.get('title')}\".",
            }
    return list(seen.values())


def _person_answer(people: list[dict[str, Any]], query: str) -> str:
    if not people:
        return (
            "I could not find a verified employee profile matching this query. "
            "To avoid inventing company structure, please check the central "
            "employee directory or submit a general inquiry."
        )
    person = people[0]
    status = "active" if person.get("active") else "former"
    parts = [
        f"{person['full_name']} is {status} in the SIX employee directory.",
        f"Role: {person.get('role_title')} in {person.get('department')}.",
        f"Email: {person.get('email')}.",
    ]
    if person.get("profile_summary"):
        parts.append(person["profile_summary"])
    if not person.get("active"):
        parts.append(
            "This person is not currently available for direct routing; I can "
            "suggest active colleagues with related expertise."
        )
    return " ".join(parts)


def _employee_cards(people: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": p.get("id"),
            "full_name": p.get("full_name"),
            "expert_name": p.get("full_name"),
            "role_title": p.get("role_title"),
            "department": p.get("department"),
            "email": p.get("email"),
            "manager": p.get("manager"),
            "active": bool(p.get("active")),
            "employment_status": p.get("status"),
            "expertise_tags": p.get("expertise_tags", []),
            "profile_summary": p.get("profile_summary"),
            "similar_experts": p.get("similar_experts", []),
        }
        for p in people
    ]


def _legacy_expert_signal(ranked: list[dict[str, Any]]) -> tuple[bool, list[dict[str, Any]]]:
    import knowledge_store as ks
    alternatives: list[dict[str, Any]] = []
    unavailable = False
    for chunk in ranked:
        for eid in chunk.get("owner_expert_ids", []):
            employee = ks.employee_by_id(eid)
            if employee and not employee.get("active"):
                unavailable = True
                alternatives.extend(ks.suggest_alternatives_for_expert(eid))
    seen: dict[str, dict[str, Any]] = {}
    for alt in alternatives:
        seen[alt["id"]] = alt
    return unavailable, _employee_cards(list(seen.values()))


def _governance_payload(
    ranked: list[dict[str, Any]],
    confidence: dict[str, Any],
    reusable: bool = False,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return _access_governance(context, ranked, confidence, reusable)


def _build_next_actions(plan, ranked, doc_citations, expert_citations,
                        escalate, escalation_block) -> list[NextBestAction]:
    actions: list[NextBestAction] = []
    openable = next((c for c in doc_citations if c.get("document")), None)
    if openable:
        actions.append(NextBestAction(
            label=f"Open {openable['title']}", type="open_document",
            target_id=str(openable["index"]),
        ))
    if expert_citations:
        exp = expert_citations[0]
        actions.append(NextBestAction(
            label=f"Contact {exp['expert_name']}", type="contact_expert",
            target_id=exp["id"],
        ))
    if escalate:
        actions.append(NextBestAction(label="Send a knowledge request",
                                      type="create_knowledge_request"))
    follow = {
        "esg_sfdr": "What PAI indicators must be populated before sign-off?",
        "fatca_tax": "How do I determine US-person status for the holder?",
        "mifid": "What target-market fields are required for a complex instrument?",
        "master_data": "When does an instrument need an extension assessment?",
        "settlement": "What is the current SWIFT settlement retry window?",
    }
    domains = plan.get("target_domains", [])
    if domains and domains[0] in follow:
        actions.append(NextBestAction(
            label=follow[domains[0]], type="ask_follow_up",
            suggested_prompt=follow[domains[0]],
        ))
    return actions


def _demo_doc(
    idx: int,
    source_id: str,
    source_type: str,
    title: str,
    document: str | None,
    quote: str,
    page_or_line: str = "line unavailable",
    department: str = "Regulatory Data Services",
    trust_level: str = "verified",
    page: int | None = None,
    highlights: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": idx,
        "index": idx,
        "source_id": source_id,
        "source_type": source_type,
        "kind": source_type,
        "title": title,
        "document": document,
        "source_file": document,
        "page": page,
        "page_or_line": page_or_line,
        "department": department,
        "trust_level": trust_level,
        "updated_at": "2026-05-30T09:00:00+00:00",
        "relevance_score": 9.9,
        "relevant_quote": quote,
        "content": quote,
        "demo_highlights": highlights or [],
        "demo_pdf_highlight": bool(document and page is not None and source_id in DEMO_PDF_HIGHLIGHT_PHRASES),
        "matched_terms": [],
        "reason": "Hardcoded demo response for a smooth pitch flow.",
    }


def _demo_expert(expert_id: str, reason: str | None = None) -> dict[str, Any] | None:
    import knowledge_store as ks

    expert = ks.EXPERTS_BY_ID.get(expert_id)
    if not expert:
        return None
    out = ks.decorate_expert(expert)
    if reason:
        out["reason"] = reason
    return out


def _demo_people(query: str) -> list[dict[str, Any]]:
    import knowledge_store as ks

    return _employee_cards(ks.search_people(query, limit=4))


def _demo_grounded_response(req: AnswerRequest) -> GroundedAnswerResponse | None:
    """Instant deterministic answers for the pitch journey.

    These bypass Claude so the live demo has no API wait, while non-demo
    questions still use the normal retrieval/LLM path.
    """
    q = " ".join(req.question.lower().split())

    jacob = _demo_expert(
        "exp_jacob_keller",
        "Owns the captured SFDR workflow and PAI sign-off procedure.",
    )
    walter = _demo_expert(
        "exp_walter_meier",
        "Closest active SME for instrument coverage and extension assessment.",
    )
    sophie = _demo_expert(
        "exp_sophie_brand",
        "Related regulatory-data specialist for reporting scope questions.",
    )

    def response(
        answer: str,
        display_format: str,
        docs: list[dict[str, Any]],
        steps: list[AnswerStep] | None = None,
        experts: list[dict[str, Any] | None] | None = None,
        employees: list[dict[str, Any]] | None = None,
        confidence: str = "high",
        confidence_reason: str = "Matched a curated demo path backed by verified SIX corpus and expert-captured procedures.",
        limitations: list[str] | None = None,
        next_actions: list[NextBestAction] | None = None,
        escalation: dict[str, Any] | None = None,
        engine: str = "demo_hardcoded",
        expert_unavailable: bool = False,
        alternatives: list[dict[str, Any]] | None = None,
    ) -> GroundedAnswerResponse:
        clean_experts = [e for e in (experts or []) if e]
        controlled_docs = _apply_access_controls(docs, req.context)
        return GroundedAnswerResponse(
            question=req.question,
            engine=engine,
            answer=answer,
            display_format=display_format,
            steps=steps or [],
            confidence=confidence,
            confidence_reason=confidence_reason,
            confidence_score=1.0 if confidence == "high" else 0.72,
            confidence_threshold=0.6,
            context_used={
                "user_role": req.context.get("role"),
                "department": req.context.get("department"),
                "retrieved_source_count": len(docs),
                "demo_hardcoded": True,
            },
            query_plan={"detected_intent": display_format, "demo_hardcoded": True},
            document_citations=controlled_docs,
            expert_citations=clean_experts,
            employee_citations=employees or [],
            expert_unavailable=expert_unavailable,
            suggested_alternatives=alternatives or [],
            governance=_access_governance(
                req.context,
                controlled_docs,
                {"threshold": 0.6},
                reusable=any(d.get("source_type") == "expert_resolution" for d in controlled_docs),
                source_policy="Curated demo answer; no LLM call made; access policy applied before citations are returned.",
            ),
            source_trace=[
                {"source_id": d.get("source_id"), "title": d.get("title"), "reason_used": d.get("reason")}
                for d in controlled_docs
            ],
            limitations=limitations or [],
            next_best_actions=next_actions or [],
            escalation=escalation,
        )

    alpen_doc = _demo_doc(
        1,
        "kn_alpen_golden_data",
        "document",
        "Golden data sample: Alpen Privatbank Ausgewogene Strategie",
        "Start Hack ZH_SIX_Presentation.pdf",
        "ISIN AT0000828553 resolves as Alpen Privatbank Ausgewogene Strategie; verify SFDR classification, Regulatory Based flag, and PAI completeness before sign-off.",
        "page 12",
        page=11,
        highlights=[
            "ISIN AT0000828553",
            "Alpen Privatbank Ausgewogene Strategie",
            "SFDR classification",
            "PAI completeness",
        ],
    )
    sfdr_runbook = _demo_doc(
        1,
        "kn_sfdr_runbook",
        "runbook",
        "SFDR Article 8/9 classification runbook",
        "EU_SFDR_jc_2021_03_joint_esas_final_report_on_rts_under_sfdr.pdf",
        "To classify a fund under SFDR, confirm the ISIN resolves, open the ESG Data panel, read the Article 6/8/9 classification, verify Regulatory Based is Yes, and confirm mandatory PAI indicators.",
        "page 1",
        page=0,
        highlights=[
            "confirm the ISIN resolves",
            "SFDR classification",
            "Article 6 / 8 / 9",
            "Regulatory Based",
            "PAI indicators",
        ],
    )
    pai_note = _demo_doc(
        2,
        "kn_pai_note",
        "expert_note",
        "Which PAI indicators must be populated before sign-off",
        None,
        "Mandatory PAI checks include GHG emissions Scopes 1-3, carbon footprint, GHG intensity, fossil-fuel exposure, and non-renewable energy share.",
        highlights=[
            "GHG emissions Scopes 1-3",
            "carbon footprint",
            "GHG intensity",
            "fossil-fuel exposure",
            "non-renewable energy share",
        ],
    )
    onboarding = _demo_doc(
        1,
        "kn_master_data_onboarding",
        "runbook",
        "Master Data opening & instrument onboarding",
        "Confidential_SIX_master-data-openining-and-mutations-facsheet.pdf",
        "Coverage cannot be confirmed without an ISIN. If the instrument is not covered natively or misses required SFDR PAI attributes, initiate an extension assessment.",
        "page 1",
        page=0,
        highlights=[
            "Coverage cannot be confirmed without an ISIN",
            "not covered natively",
            "missing required SFDR PAI attributes",
            "extension assessment",
        ],
    )

    if "golden data" in q or "at0000828553" in q:
        return response(
            answer=(
                "For Alpen Privatbank Ausgewogene Strategie, ISIN AT0000828553 resolves in the curated golden-data sample. "
                "Treat it as an ESG/SFDR master-data check: validate the SFDR classification, confirm the Regulatory Based flag, "
                "and check PAI completeness before sign-off [1]."
            ),
            display_format="direct_answer",
            docs=[alpen_doc],
            experts=[jacob],
            next_actions=[
                NextBestAction(label="Open golden-data source", type="open_document", target_id="1"),
                NextBestAction(label="Ask for the SFDR workflow", type="ask_follow_up", suggested_prompt="How do I verify SFDR data for Alpen Privatbank?"),
            ],
        )

    if ("verify" in q and "sfdr" in q and "alpen" in q) or ("how do i verify sfdr" in q):
        return response(
            answer="Use Jacob's captured workflow. It combines the golden-data record with the SFDR classification runbook [1][2].",
            display_format="step_by_step",
            docs=[sfdr_runbook, alpen_doc],
            steps=[
                AnswerStep(text='Open Master Data Opening and search for counterparty "Alpen Privatbank".', citations=[2]),
                AnswerStep(text="Enter ISIN AT0000828553 and confirm the security resolves to the expected fund.", citations=[2]),
                AnswerStep(text="Open the ESG Data panel and read the SFDR classification: Article 6, 8, or 9.", citations=[1]),
                AnswerStep(text='Confirm "Regulatory Based" is set to Yes before relying on the value.', citations=[1]),
                AnswerStep(text="Check mandatory PAI indicators before sign-off, then mark the record Verified.", citations=[1]),
            ],
            experts=[jacob],
            next_actions=[
                NextBestAction(label="What PAI indicators must be populated before sign-off?", type="ask_follow_up", suggested_prompt="What PAI indicators must be populated before sign-off?"),
                NextBestAction(label="Contact Jacob Keller", type="contact_expert", target_id="exp_jacob_keller"),
            ],
        )

    if "who is jacob" in q or "jacob keller" in q and "who" in q:
        employees = _demo_people("Jacob Keller")
        return response(
            answer=(
                "Jacob Keller is the ESG & SFDR Workflow Expert in Regulatory Data Services. "
                "He owns practical knowledge around SFDR workflows, ESG sub-classification, PAI sign-off checks, and master-data opening."
            ),
            display_format="employee_profile",
            docs=[],
            experts=[jacob],
            employees=employees,
            next_actions=[NextBestAction(label="Contact Jacob Keller", type="contact_expert", target_id="exp_jacob_keller")],
            confidence_reason="Matched Jacob Keller in the employee directory.",
            engine="directory_demo",
        )

    if "pai indicators" in q or "before sign-off" in q:
        return response(
            answer=(
                "Before SFDR sign-off, check the mandatory PAI set: GHG emissions Scopes 1-3, carbon footprint, "
                "GHG intensity, fossil-fuel exposure, and non-renewable energy share [1]. Missing mandatory PAI values mean the record should not be signed off."
            ),
            display_format="direct_answer",
            docs=[pai_note],
            experts=[jacob],
            next_actions=[NextBestAction(label="Contact Jacob Keller", type="contact_expert", target_id="exp_jacob_keller")],
        )

    if "onboarding" in q or "extension assessment" in q or "instrument need" in q:
        return response(
            answer=(
                "An instrument needs onboarding or extension assessment when it does not resolve under native coverage, "
                "or when required attributes such as SFDR PAI properties are missing. Do not sign off manually; route it through Master Data extension assessment [1]."
            ),
            display_format="direct_answer",
            docs=[onboarding],
            experts=[walter],
            next_actions=[NextBestAction(label="Contact Walter Meier", type="contact_expert", target_id="exp_walter_meier")],
        )

    if "esg-linked structured product" in q or "missing pai" in q or "structured product validation" in q:
        active_jacob = bool(jacob and jacob.get("active"))
        alternatives = [e for e in [walter, sophie] if e]
        routed = alternatives if ("no longer" in q or "not available" in q or not active_jacob) else [walter, jacob]
        draft = {
            "title": "Validate ESG-linked structured product with missing PAI attributes",
            "question": req.question,
            "context_summary": (
                "The user is validating a new ESG-linked structured product. Native coverage and SFDR PAI completeness are uncertain; "
                "the request should be reviewed by Master Data / ESG SMEs."
            ),
            "requester_user_id": req.context.get("user_id", "user_cosmina"),
            "routed_expert_ids": [routed[0]["id"]] if routed else [],
            "domain_tags": ["esg_sfdr", "master_data"],
            "related_source_ids": ["kn_master_data_onboarding", "kn_pai_note"],
            "priority": "high",
            "notes": "",
        }
        return response(
            answer=(
                "This is non-trivial because the product combines structured-product coverage with ESG/SFDR attribute completeness. "
                "CorteX cannot safely confirm coverage without an ISIN and without checking PAI attributes. Route this to the active Master Data SME for an extension assessment [1][2]."
            ),
            display_format="escalation_needed",
            docs=[onboarding, pai_note],
            experts=routed,
            expert_unavailable=not active_jacob,
            alternatives=alternatives if not active_jacob else [],
            limitations=["No ISIN was provided, so instrument-level coverage cannot be confirmed."],
            next_actions=[
                NextBestAction(label="Send a knowledge request", type="create_knowledge_request"),
                NextBestAction(label=f"Contact {routed[0]['expert_name']}", type="contact_expert", target_id=routed[0]["id"]),
            ] if routed else [NextBestAction(label="Send a knowledge request", type="create_knowledge_request")],
            escalation={
                "needed": True,
                "reasons": [
                    "No ISIN provided for instrument-level coverage verification.",
                    "Missing or uncertain SFDR PAI attributes require expert assessment.",
                ],
                "recommendation": f"Route to {routed[0]['expert_name']} for Master Data extension assessment." if routed else "Route to Master Data Operations.",
                "experts": routed,
                "request_draft": draft,
            },
            confidence="medium",
            confidence_reason="The route is known, but the exact product cannot be validated without an ISIN and attribute check.",
        )

    if "project helios alpha" in q or "maria novik" in q:
        return response(
            answer=(
                "I do not have verified company documentation, a current employee-directory match, or a logged expert resolution for Project Helios Alpha or Maria Novik. "
                "To avoid inventing information, CorteX cannot answer this from the available SIX knowledge base."
            ),
            display_format="zero_knowledge",
            docs=[],
            experts=[],
            confidence="low",
            confidence_reason="No curated demo source, directory profile, or reusable expert resolution matches this subject.",
            limitations=["No verified evidence found in the demo corpus."],
            next_actions=[],
            engine="zero_knowledge_demo",
        )

    return None


GLOSSARY: dict[str, dict[str, str]] = {
    "isin": {
        "label": "ISIN",
        "answer": (
            "An ISIN, or International Securities Identification Number, is a 12-character identifier used to uniquely identify a financial instrument. "
            "It normally has a two-letter country prefix, nine alphanumeric characters, and one check digit. An ISIN identifies the security itself; it does not by itself confirm whether SIX has full data coverage, eligibility, or all required regulatory attributes."
        ),
        "quote": "ISIN is a 12-character international identifier for a security; instrument coverage still needs a concrete ISIN-level lookup.",
    },
    "lei": {
        "label": "LEI",
        "answer": (
            "An LEI, or Legal Entity Identifier, is a 20-character identifier for a legal entity participating in financial transactions. "
            "It identifies the entity, not a specific instrument, and is commonly used for regulatory reporting, counterparty identification, and data quality checks."
        ),
        "quote": "LEI identifies a legal entity, while identifiers such as ISIN identify instruments.",
    },
    "cusip": {
        "label": "CUSIP",
        "answer": (
            "A CUSIP is a North American security identifier, typically nine characters long, used mainly for instruments issued in the United States and Canada. "
            "It is useful for local identification, while ISIN is the more global security identifier."
        ),
        "quote": "CUSIP is a North American security identifier; ISIN is the global identifier format.",
    },
    "sedol": {
        "label": "SEDOL",
        "answer": (
            "A SEDOL is a seven-character identifier commonly used in the UK and Ireland for listed securities. "
            "It helps identify traded instruments in local market workflows, but it is not the same as an ISIN."
        ),
        "quote": "SEDOL is a local market security identifier, distinct from the global ISIN.",
    },
    "sfdr": {
        "label": "SFDR",
        "answer": (
            "SFDR stands for Sustainable Finance Disclosure Regulation. In this app's workflow context, it matters because products can require sustainability classifications, disclosures, and PAI-related checks before operational sign-off."
        ),
        "quote": "SFDR concerns sustainability-related disclosures and classifications for financial products.",
    },
    "pai": {
        "label": "PAI",
        "answer": (
            "PAI means Principal Adverse Impact. In an ESG/SFDR data workflow, PAI indicators describe adverse sustainability impacts that may need to be populated and checked before a record can be verified."
        ),
        "quote": "PAI indicators are sustainability-impact data points used in SFDR-related checks.",
    },
}


def _glossary_response(req: AnswerRequest) -> GroundedAnswerResponse | None:
    q = " ".join(req.question.lower().split())
    definition_intent = any(
        phrase in q
        for phrase in ("what is", "what are", "define", "meaning of", "what does", "explain")
    )
    if not definition_intent:
        return None

    hit_key = None
    for key in GLOSSARY:
        if key in q:
            hit_key = key
            break
    if not hit_key:
        return None

    item = GLOSSARY[hit_key]
    citation = _demo_doc(
        1,
        f"glossary_{hit_key}",
        "glossary",
        f"{item['label']} definition",
        None,
        item["quote"],
        "CorteX glossary",
        department="Reference Data Services",
        trust_level="verified",
    )
    controlled = _apply_access_controls([citation], req.context)
    return GroundedAnswerResponse(
        question=req.question,
        engine="glossary",
        answer=f"{item['answer']} [1]",
        display_format="direct_answer",
        steps=[],
        confidence="high",
        confidence_reason="Answered from the built-in CorteX glossary for common financial-market terminology.",
        confidence_score=0.95,
        confidence_threshold=0.6,
        context_used={
            "user_role": req.context.get("role"),
            "department": req.context.get("department"),
            "retrieved_source_count": 1,
            "glossary": True,
        },
        query_plan={"detected_intent": "definition", "glossary_term": hit_key},
        document_citations=controlled,
        expert_citations=[],
        employee_citations=[],
        governance=_access_governance(
            req.context,
            controlled,
            {"threshold": 0.6},
            reusable=False,
            source_policy="Common terminology glossary; not an instrument-level coverage decision.",
        ),
        limitations=[
            "This is a general definition, not a confirmation of SIX coverage or completeness for a specific instrument."
        ],
        next_best_actions=[
            NextBestAction(
                label="Check coverage for a concrete ISIN",
                type="ask_follow_up",
                suggested_prompt="How do I check whether an ISIN is covered?",
            )
        ] if hit_key == "isin" else [],
    )


# ── Knowledge & context engine routes (specs 09 / 10 / 11) ───────────────

@app.post("/api/answer", response_model=GroundedAnswerResponse)
def answer(req: AnswerRequest) -> GroundedAnswerResponse:
    try:
        import context_engine as ce
        import escalation as esc
    except Exception as exc:  # noqa: BLE001
        return GroundedAnswerResponse(
            question=req.question, engine="unavailable",
            answer="", display_format="direct_answer",
            confidence="low", confidence_reason="engine unavailable",
            detail=f"Knowledge engine unavailable: {exc}",
        )

    context = ce.collect_user_context(req.context)
    glossary = _glossary_response(req)
    if glossary is not None:
        return glossary

    demo = _demo_grounded_response(req)
    if demo is not None:
        return demo

    plan = ce.plan_query(req.question, context)

    if plan.get("detected_intent") == "employee_search":
        import knowledge_store as ks
        people = ks.search_people(req.question, limit=4)
        confidence = {
            "level": "high" if people else "low",
            "reason": "Matched against the SIX employee directory." if people else "No employee directory match.",
            "limitations": [] if people else ["No verified employee profile matched this query."],
            "score": 1.0 if people else 0.0,
            "threshold": 0.6,
        }
        employee_cards = _employee_cards(people)
        alternatives = []
        if people and not people[0].get("active"):
            alternatives = _employee_cards(ks.suggest_alternatives_for_expert(people[0].get("id")))
        return GroundedAnswerResponse(
            question=req.question,
            engine="directory" if people else "zero_knowledge",
            answer=_person_answer(people, req.question),
            display_format="employee_profile" if people else "zero_knowledge",
            steps=[],
            confidence=confidence["level"],
            confidence_reason=confidence["reason"],
            confidence_score=confidence["score"],
            confidence_threshold=confidence["threshold"],
            context_used={
                "user_role": context.get("role"),
                "department": context.get("department"),
                "target_domains": [],
                "retrieved_source_count": len(people),
            },
            query_plan=plan,
            employee_citations=employee_cards,
            expert_citations=employee_cards,
            expert_unavailable=bool(people and not people[0].get("active")),
            suggested_alternatives=alternatives,
            governance=_governance_payload([], confidence, reusable=False, context=context),
            limitations=confidence["limitations"],
            next_best_actions=[
                NextBestAction(
                    label=f"Contact {people[0]['full_name']}",
                    type="contact_expert",
                    target_id=people[0]["id"],
                )
            ] if people and people[0].get("active") else [],
        )

    chunks = ce.retrieve_knowledge(plan)
    ranked = ce.rank_chunks(chunks, plan, context, limit=6)

    confidence = esc.score_confidence(ranked, plan)
    esc_decision = esc.should_escalate(confidence, ranked, plan)
    below_threshold = bool(confidence.get("below_threshold"))
    escalate = esc_decision["escalate"] or below_threshold
    escalation_block = esc.build_escalation(req.question, plan, ranked, context) if escalate else {}
    routed_experts = escalation_block.get("experts", [])
    display_format = _choose_display_format(plan, escalate)

    engine = "grounded"
    detail = None
    if below_threshold and not ranked:
        engine = "zero_knowledge"
        draft = _GroundedDraft(
            answer=(
                "I don't have any verified company documentation, employee "
                "directory record, or logged expert resolution regarding this "
                "topic. To prevent inaccurate information, I cannot provide an "
                "answer from CorteX. Please verify the subject or submit a "
                "general inquiry."
            ),
            steps=[],
        )
        display_format = "zero_knowledge"
    elif below_threshold:
        engine = "escalation_needed"
        draft = _GroundedDraft(
            answer=(
                "No documented solution found for this specific context. "
                "Let's ask the right person."
            ),
            steps=[],
        )
        display_format = "escalation_needed"
    elif ranked:
        try:
            draft = _ensure_inline_citations(_generate_grounded(req.question, ranked, req.mode), ranked)
            engine = "rag"
        except Exception as exc:  # noqa: BLE001
            draft = _ensure_inline_citations(
                _compose_grounded(req.question, ranked, display_format),
                ranked,
            )
            detail = f"LLM unavailable, deterministic compose: {exc}"
    else:
        draft = _compose_grounded(req.question, ranked, display_format)

    document_citations = _apply_access_controls(_citations_from_chunks(ranked), context)
    expert_citations = _expert_citations(ranked, routed_experts)
    expert_unavailable, suggested_alternatives = _legacy_expert_signal(ranked)
    if expert_unavailable:
        active_ids = {e["id"] for e in suggested_alternatives}
        for exp in list(expert_citations):
            if exp.get("employment_status") == "former":
                continue
            active_ids.add(exp["id"])
        if suggested_alternatives:
            expert_citations = [
                *expert_citations,
                *[e for e in suggested_alternatives if e["id"] not in {x.get("id") for x in expert_citations}],
            ]
    source_trace = [{"source_id": c.get("source_id"), "title": c.get("title"),
                     "reason_used": c.get("reason")} for c in ranked]
    next_actions = _build_next_actions(plan, ranked, document_citations,
                                       expert_citations, escalate, escalation_block)
    context_used = {
        "user_role": context.get("role"), "department": context.get("department"),
        "current_page": context.get("current_page"),
        "current_workflow": context.get("current_workflow"),
        "selected_text_used": bool(context.get("selected_text")),
        "screen_context_used": bool(context.get("screen_context")),
        "target_domains": plan.get("target_domains", []),
        "retrieved_source_count": len(ranked),
    }
    escalation_out = None
    if escalate:
        escalation_out = {
            "needed": True, "reasons": esc_decision["reasons"],
            "recommendation": escalation_block.get("recommendation"),
            "experts": routed_experts,
            "request_draft": escalation_block.get("request_draft"),
        }

    return GroundedAnswerResponse(
        question=req.question, engine=engine,
        answer=draft.answer, display_format=display_format, steps=draft.steps,
        confidence=confidence["level"], confidence_reason=confidence["reason"],
        context_used=context_used, query_plan=plan,
        confidence_score=confidence.get("score"),
        confidence_threshold=confidence.get("threshold"),
        document_citations=document_citations, expert_citations=expert_citations,
        expert_unavailable=expert_unavailable,
        suggested_alternatives=suggested_alternatives,
        governance=_governance_payload(
            document_citations,
            confidence,
            reusable=any(c.get("source_type") == "expert_resolution" for c in ranked),
            context=context,
        ),
        source_trace=source_trace, limitations=confidence["limitations"],
        next_best_actions=next_actions, escalation=escalation_out, detail=detail,
    )


@app.get("/api/experts")
def list_experts() -> dict[str, Any]:
    import knowledge_store as ks
    return {"experts": [ks.decorate_expert(e) for e in ks.EXPERTS]}


@app.post("/api/people/search")
def people_search(payload: PeopleSearchRequest) -> dict[str, Any]:
    import knowledge_store as ks
    people = ks.search_people(payload.query, limit=5)
    return {
        "query": payload.query,
        "people": _employee_cards(people),
        "answer": _person_answer(people, payload.query),
        "confidence": "high" if people else "low",
    }


@app.get("/api/demo/state")
def get_demo_state() -> dict[str, Any]:
    import knowledge_store as ks
    return {"state": ks.get_demo_state()}


@app.post("/api/demo/state")
def set_demo_state(payload: DemoStateRequest) -> dict[str, Any]:
    import knowledge_store as ks
    return {"state": ks.set_demo_state(payload.model_dump(exclude_none=True))}


@app.post("/api/expert-matches")
def expert_matches(payload: ExpertMatchRequest) -> dict[str, Any]:
    import context_engine as ce
    import knowledge_store as ks

    context = ce.collect_user_context({})
    plan = ce.plan_query(payload.query, context)
    experts = ks.match_experts_for_query(
        payload.query,
        intent=plan.get("detected_intent"),
        domains=plan.get("target_domains", []),
        limit=4,
    )
    return {
        "query": payload.query,
        "intent": plan.get("detected_intent"),
        "target_domains": plan.get("target_domains", []),
        "experts": experts,
    }


@app.get("/api/knowledge")
def list_knowledge() -> dict[str, Any]:
    import knowledge_store as ks
    return {"seed": ks.SEED_KNOWLEDGE, "persisted": ks.load_persisted_knowledge()}


@app.get("/api/knowledge-requests")
def list_knowledge_requests() -> dict[str, Any]:
    import knowledge_store as ks
    return {"requests": ks.load_requests()}


@app.post("/api/knowledge-requests")
def create_knowledge_request(payload: KnowledgeRequestPayload) -> dict[str, Any]:
    import knowledge_store as ks
    return {"request": ks.create_knowledge_request(payload.model_dump())}


@app.post("/api/knowledge-requests/{request_id}/resolve")
def resolve_knowledge_request(request_id: str, payload: ResolutionPayload) -> dict[str, Any]:
    import knowledge_store as ks
    try:
        return ks.resolve_request(request_id, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
