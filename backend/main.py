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

app = FastAPI(title="SIXsens API", version="0.1.0")

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


class QueryRequest(BaseModel):
    query: str


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


# ── Knowledge & context engine schemas (specs 09 / 10 / 11) ───────────────
class AnswerRequest(BaseModel):
    """A question plus an optional snapshot of the user's working context."""
    question: str
    context: dict[str, Any] = Field(default_factory=dict)


class NextBestAction(BaseModel):
    label: str
    type: str  # open_document | contact_expert | ask_follow_up | create_knowledge_request | save_knowledge
    target_id: str | None = None
    suggested_prompt: str | None = None


class GroundedAnswerResponse(BaseModel):
    """The single trustworthy, source-backed answer object (spec 10)."""
    question: str
    engine: str  # "rag" | "grounded" | "unavailable"
    answer: str
    display_format: str
    steps: list[AnswerStep] = Field(default_factory=list)
    confidence: str  # high | medium | low
    confidence_reason: str
    context_used: dict[str, Any] = Field(default_factory=dict)
    query_plan: dict[str, Any] = Field(default_factory=dict)
    document_citations: list[dict[str, Any]] = Field(default_factory=list)
    expert_citations: list[dict[str, Any]] = Field(default_factory=list)
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


# ── rrweb event introspection ────────────────────────────────────────────
# rrweb event types: 0=DomContentLoaded, 1=Load, 2=FullSnapshot,
# 3=IncrementalSnapshot, 4=Meta, 5=Custom, 6=Plugin.
# IncrementalSnapshot sources: 2=MouseInteraction, 5=Input, etc.
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
You are SIXsens, a compliance assistant for SIX (the Swiss financial-market \
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
        thinking={"type": "adaptive"},
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


# ── Grounded answer generation (specs 09/10) ──────────────────────────────
# Builds the trustworthy answer body from the *ranked* knowledge chunks.
# Uses Claude when available, and degrades to a deterministic composition so
# the endpoint always returns a grounded, cited answer.
class _GroundedDraft(BaseModel):
    answer: str  # 1–4 sentence grounded answer; [n] cites the chunk indices
    steps: list[AnswerStep] = Field(default_factory=list)


GROUNDED_SYSTEM_PROMPT = """\
You are SIXsens, an enterprise knowledge copilot for SIX (Swiss financial-market \
infrastructure). You answer a compliance officer's question using ONLY the \
retrieved knowledge chunks provided, each labelled [n].

Rules:
  1. Ground every claim in the chunks and cite the supporting [n] indices. \
Never invent regulations, ISINs, thresholds, field names, or experts.
  2. If the chunks are thin or only partially cover the question, say so plainly \
in `answer` and give the best-supported partial guidance — never bluff.
  3. For a process / "how do I" question, fill `steps` with ordered, concrete \
actions, each citing the [n] it rests on. For a direct factual or "who" \
question, keep `steps` empty and put the answer in `answer`.
  4. Be concise and operational — this is a procedure, not an essay.

Output JSON: `answer` (the grounded prose, with [n] citations) and `steps` \
(ordered actions with `text` and `citations`, or empty)."""


def _generate_grounded(question: str, ranked: list[dict[str, Any]]) -> "_GroundedDraft":
    """Claude-synthesized grounded answer from ranked chunks. Raises on failure."""
    import anthropic

    context_lines = []
    for i, c in enumerate(ranked, start=1):
        label = f"{c.get('source_type', 'source')} · {c.get('title', '')}"
        context_lines.append(f"[{i}] ({label})\n{(c.get('content') or '').strip()}")
    context_block = "\n\n".join(context_lines)
    user_content = (
        f"QUESTION:\n{question}\n\nRETRIEVED KNOWLEDGE:\n{context_block}\n\n"
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
    """Deterministic fallback answer when no LLM is available."""
    if not ranked:
        return _GroundedDraft(
            answer="I couldn't find verified knowledge that matches this question. "
                   "The best next step is to ask the recommended expert below.",
            steps=[],
        )
    top = ranked[0]
    if display_format == "step_by_step":
        # Turn the top runbook-like chunk's sentences into ordered steps.
        sentences = [s.strip() for s in (top.get("content") or "").replace(";", ".").split(".")
                     if len(s.strip()) > 15][:6]
        # Each step cites the top chunk (index 1) it was derived from.
        steps = [AnswerStep(text=s, citations=[1]) for s in sentences]
        return _GroundedDraft(
            answer=f"Based on \"{top['title']}\" [1], here is the procedure:",
            steps=steps,
        )
    excerpt = " ".join((top.get("content") or "").split())[:280]
    return _GroundedDraft(
        answer=f"{excerpt} [1]",
        steps=[],
    )


def _choose_display_format(plan: dict[str, Any], escalate: bool) -> str:
    """Spec 10 §2 — pick how to present the answer."""
    intent = plan.get("detected_intent")
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
    """Build rich document-citation cards (spec 10 §4) carrying the fields the
    frontend needs for inline [n] citations and the doc viewer."""
    cards = []
    for i, c in enumerate(ranked, start=1):
        page = c.get("page")
        page_or_line = f"page {int(page) + 1}" if isinstance(page, int) else "line unavailable"
        excerpt = " ".join((c.get("content") or "").split())[:320]
        cards.append({
            "id": i,
            "index": i,
            "source_id": c.get("source_id"),
            "source_type": c.get("source_type"),
            "kind": c.get("kind"),
            "title": c.get("title"),
            "document": c.get("document"),
            "source_file": c.get("document"),
            "page": page,
            "page_or_line": page_or_line,
            "department": c.get("department"),
            "trust_level": c.get("trust_level"),
            "updated_at": c.get("updated_at"),
            "relevance_score": c.get("relevance_score"),
            "relevant_quote": excerpt,
            "content": c.get("content"),
            "matched_terms": c.get("matched_terms", []),
            "reason": c.get("reason"),
            "originating_request_id": c.get("originating_request_id"),
        })
    return cards


def _expert_citations(ranked: list[dict[str, Any]],
                      routed: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Experts owning the cited chunks + any routed experts, deduped (spec 10 §4)."""
    import knowledge_store as ks
    seen: dict[str, dict[str, Any]] = {}
    for r in routed:
        seen[r["id"]] = {**r, "id": r["id"]}
    for c in ranked:
        for eid in c.get("owner_expert_ids", []):
            if eid in seen or eid not in ks.EXPERTS_BY_ID:
                continue
            exp = ks.EXPERTS_BY_ID[eid]
            seen[eid] = {
                **exp,
                "reason": f"Owns the cited source \"{c.get('title')}\".",
            }
    return list(seen.values())


# ── Routes ───────────────────────────────────────────────────────────────
SOURCES_DIR = Path(__file__).parent / "SIX_Git_Sources"

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

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
    """Serve a 3-page window (page-1, page, page+1) around the cited page as a PDF."""
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
        start = max(0, page - 1)
        end = min(total - 1, page + 1)
        writer = PdfWriter()
        for p in range(start, end + 1):
            writer.add_page(reader.pages[p])
        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}_p{page}.pdf"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Page extraction failed: {exc}")


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
    if sources:
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
    """Compatibility route for the earlier React client shape."""
    return agent_answer(AskRequest(question=req.query))


# ── Knowledge & context engine routes (specs 09 / 10 / 11) ────────────────
@app.post("/api/answer", response_model=GroundedAnswerResponse)
def answer(req: AnswerRequest) -> GroundedAnswerResponse:
    """The trustworthy, source-backed answer pipeline.

    collect context → plan query → retrieve (corpus + structured) → rank →
    score confidence → detect escalation → compose answer → next-best-actions.

    Degrades gracefully: if the engine modules can't import, returns
    engine="unavailable" with a detail so the frontend falls back.
    """
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
    plan = ce.plan_query(req.question, context)
    chunks = ce.retrieve_knowledge(plan)
    ranked = ce.rank_chunks(chunks, plan, context, limit=6)

    confidence = esc.score_confidence(ranked, plan)
    esc_decision = esc.should_escalate(confidence, ranked, plan)
    escalate = esc_decision["escalate"]
    escalation_block = (
        esc.build_escalation(req.question, plan, ranked, context) if escalate else {}
    )
    routed_experts = escalation_block.get("experts", [])
    display_format = _choose_display_format(plan, escalate)

    # Compose the answer body — Claude if available, deterministic otherwise.
    engine = "grounded"
    detail = None
    if ranked:
        try:
            draft = _generate_grounded(req.question, ranked)
            engine = "rag"
        except Exception as exc:  # noqa: BLE001 — no key/SDK/API error
            draft = _compose_grounded(req.question, ranked, display_format)
            detail = f"LLM unavailable, deterministic compose: {exc}"
    else:
        draft = _compose_grounded(req.question, ranked, display_format)

    document_citations = _citations_from_chunks(ranked)
    expert_citations = _expert_citations(ranked, routed_experts)
    source_trace = [
        {"source_id": c.get("source_id"), "title": c.get("title"),
         "reason_used": c.get("reason")}
        for c in ranked
    ]
    next_actions = _build_next_actions(
        plan, ranked, document_citations, expert_citations, escalate, escalation_block
    )

    context_used = {
        "user_role": context.get("role"),
        "department": context.get("department"),
        "current_page": context.get("current_page"),
        "current_workflow": context.get("current_workflow"),
        "selected_text_used": bool(context.get("selected_text")),
        "target_domains": plan.get("target_domains", []),
        "retrieved_source_count": len(ranked),
    }
    escalation_out = None
    if escalate:
        escalation_out = {
            "needed": True,
            "reasons": esc_decision["reasons"],
            "recommendation": escalation_block.get("recommendation"),
            "experts": routed_experts,
            "request_draft": escalation_block.get("request_draft"),
        }

    return GroundedAnswerResponse(
        question=req.question,
        engine=engine,
        answer=draft.answer,
        display_format=display_format,
        steps=draft.steps,
        confidence=confidence["level"],
        confidence_reason=confidence["reason"],
        context_used=context_used,
        query_plan=plan,
        document_citations=document_citations,
        expert_citations=expert_citations,
        source_trace=source_trace,
        limitations=confidence["limitations"],
        next_best_actions=next_actions,
        escalation=escalation_out,
        detail=detail,
    )


def _build_next_actions(plan, ranked, doc_citations, expert_citations,
                        escalate, escalation_block) -> list[NextBestAction]:
    """Spec 10 §6 — actionable next steps tailored to the answer."""
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
        actions.append(NextBestAction(
            label="Send a knowledge request", type="create_knowledge_request",
        ))
    # A domain-aware follow-up.
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


@app.get("/api/experts")
def list_experts() -> dict[str, Any]:
    import knowledge_store as ks
    return {"experts": ks.EXPERTS}


@app.get("/api/knowledge")
def list_knowledge() -> dict[str, Any]:
    """All structured knowledge, including resolutions persisted via the loop."""
    import knowledge_store as ks
    return {
        "seed": ks.SEED_KNOWLEDGE,
        "persisted": ks.load_persisted_knowledge(),
    }


@app.get("/api/knowledge-requests")
def list_knowledge_requests() -> dict[str, Any]:
    import knowledge_store as ks
    return {"requests": ks.load_requests()}


@app.post("/api/knowledge-requests")
def create_knowledge_request(payload: KnowledgeRequestPayload) -> dict[str, Any]:
    import knowledge_store as ks
    request = ks.create_knowledge_request(payload.model_dump())
    return {"request": request}


@app.post("/api/knowledge-requests/{request_id}/resolve")
def resolve_knowledge_request(request_id: str, payload: ResolutionPayload) -> dict[str, Any]:
    """Log an expert resolution and persist it as reusable knowledge (spec 11)."""
    import knowledge_store as ks
    try:
        result = ks.resolve_request(request_id, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
