import json
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from retrieval_engine import query_sixth_sense


load_dotenv()


llm = ChatAnthropic(
    model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    temperature=0,
    api_key=os.getenv("ANTHROPIC_API_KEY"),
)


def _format_documents(documents):
    return "\n\n".join(
        (
            f"Source: {document.metadata.get('source', 'unknown')}\n"
            f"Content:\n{document.page_content}"
        )
        for document in documents
    )


def _parse_json_response(response_text):
    cleaned_response = response_text.strip()
    if cleaned_response.startswith("```json"):
        cleaned_response = cleaned_response.removeprefix("```json").strip()
    if cleaned_response.startswith("```"):
        cleaned_response = cleaned_response.removeprefix("```").strip()
    if cleaned_response.endswith("```"):
        cleaned_response = cleaned_response.removesuffix("```").strip()

    return json.loads(cleaned_response)


def _default_expert_citations():
    return [
        {
            "id": 1,
            "expert_name": "Walter Meier",
            "department": "Master Data Operations",
            "role_title": "Senior Reference Data SME",
            "email": "walter.meier@six-group.example",
            "area_of_domain_expertise": "Instrument coverage and onboarding workflow",
        },
        {
            "id": 2,
            "expert_name": "Jacob Keller",
            "department": "Regulatory Data Services",
            "role_title": "ESG & SFDR Workflow Expert",
            "email": "jacob.keller@six-group.example",
            "area_of_domain_expertise": "Master Data - ESG Sub-classifications",
        },
    ]


def _document_citations_from_context(retrieved_context):
    citations = []
    documents = [
        *retrieved_context.get("official_rules", []),
        *retrieved_context.get("expert_workflow_context", []),
    ]

    for index, document in enumerate(documents, start=1):
        metadata = dict(getattr(document, "metadata", {}) or {})
        source = Path(str(metadata.get("source", "unknown"))).name
        page = metadata.get("page")
        if page is None:
            page_or_line = "line unavailable"
        else:
            page_or_line = f"page {int(page) + 1}"

        quote = " ".join(getattr(document, "page_content", "").split())
        citations.append(
            {
                "id": index,
                "source_file": source,
                "relevant_quote": quote[:320],
                "page_or_line": page_or_line,
            }
        )

    return citations


def _normalize_response(parsed, retrieved_context):
    default_form = {
        "instrument_id": None,
        "mifid_reportable": None,
        "sfdr_ghg_emissions": None,
        "fatca_scope": None,
    }

    return {
        "message": str(parsed.get("message", "")),
        "requires_bpo_action": bool(parsed.get("requires_bpo_action", False)),
        "bpo_draft_form": parsed.get("bpo_draft_form") or default_form,
        "document_citations": parsed.get("document_citations")
        or _document_citations_from_context(retrieved_context),
        "expert_citations": parsed.get("expert_citations")
        or _default_expert_citations(),
    }


def generate_sixth_sense_response(user_query: str) -> dict:
    retrieved_context = query_sixth_sense(user_query)
    official_rules = _format_documents(retrieved_context["official_rules"])
    expert_workflow_context = _format_documents(
        retrieved_context["expert_workflow_context"]
    )

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """You are SIXth Sense, the AI Compliance & Master Data co-pilot at SIX Financial Information. You merge explicit regulatory rules with tacit expert knowledge to guide employees.

Be concise and operational. The officer wants the answer and the next step, not a regulatory essay. No greetings or thanks, no restating the question, no legal citation numbers (e.g. "§1.1471-5"). Lead with the bottom line.

When answering queries, strictly adhere to these protocols:

Protocol 1 (Walter's Workflow): If a user inquires about asset classification, onboarding, or instrument coverage (such as ESG-linked structured products), you MUST explicitly verify if they provided an ISIN. If no ISIN is present, explain that coverage cannot be confirmed without it.

Protocol 2 (Action Routing): If an instrument is not covered natively or lacks attributes (like missing SFDR Principal Adverse Impact properties), set the action routing flag to true to initiate an extension assessment via the Master Data automated framework.

Protocol 3 (Output Schema): You must output your final answer in an unquoted, clean JSON block string. The JSON MUST strictly contain exactly these five top-level keys:
"message": "A concise answer in Walter's voice, formatted as 2-4 short bullet points. Each bullet starts with '- ', is one line (~12 words), and is self-contained. First bullet = the bottom line (covered / not confirmable without X / routing for extension); the rest = the key reason and the next action. Add citation brackets such as [1] only where the retrieved context supports that sentence.",
"requires_bpo_action": true or false (boolean),
"bpo_draft_form": {{"instrument_id": "the ISIN or null", "mifid_reportable": null, "sfdr_ghg_emissions": null, "fatca_scope": null}} (Fill fields with string placeholders or null based on user input),
"document_citations": [{{"id": 1, "source_file": "filename.pdf or filename.docx", "relevant_quote": "short exact or near-exact supporting excerpt", "page_or_line": "page 3 or line unavailable"}}],
"expert_citations": [{{"id": 1, "expert_name": "Walter Meier", "department": "Master Data Operations", "role_title": "Senior Reference Data SME", "email": "walter.meier@six-group.example"}}].

Do not include markdown fences, commentary, or extra keys.""",
            ),
            (
                "human",
                """User query:
{user_query}

Official rules context:
{official_rules}

Expert workflow context:
{expert_workflow_context}""",
            ),
        ]
    )

    chain = prompt | llm
    response = chain.invoke(
        {
            "user_query": user_query,
            "official_rules": official_rules,
            "expert_workflow_context": expert_workflow_context,
        }
    )

    parsed = _parse_json_response(response.content)
    return _normalize_response(parsed, retrieved_context)


if __name__ == "__main__":
    result = generate_sixth_sense_response(
        "How do we handle ESG-linked structured products?"
    )
    print(json.dumps(result, indent=2))
