"""
SIXsens structured knowledge store (specs 09 + 11).

The Chroma vector store (data_ingestion.py / retrieval_engine.py) holds the raw
regulatory corpus. This module adds the *structured* knowledge layer the
Knowledge Copilot reasons over:

  • EXPERTS        — responsible SMEs with expertise tags, departments, a
                     knowledge score and a "best for" line, used for routing.
  • KNOWLEDGE      — typed sources (runbook / policy / expert_note /
                     resolved_question / incident) with trust levels,
                     freshness and owner experts, searched alongside the corpus.
  • PERSISTED      — expert resolutions logged through the escalation loop
                     (spec 11). Stored as JSON on disk so a resolution becomes
                     immediately retrievable and citable by future questions,
                     and survives a backend restart. This is where a real
                     database would slot in.

Everything here is deterministic mock data + simple keyword scoring — no LLM is
required — so the engine degrades gracefully and is demo-stable.
"""

from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data"
REQUESTS_FILE = DATA_DIR / "knowledge_requests.json"
PERSISTED_FILE = DATA_DIR / "persisted_knowledge.json"

# A coarse domain taxonomy used by the planner, ranker and router. Keys are the
# canonical domain ids; values are the surface terms that map a query/source to
# that domain.
DOMAIN_TERMS: dict[str, list[str]] = {
    "esg_sfdr": ["sfdr", "esg", "article 8", "article 9", "article 6", "pai",
                 "principal adverse", "sustainab", "taxonomy", "ghg"],
    "fatca_tax": ["fatca", "tax", "withholding", "us person", "irs", "chapter 4",
                  "crs", "qi"],
    "mifid": ["mifid", "mifir", "product governance", "target market",
              "complex instrument", "structured deposit", "transaction report"],
    "master_data": ["master data", "onboarding", "instrument coverage", "isin",
                    "reference data", "mutation", "opening", "extension",
                    "attribute"],
    "settlement": ["settlement", "swift", "post-trade", "reconciliation",
                   "exception", "incident", "retry", "failed trade"],
}

_lock = threading.Lock()


# ── Time helpers ───────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _days_since(iso: str | None) -> float:
    if not iso:
        return 9999.0
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0)
    except (ValueError, TypeError):
        return 9999.0


# ── Experts (responsible SMEs) ───────────────────────────────────────────────
EXPERTS: list[dict[str, Any]] = [
    {
        "id": "exp_walter_meier",
        "expert_name": "Walter Meier",
        "role_title": "Senior Reference Data SME",
        "department": "Master Data Operations",
        "email": "walter.meier@six-group.example",
        "domains": ["master_data", "mifid"],
        "expertise_tags": ["instrument coverage", "onboarding", "isin",
                            "master data opening", "extension assessment"],
        "knowledge_score": 0.94,
        "resolved_count": 37,
        "status": "available",
        "best_for": "Instrument coverage, onboarding & extension assessments, "
                    "master-data opening workflow.",
    },
    {
        "id": "exp_jacob_keller",
        "expert_name": "Jacob Keller",
        "role_title": "ESG & SFDR Workflow Expert",
        "department": "Regulatory Data Services",
        "email": "jacob.keller@six-group.example",
        "domains": ["esg_sfdr", "master_data"],
        "expertise_tags": ["sfdr", "esg sub-classification", "pai indicators",
                            "article 8", "article 9", "regulatory based"],
        "knowledge_score": 0.91,
        "resolved_count": 24,
        "status": "available",
        "best_for": "SFDR Article 6/8/9 classification, ESG sub-classification, "
                    "PAI indicator verification.",
    },
    {
        "id": "exp_anna_keller",
        "expert_name": "Anna Keller",
        "role_title": "Post-Trade Operations Lead",
        "department": "Market Operations",
        "email": "anna.keller@six-group.example",
        "domains": ["settlement"],
        "expertise_tags": ["swift", "settlement exception", "reconciliation",
                            "post-trade", "retry window", "incident handling"],
        "knowledge_score": 0.89,
        "resolved_count": 31,
        "status": "available",
        "best_for": "SWIFT settlement exceptions, post-trade incident handling, "
                    "reconciliation failures.",
    },
    {
        "id": "exp_sophie_brand",
        "expert_name": "Sophie Brand",
        "role_title": "Tax Reporting Specialist",
        "department": "Regulatory Data Services",
        "email": "sophie.brand@six-group.example",
        "domains": ["fatca_tax"],
        "expertise_tags": ["fatca", "withholding", "us person", "tax navigator",
                            "chapter 4", "qi"],
        "knowledge_score": 0.87,
        "resolved_count": 19,
        "status": "busy",
        "best_for": "FATCA scope & reporting obligations, withholding and "
                    "US-person determination.",
    },
]

EXPERTS_BY_ID = {e["id"]: e for e in EXPERTS}


# ── Seed structured knowledge sources ────────────────────────────────────────
# type ∈ document | expert_note | resolved_question | policy | runbook | incident
SEED_KNOWLEDGE: list[dict[str, Any]] = [
    {
        "id": "kn_sfdr_runbook",
        "type": "runbook",
        "title": "SFDR Article 8/9 classification runbook",
        "department": "Regulatory Data Services",
        "owner_expert_ids": ["exp_jacob_keller"],
        "domains": ["esg_sfdr"],
        "tags": ["sfdr", "article 8", "article 9", "pai", "regulatory based",
                 "esg", "classification"],
        "content": (
            "To classify a fund under SFDR: confirm the ISIN resolves, open the "
            "ESG Data panel and read the SFDR classification (Article 6 / 8 / 9). "
            "Article 8 promotes environmental or social characteristics; Article 9 "
            "has sustainable investment as its objective. Always verify 'Regulatory "
            "Based' is set to Yes so the data originates from a regulated source, "
            "then confirm the Principal Adverse Impact (PAI) indicators are "
            "populated before sign-off."
        ),
        "trust_level": "verified",
        "updated_at": "2026-04-22T09:00:00+00:00",
        "source_file": "EU_SFDR_jc_2021_03_joint_esas_final_report_on_rts_under_sfdr.pdf",
    },
    {
        "id": "kn_pai_note",
        "type": "expert_note",
        "title": "Which PAI indicators must be populated before sign-off",
        "department": "Regulatory Data Services",
        "owner_expert_ids": ["exp_jacob_keller"],
        "domains": ["esg_sfdr"],
        "tags": ["pai", "principal adverse impact", "ghg", "sign-off", "esg"],
        "content": (
            "Before marking an ESG record Verified, the mandatory PAI indicators "
            "are: GHG emissions (Scopes 1-3), carbon footprint, GHG intensity of "
            "investee companies, exposure to fossil-fuel sector, and the share of "
            "non-renewable energy consumption. If any mandatory PAI is blank the "
            "record cannot be signed off and must be routed for a data extension."
        ),
        "trust_level": "verified",
        "updated_at": "2026-05-10T11:30:00+00:00",
        "source_file": None,
    },
    {
        "id": "kn_fatca_policy",
        "type": "policy",
        "title": "FATCA reporting scope for US instruments",
        "department": "Regulatory Data Services",
        "owner_expert_ids": ["exp_sophie_brand"],
        "domains": ["fatca_tax"],
        "tags": ["fatca", "us person", "withholding", "reportable", "chapter 4"],
        "content": (
            "A US-source instrument is in FATCA scope when held by a non-compliant "
            "foreign financial institution or a non-participating account. "
            "Determine the US-person status of the holder, set the withholding "
            "flag (chapter 4) and record the FATCA scope on the master-data "
            "record. Out-of-scope determinations still require a documented "
            "rationale on the instrument."
        ),
        "trust_level": "verified",
        "updated_at": "2026-03-15T08:00:00+00:00",
        "source_file": "US_six-factsheet-fatca-en.pdf",
    },
    {
        "id": "kn_master_data_onboarding",
        "type": "runbook",
        "title": "Master Data opening & instrument onboarding",
        "department": "Master Data Operations",
        "owner_expert_ids": ["exp_walter_meier"],
        "domains": ["master_data"],
        "tags": ["onboarding", "isin", "coverage", "master data opening",
                 "extension", "counterparty"],
        "content": (
            "Coverage of an instrument cannot be confirmed without an ISIN. Open "
            "the Master Data Opening screen, search the counterparty, enter the "
            "ISIN and confirm the security resolves. If the instrument is not "
            "covered natively or is missing required attributes (e.g. SFDR PAI "
            "properties), initiate an extension assessment via the Master Data "
            "automated framework rather than signing off manually."
        ),
        "trust_level": "verified",
        "updated_at": "2026-04-30T14:00:00+00:00",
        "source_file": "Confidential_SIX_master-data-openining-and-mutations-facsheet.pdf",
    },
    {
        "id": "kn_mifid_pg_resolved",
        "type": "resolved_question",
        "title": "Is a callable structured note a complex instrument under MiFID II?",
        "department": "Regulatory Data Services",
        "owner_expert_ids": ["exp_walter_meier"],
        "domains": ["mifid"],
        "tags": ["mifid", "complex instrument", "product governance",
                 "structured note", "target market"],
        "content": (
            "Yes. A callable structured note embeds a derivative and is therefore "
            "a complex instrument under MiFID II. It requires a defined target "
            "market and product-governance attributes before distribution. Flag it "
            "as complex on the reference-data record and ensure the target-market "
            "fields are populated."
        ),
        "trust_level": "verified",
        "updated_at": "2026-02-08T10:00:00+00:00",
        "source_file": "EU_MiFID_2015-1787_-_guidelines_on_complex_debt_instruments_and_structured_deposits.pdf",
    },
    {
        "id": "kn_swift_incident_stale",
        "type": "incident",
        "title": "SWIFT settlement exception — retry window (legacy note)",
        "department": "Market Operations",
        "owner_expert_ids": ["exp_anna_keller"],
        "domains": ["settlement"],
        "tags": ["swift", "settlement", "exception", "retry", "reconciliation",
                 "post-trade"],
        "content": (
            "Historic incident note: failed SWIFT settlements were retried after a "
            "fixed 2-hour window. NOTE: the retry policy has since changed and this "
            "record has not been re-verified — treat as background only and confirm "
            "the current window with Market Operations."
        ),
        "trust_level": "stale",
        "updated_at": "2024-09-01T10:00:00+00:00",
        "source_file": None,
    },
]


# ── Persistence ──────────────────────────────────────────────────────────────
def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _write_json(path: Path, value: Any) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")


def load_persisted_knowledge() -> list[dict[str, Any]]:
    """Expert resolutions that were logged and converted to reusable knowledge."""
    return _read_json(PERSISTED_FILE, [])


def all_knowledge_sources() -> list[dict[str, Any]]:
    """Seed sources + everything persisted through the escalation loop."""
    return [*SEED_KNOWLEDGE, *load_persisted_knowledge()]


def load_requests() -> list[dict[str, Any]]:
    return _read_json(REQUESTS_FILE, [])


# ── Domain detection ─────────────────────────────────────────────────────────
def detect_domains(text: str) -> list[str]:
    """Return the domain ids whose surface terms appear in `text`."""
    low = (text or "").lower()
    hits = [d for d, terms in DOMAIN_TERMS.items() if any(t in low for t in terms)]
    return hits


_WORD_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    return {w for w in _WORD_RE.findall((text or "").lower()) if len(w) > 2}


# ── Structured search (keyword + tag overlap) ────────────────────────────────
# Source-type priority — verified procedural knowledge ranks above raw docs.
TYPE_PRIORITY = {
    "runbook": 1.0,
    "policy": 0.95,
    "expert_resolution": 0.95,
    "resolved_question": 0.85,
    "expert_note": 0.8,
    "incident": 0.6,
    "document": 0.7,
}


def search_structured_knowledge(
    query: str,
    domains: list[str] | None = None,
    limit: int = 4,
) -> list[dict[str, Any]]:
    """Keyword/tag/domain search over the structured + persisted knowledge.

    Returns the raw source dicts that have any signal; ranking/scoring with
    trust and freshness happens in context_engine.rank_chunks so the logic
    lives in one place.
    """
    q_tokens = _tokens(query)
    target_domains = set(domains or detect_domains(query))
    scored: list[tuple[float, dict[str, Any]]] = []

    for src in all_knowledge_sources():
        tag_tokens = _tokens(" ".join(src.get("tags", [])))
        title_tokens = _tokens(src.get("title", ""))
        content_tokens = _tokens(src.get("content", ""))

        overlap = (
            2.0 * len(q_tokens & tag_tokens)
            + 1.5 * len(q_tokens & title_tokens)
            + 1.0 * len(q_tokens & content_tokens)
        )
        domain_hit = bool(target_domains & set(src.get("domains", [])))
        if overlap == 0 and not domain_hit:
            continue
        scored.append((overlap + (2.0 if domain_hit else 0.0), src))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [src for _score, src in scored[:limit]]


# ── Expert routing ───────────────────────────────────────────────────────────
def route_experts(
    query: str,
    domains: list[str] | None = None,
    related_source_ids: list[str] | None = None,
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Rank experts for a query and return each with an explainable reason.

    Routing signals (spec 11): expertise-tag overlap, domain match, ownership of
    related sources, knowledge score and availability.
    """
    q_tokens = _tokens(query)
    target_domains = set(domains or detect_domains(query))
    related_ids = set(related_source_ids or [])

    # Which experts own any of the related sources we already retrieved.
    owning_experts: set[str] = set()
    for src in all_knowledge_sources():
        if src["id"] in related_ids:
            owning_experts.update(src.get("owner_expert_ids", []))

    ranked: list[dict[str, Any]] = []
    for exp in EXPERTS:
        tag_tokens = _tokens(" ".join(exp.get("expertise_tags", [])))
        tag_overlap = len(q_tokens & tag_tokens)
        domain_overlap = len(target_domains & set(exp.get("domains", [])))
        owns_related = exp["id"] in owning_experts

        score = (
            2.0 * tag_overlap
            + 3.0 * domain_overlap
            + (4.0 if owns_related else 0.0)
            + exp.get("knowledge_score", 0.0)
            + (0.3 if exp.get("status") == "available" else 0.0)
        )
        if score <= exp.get("knowledge_score", 0.0):
            # No real topical signal — skip unless nothing else matches.
            continue

        reason_bits = []
        if owns_related:
            reason_bits.append("owns the most relevant retrieved source")
        if domain_overlap:
            reason_bits.append(
                f"specializes in {', '.join(sorted(target_domains & set(exp['domains'])))}"
            )
        if tag_overlap:
            matched = sorted(q_tokens & tag_tokens)[:3]
            if matched:
                reason_bits.append("matched on " + ", ".join(matched))
        reason_bits.append(
            f"resolved {exp.get('resolved_count', 0)} related questions"
        )
        ranked.append(
            {
                **exp,
                "match_score": round(score, 3),
                "reason": _capitalize(
                    "; ".join(reason_bits) + "."
                ),
            }
        )

    ranked.sort(key=lambda e: e["match_score"], reverse=True)
    if not ranked:
        # Fall back to the highest-scoring expert overall so the user is never
        # left without someone to talk to.
        best = max(EXPERTS, key=lambda e: e.get("knowledge_score", 0.0))
        ranked = [
            {
                **best,
                "match_score": round(best.get("knowledge_score", 0.0), 3),
                "reason": "Closest available SME by knowledge score; no exact "
                          "domain match for this query.",
            }
        ]
    return ranked[:limit]


def _capitalize(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


# ── Knowledge requests (spec 11) ─────────────────────────────────────────────
def create_knowledge_request(payload: dict[str, Any]) -> dict[str, Any]:
    """Persist a structured knowledge request from the assistant escalation."""
    now = _now_iso()
    request = {
        "id": f"kr_{uuid.uuid4().hex[:8]}",
        "title": payload.get("title") or "Knowledge request",
        "question": payload.get("question", ""),
        "context_summary": payload.get("context_summary", ""),
        "requester_user_id": payload.get("requester_user_id", "anonymous"),
        "routed_expert_ids": payload.get("routed_expert_ids", []),
        "domain_tags": payload.get("domain_tags", []),
        "related_source_ids": payload.get("related_source_ids", []),
        "priority": payload.get("priority", "medium"),
        "notes": payload.get("notes", ""),
        "status": "open",
        "created_at": now,
        "updated_at": now,
        "resolution": None,
    }
    with _lock:
        requests = load_requests()
        requests.insert(0, request)
        _write_json(REQUESTS_FILE, requests)
    return request


def resolve_request(request_id: str, resolution: dict[str, Any]) -> dict[str, Any]:
    """Log an expert resolution and convert it into a PersistedKnowledgeItem.

    Returns {request, knowledge_item}. The new knowledge item is immediately
    visible to all_knowledge_sources(), so future retrieval can cite it.
    """
    now = _now_iso()
    with _lock:
        requests = load_requests()
        idx = next((i for i, r in enumerate(requests) if r["id"] == request_id), None)
        if idx is None:
            raise KeyError(f"Unknown knowledge request: {request_id}")
        request = requests[idx]
        expert_id = resolution.get("expert_id") or (
            request["routed_expert_ids"][0] if request["routed_expert_ids"] else None
        )
        expert = EXPERTS_BY_ID.get(expert_id, {})
        make_reusable = resolution.get("make_reusable", True)

        resolution_record = {
            "id": f"res_{uuid.uuid4().hex[:8]}",
            "request_id": request_id,
            "expert_id": expert_id,
            "summary_answer": resolution.get("summary_answer", ""),
            "detailed_resolution": resolution.get("detailed_resolution", ""),
            "steps_taken": resolution.get("steps_taken", []),
            "related_documents": resolution.get("related_documents", []),
            "new_tags": resolution.get("new_tags", []),
            "confidence": resolution.get("confidence", "medium"),
            "reusable_knowledge_title": resolution.get("reusable_knowledge_title")
            or request["title"],
            "created_at": now,
        }

        request["status"] = "converted_to_knowledge" if make_reusable else "resolved"
        request["updated_at"] = now
        request["resolution"] = resolution_record
        requests[idx] = request
        _write_json(REQUESTS_FILE, requests)

        knowledge_item: dict[str, Any] | None = None
        if make_reusable:
            tags = list(
                dict.fromkeys(
                    [*request.get("domain_tags", []), *resolution_record["new_tags"]]
                )
            )
            body = resolution_record["detailed_resolution"] or resolution_record["summary_answer"]
            if resolution_record["steps_taken"]:
                body += "\n\nSteps taken:\n" + "\n".join(
                    f"- {s}" for s in resolution_record["steps_taken"]
                )
            knowledge_item = {
                "id": f"kn_{uuid.uuid4().hex[:8]}",
                "type": "expert_resolution",
                "title": resolution_record["reusable_knowledge_title"],
                "summary": resolution_record["summary_answer"],
                "content": body,
                "department": expert.get("department", "SIX"),
                "owner_expert_ids": [expert_id] if expert_id else [],
                "domains": list(
                    dict.fromkeys(
                        [
                            *detect_domains(request["question"]),
                            *detect_domains(body),
                            *request.get("domain_tags", []),
                        ]
                    )
                ),
                "tags": tags,
                "trust_level": "verified"
                if resolution_record["confidence"] == "high"
                else "draft",
                "updated_at": now,
                "created_at": now,
                "originating_request_id": request_id,
                "source_file": None,
            }
            persisted = load_persisted_knowledge()
            persisted.insert(0, knowledge_item)
            _write_json(PERSISTED_FILE, persisted)

    return {"request": request, "knowledge_item": knowledge_item}
