from pathlib import Path

from langchain_community.document_loaders import Docx2txtLoader, PyPDFLoader

try:
    from langchain_chroma import Chroma
except ImportError:
    from langchain_community.vectorstores import Chroma

try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    from langchain_community.embeddings import HuggingFaceEmbeddings

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    from langchain.text_splitter import RecursiveCharacterTextSplitter


EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_MODEL_KWARGS = {"local_files_only": False}
CHROMA_DB_DIR = str(Path(__file__).resolve().parent / "chroma_db")


def load_documents(source_dir):
    """Load PDF and DOCX files from source_dir with source-type metadata."""
    source_path = Path(source_dir)
    documents = []

    for file_path in source_path.iterdir():
        if not file_path.is_file():
            continue

        suffix = file_path.suffix.lower()
        if suffix == ".pdf":
            loader = PyPDFLoader(str(file_path))
            source_type = "explicit_rulebook"
        elif suffix == ".docx":
            loader = Docx2txtLoader(str(file_path))
            source_type = "tacit_expert_knowledge"
        else:
            continue

        loaded_documents = loader.load()
        for document in loaded_documents:
            document.metadata["source_type"] = source_type

        documents.extend(loaded_documents)

    return documents


def build_vector_store(documents):
    """Chunk documents, embed them locally, and persist a Chroma vector store."""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )
    chunks = text_splitter.split_documents(documents)
    for chunk in chunks:
        page = chunk.metadata.get("page")
        if page is not None:
            chunk.metadata["page_number"] = int(page) + 1
        chunk.metadata["exact_snippet"] = " ".join(chunk.page_content.split())[:500]

    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL_NAME,
        model_kwargs=EMBEDDING_MODEL_KWARGS,
    )
    vector_store = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=CHROMA_DB_DIR,
    )

    if hasattr(vector_store, "persist"):
        vector_store.persist()

    return vector_store


if __name__ == "__main__":
    loaded_docs = load_documents(Path(__file__).resolve().parent / "SIX_Git_Sources")
    build_vector_store(loaded_docs)
    print(f"ChromaDB vector store saved successfully to {CHROMA_DB_DIR}.")
