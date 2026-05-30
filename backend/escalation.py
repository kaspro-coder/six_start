"""
SIXsens escalation & confidence logic (specs 10 + 11).

Given the ranked knowledge chunks for a query, decide:
  • confidence — high / medium / low, with a human-readable reason and the
    concrete limitations behind it (spec 10 §5).
  • escalation — whether this should be routed to an expert, why, and a
    pre-filled knowledge-request draft + ranked experts (spec 11 §1-3).

All deterministic; reuses knowledge_store.route_experts for routing.
"""

from __future__ import annotations

from typing import Any

import knowledge_store as ks

# A chunk needs at least this score to count as "solid" support.
SOLID_SCORE = 4.0
STRICT_CONFIDENCE_THRESHOLD = 0.60


def score_confidence(
    ranked: list[dict[str, Any]],
    plan: dict[str, Any],
) -> dict[str, Any]:
    """Return {level, reason, limitations} from the ranked support set."""
    verified = [c for c in ranked if c.get("trust_level") == "verified"]
    stale = [c for c in ranked if c.get("trust_level") == "stale"]
    draft = [c for c in ranked if c.get("trust_level") == "draft"]
    solid = [c for c in ranked if c.get("relevance_score", 0) >= SOLID_SCORE]
    top = ranked[0]["relevance_score"] if ranked else 0.0

    limitations: list[str] = []
    if not ranked:
        limitations.append("No knowledge source matched this question.")
    if stale:
        limitations.append(
            f"The closest historic source is stale: \"{stale[0]['title']}\" — "
            "confirm it is still current."
        )
    if draft:
        limitations.append(
            f"{len(draft)} supporting source(s) are draft (not yet verified)."
        )
    if plan.get("detected_intent") == "unknown":
        limitations.append("The intent of the question was ambiguous.")
    if ranked and not verified:
        limitations.append("No verified source directly backs this answer.")

    # Decide the level.
    score_pct = _confidence_score_pct(ranked, verified, solid)

    if score_pct < STRICT_CONFIDENCE_THRESHOLD:
        level = "low"
        reason = (
            "Below the 60% evidence threshold; no documented solution is "
            "strong enough to generate safely."
        )
    elif len(verified) >= 2 and len(solid) >= 1:
        level = "high"
        reason = (
            f"Backed by {len(verified)} verified sources"
            + (f" including \"{verified[0]['title']}\"" if verified else "")
            + "."
        )
    elif verified and top >= SOLID_SCORE:
        level = "medium"
        reason = "One verified source matches strongly"
        if stale:
            reason += ", but the most relevant historic note is stale"
        reason += "."
    elif ranked and top > 1.5:
        level = "medium" if verified else "low"
        reason = (
            "Related information found, "
            + ("but no verified source directly matches."
               if not verified else "with partial verified support.")
        )
    else:
        level = "low"
        reason = "No verified source directly matches this issue."

    return {
        "level": level,
        "reason": reason,
        "limitations": limitations,
        "score": round(score_pct, 3),
        "threshold": STRICT_CONFIDENCE_THRESHOLD,
        "below_threshold": score_pct < STRICT_CONFIDENCE_THRESHOLD,
    }


def _confidence_score_pct(
    ranked: list[dict[str, Any]],
    verified: list[dict[str, Any]],
    solid: list[dict[str, Any]],
) -> float:
    if not ranked:
        return 0.0

    top = max(0.0, float(ranked[0].get("relevance_score", 0.0)))
    top_component = min(top / 8.0, 1.0) * 0.45
    verified_component = min(len(verified) / 2.0, 1.0) * 0.35
    solid_component = min(len(solid) / 2.0, 1.0) * 0.20
    stale_penalty = 0.15 if ranked[0].get("trust_level") == "stale" else 0.0
    return max(0.0, min(1.0, top_component + verified_component + solid_component - stale_penalty))


def should_escalate(
    confidence: dict[str, Any],
    ranked: list[dict[str, Any]],
    plan: dict[str, Any],
) -> dict[str, Any]:
    """Decide whether to route to an expert, and explain why."""
    reasons: list[str] = []
    intent = plan.get("detected_intent")
    low = plan.get("original_query", "").lower()

    if confidence["level"] == "low":
        reasons.append("the assistant has low confidence in a grounded answer")
    if confidence.get("below_threshold"):
        reasons.append("evidence is below the hard 60% confidence threshold")
    if not any(c.get("trust_level") == "verified" for c in ranked):
        reasons.append("no verified source covers this")
    if ranked and all(c.get("trust_level") == "stale" for c in ranked[:2]):
        reasons.append("the top sources are stale")
    if intent in ("find_expert", "resolve_incident"):
        reasons.append("the question is about who to ask / a live incident")
    if any(p in low for p in ("who should i ask", "who do i ask", "can someone help",
                              "who can help", "new issue", "not documented")):
        reasons.append("the user explicitly asked for a person")
    if len(confidence.get("limitations", [])) >= 3:
        reasons.append("the answer carries too many limitations")

    return {"escalate": bool(reasons), "reasons": reasons}


def build_escalation(
    query: str,
    plan: dict[str, Any],
    ranked: list[dict[str, Any]],
    context: dict[str, Any],
) -> dict[str, Any]:
    """Assemble the escalation block: ranked experts + a request draft."""
    related_ids = [c["source_id"] for c in ranked]
    experts = ks.route_experts(
        query,
        domains=plan.get("target_domains", []),
        related_source_ids=related_ids,
        limit=3,
    )

    top_expert = experts[0] if experts else None
    context_summary = _context_summary(context, ranked)
    draft = {
        "title": _auto_title(query, plan),
        "question": query,
        "context_summary": context_summary,
        "requester_user_id": context.get("user_id", "anonymous"),
        "routed_expert_ids": [top_expert["id"]] if top_expert else [],
        "domain_tags": plan.get("target_domains", []),
        "related_source_ids": related_ids,
        "priority": "high" if plan.get("detected_intent") == "resolve_incident"
        else "medium",
    }

    message = None
    if top_expert:
        message = (
            f"This looks like a new or insufficiently documented issue. "
            f"I recommend sending it to {top_expert['expert_name']}, "
            f"{top_expert['role_title']} — {top_expert['reason']}"
        )

    return {
        "experts": experts,
        "request_draft": draft,
        "recommendation": message,
    }


def _auto_title(query: str, plan: dict[str, Any]) -> str:
    domains = plan.get("target_domains", [])
    prefix = {
        "esg_sfdr": "SFDR/ESG", "fatca_tax": "FATCA", "mifid": "MiFID",
        "master_data": "Master Data", "settlement": "Settlement",
    }
    tag = prefix.get(domains[0], "Compliance") if domains else "Compliance"
    snippet = query.strip().rstrip("?.")
    if len(snippet) > 70:
        snippet = snippet[:67] + "…"
    return f"{tag}: {snippet}"


def _context_summary(context: dict[str, Any], ranked: list[dict[str, Any]]) -> str:
    parts = [
        f"Asked by a {context.get('role', 'user')} in {context.get('department', 'SIX')}."
    ]
    if context.get("current_workflow"):
        parts.append(f"Working in: {context['current_workflow']}.")
    if ranked:
        parts.append(
            f"Closest sources found: "
            + "; ".join(c["title"] for c in ranked[:2]) + "."
        )
    else:
        parts.append("No close sources were found in the knowledge base.")
    return " ".join(parts)
