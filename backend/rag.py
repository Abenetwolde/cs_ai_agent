import hashlib
import os
import re
from pathlib import Path
from typing import Iterable
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'), override=True)
KB_DIR = Path(__file__).parent / 'data' / 'kb'
PROJECT_ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME', str(PROJECT_ROOT / '.data' / 'hf_cache'))
PERSIST_DIR = Path(os.getenv('CHROMA_PERSIST_DIR', PROJECT_ROOT / 'chroma_db'))
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
_store = None


def chunks(text: str, size: int = 1100, overlap: int = 120) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    result = []
    current = ''
    for paragraph in paragraphs:
        if len(paragraph) <= size and len(current) + len(paragraph) + 2 <= size:
            current = f'{current}\n\n{paragraph}'.strip()
            continue
        if current:
            result.append(current)
        if len(paragraph) <= size:
            current = paragraph
        else:
            start = 0
            while start < len(paragraph):
                result.append(paragraph[start:start + size])
                start += size - overlap
            current = ''
    if current:
        result.append(current)
    return result


def _documents(paths: Iterable[Path]):
    from langchain_core.documents import Document
    documents, ids = [], []
    for path in paths:
        if path.suffix.lower() not in {'.md', '.txt'}:
            continue
        content = path.read_text(encoding='utf-8')
        for index, chunk in enumerate(chunks(content)):
            digest = hashlib.sha256(f'{path.name}:{index}:{chunk}'.encode()).hexdigest()
            documents.append(Document(page_content=chunk, metadata={'source': path.name, 'chunk': index}))
            ids.append(digest)
    return documents, ids


def get_store():
    global _store
    if _store is None:
        from langchain_chroma import Chroma
        from langchain_huggingface import HuggingFaceEmbeddings
        embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL, model_kwargs={'device': 'cpu'}, encode_kwargs={'normalize_embeddings': True})
        _store = Chroma(collection_name='addis_customer_support', persist_directory=str(PERSIST_DIR), embedding_function=embeddings)
    return _store


def ingest_paths(paths: Iterable[Path]) -> int:
    docs, ids = _documents(paths)
    if not docs:
        return 0
    store = get_store()
    store.add_documents(docs, ids=ids)
    return len(docs)


def ingest_directory(directory: Path = KB_DIR) -> int:
    return ingest_paths(directory.glob('*'))


def retrieve(query: str, k: int = 4) -> list[dict]:
    try:
        docs = get_store().similarity_search(query, k=k)
        if docs:
            return [{'text': doc.page_content, 'source': doc.metadata.get('source', 'Company knowledge')} for doc in docs]
    except Exception:
        # First startup or offline embedding model: use local lexical retrieval until ingestion succeeds.
        pass
    terms = set(re.findall(r'[\w-]{3,}', query.lower()))
    matches = []
    for path in KB_DIR.glob('*'):
        if path.suffix.lower() not in {'.md', '.txt'}:
            continue
        for chunk in chunks(path.read_text(encoding='utf-8')):
            lowered = chunk.lower()
            score = sum(1 for term in terms if term in lowered)
            if score:
                matches.append((score, {'text': chunk, 'source': path.name}))
    matches.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in matches[:k]]
