"""
SIXsens knowledge & context engine (spec 09).

Pipeline, all deterministic (no LLM needed):

  collect_user_context → plan_query → retrieve_knowledge → rank_chunks

  • UserContext  — structured snapshot of who is asking and what they are
                   looking at (page, workflow, selected text, recent queries).
  • QueryPlan    — raw query → detected intent, rewritten query, target domains
                   and the context the answer should use.
  • Retrieval    — pulls from BOTH the Chroma corpus (retrieval_engine) and the
                   structured knowledge store, normalizing every hit into a
                   RetrievedKnowledgeChunk.
  • Ranking      — scores by keyword overlap, domain match, source-type
                   priority, trust level, freshness, expert ownership and
                   whether the source matches the user's current context — and
                   emits a human-readable `reason` for each chunk.

The architecture is intentionally RAG-ready: swap the keyword overlap for a
vector score and the rest of the pipeline is unchanged.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import knowledge_store as ks

# Intent → trigger terms. First match wins (order matters: specific first).
INTENT_RULES: list[tuple[str, list[str]]] = [
    ("find_expert", ["who should i ask", "who do i ask", "who owns", "who is responsible",
                     "contact", "expert", "who can help", "can someone help", "who knows"]),
    ("resolve_incident", ["incident", "exception", "failed", "broken", "stuck",
                          "not working", "error", "issue with"]),
    ("explain_process", ["how do i", "how do we", "how to", "steps", "process",
                         "procedure", "workflow", "walk me through"]),
    ("summarize_document", ["what does this", "summarize", "summary", "explain this",
                            "this document", "this page", "selected"]),
    ("answer_question", ["what is", "what are", "is a", "does", "can i", "should i",
                         "when", "why", "which"]),
]


# ── 1. Context collection ────────────────────────────────────────────────────
def collect_user_context(payload: dict[str, Any] | None) -> dict[str, Any]:
    """Build a structured UserContext, filling sensible defaults.

    Mirrors the spec's UserContext. The current page / selected text would, in
    a real overlay (Cluely-style), come from the active screen; here the client
    sends whatever it knows and we default the rest.
    """
    p = payload or {}
    page = p.get("current_page")
    context = {
        "user_id": p.get("user_id", "user_cosmina"),
        "role": p.get("role", "Junior Compliance Officer"),
        "department": p.get("department", "Regulatory Data Services"),
        "location": p.get("location", "Zurich"),
        "current_page": page,
        "current_workflow": p.get("current_workflow")
        or _workflow_from_page(page),
        "selected_text": p.get("selected_text"),
        "screen_context": p.get("screen_context"),
        "active_document_id": p.get("active_document_id"),
        "recent_queries": p.get("recent_queries", [])[:5],
    }
    # Domain the user currently sits in, inferred from page + workflow + selection.
    ctx_blob = " ".join(
        str(x) for x in (
            page,
            context["current_workflow"],
            context["selected_text"],
            context["screen_context"],
        )
        if x
    )
    context["context_domains"] = ks.detect_domains(ctx_blob)
    return context


def _workflow_from_page(page: str | None) -> str | None:
    if not page:
        return None
    low = page.lower()
    if "settlement" in low:
        return "Settlement exception handling"
    if "master-data" in low or "master_data" in low or "opening" in low:
        return "Master Data Opening"
    if "sfdr" in low or "esg" in low:
        return "ESG / SFDR verification"
    if "fatca" in low or "tax" in low:
        return "FATCA scope determination"
    return None


# ── 2. Query planning ────────────────────────────────────────────────────────
def plan_query(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """Transform a raw query into a structured QueryPlan."""
    low = (query or "").lower()
    intent = "unknown"
    for candidate, triggers in INTENT_RULES:
        if any(t in low for t in triggers):
            intent = candidate
            break

    query_domains = ks.detect_domains(query)
    domains = list(query_domains)
    ctx = context or {}
    # Pull in the user's current-context domains when the query itself is thin
    # (e.g. "what does this mean?" while on the SFDR page). These widen retrieval
    # but must NOT count as the question's own topic (see query_domains below).
    if ctx.get("context_domains"):
        domains = list(dict.fromkeys([*domains, *ctx["context_domains"]]))

    required_context: list[str] = []
    if intent == "summarize_document" or "this" in low:
        required_context += ["current_page", "selected_text", "active_document_id"]
    if intent == "find_expert":
        required_context += ["department"]
    required_context.append("role")

    # A light query rewrite: fold the current workflow in so retrieval has more
    # signal for context-dependent questions.
    rewritten = query.strip()
    if intent == "summarize_document" and ctx.get("current_workflow"):
        rewritten = f"{query.strip()} (context: {ctx['current_workflow']})"

    suggested_experts = ks.match_experts_for_query(
        query,
        intent=intent,
        domains=domains,
        limit=3,
    )

    return {
        "original_query": query,
        "rewritten_query": rewritten,
        "detected_intent": intent,
        "required_context": list(dict.fromkeys(required_context)),
        "target_domains": domains,
        "query_domains": list(query_domains),
        "suggested_experts": suggested_experts,
    }


# ── 3. Retrieval (corpus + structured store) ─────────────────────────────────
def _corpus_chunks(query: str) -> list[dict[str, Any]]:
    """Pull dual-context chunks from Chroma and normalize them.

    Imported lazily so the engine still runs (structured-only) when the vector
    store / embedding deps aren't available.
    """
    try:
        from retrieval_engine import query_sixth_sense
    except Exception:  # noqa: BLE001 — deps not installed
        return []
    try:
        results = query_sixth_sense(query)
    except Exception:  # noqa: BLE001 — store not built / model cache missing
        return []

    chunks: list[dict[str, Any]] = []
    pairs = (
        ("official_rulebook", results.get("official_rules", [])),
        ("tacit_expert_knowledge", results.get("expert_workflow_context", [])),
    )
    for source_type, docs in pairs:
        for d in docs:
            meta = dict(getattr(d, "metadata", {}) or {})
            doc_name = Path(str(meta.get("source", "?"))).name
            chunks.append(
                {
                    "source_id": doc_name,
                    "source_type": source_type,
                    "kind": "document",
                    "title": _doc_title(doc_name),
                    "content": getattr(d, "page_content", ""),
                    "page": meta.get("page"),
                    "department": "SIX",
                    "owner_expert_ids": [],
                    "tags": [],
                    "domains": ks.detect_domains(getattr(d, "page_content", "")),
                    "trust_level": "verified",
                    "updated_at": None,
                    "document": doc_name,
                }
            )
    return chunks


def _structured_chunks(query: str, domains: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for src in ks.search_structured_knowledge(query, domains=domains, limit=5):
        out.append(
            {
                "source_id": src["id"],
                "source_type": src["type"],
                "kind": "structured",
                "title": src["title"],
                "content": src["content"],
                "page": None,
                "department": src.get("department", "SIX"),
                "owner_expert_ids": src.get("owner_expert_ids", []),
                "tags": src.get("tags", []),
                "domains": src.get("domains", []),
                "trust_level": src.get("trust_level", "unknown"),
                "updated_at": src.get("updated_at"),
                "document": src.get("source_file"),
                "originating_request_id": src.get("originating_request_id"),
            }
        )
    return out


def retrieve_knowledge(plan: dict[str, Any]) -> list[dict[str, Any]]:
    """Search both the corpus and the structured store for a query plan."""
    query = plan["rewritten_query"]
    domains = plan.get("target_domains", [])
    return [*_corpus_chunks(query), *_structured_chunks(query, domains)]


# ── 4. Ranking (relevance + trust + context) ─────────────────────────────────
TRUST_WEIGHT = {"verified": 1.0, "draft": 0.4, "stale": -0.6, "unknown": 0.0}


def rank_chunks(
    chunks: list[dict[str, Any]],
    plan: dict[str, Any],
    context: dict[str, Any],
    limit: int = 6,
) -> list[dict[str, Any]]:
    """Score and explain every chunk, returning the top `limit`.

    Score = keyword overlap + domain match + source-type priority + trust +
    freshness + expert ownership + current-context match.
    """
    q_tokens = ks._tokens(plan["original_query"])
    target_domains = set(plan.get("target_domains", []))
    query_domains = set(plan.get("query_domains", plan.get("target_domains", [])))
    ctx_domains = set(context.get("context_domains", []))
    ctx_dept = context.get("department")

    ranked: list[dict[str, Any]] = []
    for c in chunks:
        content_tokens = ks._tokens(c.get("content", ""))
        title_tokens = ks._tokens(c.get("title", ""))
        tag_tokens = ks._tokens(" ".join(c.get("tags", [])))

        kw_title = len(q_tokens & title_tokens)
        kw_tag = len(q_tokens & tag_tokens)
        kw = (
            1.0 * len(q_tokens & content_tokens)
            + 1.5 * kw_title
            + 2.0 * kw_tag
        )
        matched_terms = sorted(
            q_tokens & (content_tokens | title_tokens | tag_tokens)
        )

        domain_hit = bool(target_domains & set(c.get("domains", [])))
        query_domain_hit = bool(query_domains & set(c.get("domains", [])))
        type_priority = ks.TYPE_PRIORITY.get(c.get("source_type"), 0.7)
        trust = TRUST_WEIGHT.get(c.get("trust_level", "unknown"), 0.0)

        days = ks._days_since(c.get("updated_at"))
        freshness = 0.0
        if c.get("updated_at"):
            freshness = 1.0 if days < 60 else (0.4 if days < 365 else -0.3)

        ownership = 1.0 if c.get("owner_expert_ids") else 0.0
        ctx_domain_hit = bool(ctx_domains & set(c.get("domains", [])))
        dept_hit = bool(ctx_dept and c.get("department") == ctx_dept)

        # Topical match to the *question only*, using high-precision signals:
        # title/tag overlap + the domain detected from the question. Raw content
        # overlap and *context* domains are deliberately excluded — large PDFs
        # share common words, and sitting on the Master Data screen must not make
        # Master Data chunks look on-topic for a settlement question.
        match_score = (
            1.5 * kw_title
            + 2.0 * kw_tag
            + (2.0 if query_domain_hit else 0.0)
        )

        # Overall ranking score keeps context breadth (merged domains + current
        # screen) so context-relevant sources still surface and rank well.
        score = (
            kw
            + (2.0 if domain_hit else 0.0)
            + 1.5 * type_priority
            + 1.5 * trust
            + freshness
            + 0.8 * ownership
            + (1.0 if ctx_domain_hit else 0.0)
            + (0.5 if dept_hit else 0.0)
        )

        ranked.append(
            {
                **c,
                "matched_terms": matched_terms,
                "relevance_score": round(score, 3),
                "match_score": round(match_score, 3),
                "reason": _explain(
                    c, matched_terms, domain_hit, trust, days,
                    bool(c.get("owner_expert_ids")), ctx_domain_hit,
                ),
            }
        )

    ranked.sort(key=lambda c: c["relevance_score"], reverse=True)
    # Drop chunks with no signal at all (negative or zero) unless we'd otherwise
    # return nothing.
    positive = [c for c in ranked if c["relevance_score"] > 0]
    return (positive or ranked)[:limit]


def _explain(
    chunk: dict[str, Any],
    matched: list[str],
    domain_hit: bool,
    trust: float,
    days: float,
    owned: bool,
    ctx_hit: bool,
) -> str:
    bits: list[str] = []
    if matched:
        bits.append("matched " + ", ".join(matched[:4]))
    if domain_hit:
        bits.append("on-domain")
    tl = chunk.get("trust_level")
    type_label = str(chunk.get("source_type", "source")).replace("_", " ")
    if tl == "verified":
        bits.append(f"verified {type_label}")
    elif tl == "stale":
        bits.append(f"⚠ stale {type_label}")
    elif tl == "draft":
        bits.append(f"draft {type_label}")
    else:
        bits.append(type_label)
    if owned and chunk.get("owner_expert_ids"):
        names = [
            ks.EXPERTS_BY_ID[e]["expert_name"]
            for e in chunk["owner_expert_ids"]
            if e in ks.EXPERTS_BY_ID
        ]
        if names:
            bits.append("owned by " + ", ".join(names))
    if chunk.get("updated_at") and days < 9000:
        bits.append(f"updated {int(days)}d ago")
    if ctx_hit:
        bits.append("matches your current context")
    return ks._capitalize("; ".join(bits) + ".")


def _doc_title(filename: str) -> str:
    stem = Path(filename).stem
    return stem.replace("_", " ").replace("-", " ").strip()
