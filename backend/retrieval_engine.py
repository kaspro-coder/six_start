try:
    from langchain_chroma import Chroma
except ImportError:
    from langchain_community.vectorstores import Chroma

try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    from langchain_community.embeddings import HuggingFaceEmbeddings


EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_MODEL_KWARGS = {"local_files_only": True}
CHROMA_DB_DIR = "./chroma_db"


def _load_vector_store():
    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL_NAME,
        model_kwargs=EMBEDDING_MODEL_KWARGS,
    )
    return Chroma(
        persist_directory=CHROMA_DB_DIR,
        embedding_function=embeddings,
    )


def query_sixth_sense(user_query):
    """Retrieve official rules and expert workflow context for a query."""
    vector_store = _load_vector_store()

    official_rules = vector_store.similarity_search(
        user_query,
        k=2,
        filter={"source_type": "explicit_rulebook"},
    )
    expert_workflow_context = vector_store.similarity_search(
        user_query,
        k=2,
        filter={"source_type": "tacit_expert_knowledge"},
    )

    return {
        "official_rules": official_rules,
        "expert_workflow_context": expert_workflow_context,
    }
