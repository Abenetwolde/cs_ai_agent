import hashlib
import os
import re
import threading
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'), override=True)
KB_DIR = Path(__file__).parent / 'data' / 'kb'
PROJECT_ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME', str(PROJECT_ROOT / '.data' / 'hf_cache'))
PERSIST_DIR = Path(os.getenv('CHROMA_PERSIST_DIR', PROJECT_ROOT / 'chroma_db'))
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
MIN_RELEVANCE = float(os.getenv('RAG_MIN_RELEVANCE', '0.24'))
_store = None
_store_lock = threading.RLock()


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


def _documents(paths: Iterable[Path], source_names: dict[Path, str] | None = None):
    from langchain_core.documents import Document
    documents, ids = [], []
    for path in paths:
        if path.suffix.lower() not in {'.md', '.txt'}:
            continue
        content = path.read_text(encoding='utf-8')
        source = (source_names or {}).get(path, path.name)
        for index, chunk in enumerate(chunks(content)):
            # Stable across content edits: Chroma upserts this slot when the file changes.
            digest = hashlib.sha256(f'addis-customer-support:{source}:{index}'.encode()).hexdigest()
            documents.append(Document(page_content=chunk, metadata={'source': source, 'chunk': index}))
            ids.append(digest)
    return documents, ids


def get_store():
    global _store
    with _store_lock:
        if _store is None:
            from langchain_chroma import Chroma
            from langchain_huggingface import HuggingFaceEmbeddings
            embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL, model_kwargs={'device': 'cpu'}, encode_kwargs={'normalize_embeddings': True})
            _store = Chroma(collection_name='addis_customer_support', persist_directory=str(PERSIST_DIR), embedding_function=embeddings)
        return _store


def ingest_paths(paths: Iterable[Path], source_names: dict[Path, str] | None = None) -> int:
    total = 0
    with _store_lock:
        store = get_store()
        for path in paths:
            if path.suffix.lower() not in {'.md', '.txt'}:
                continue
            source = (source_names or {}).get(path, path.name)
            docs, ids = _documents([path], source_names)
            # Upsert deterministic IDs first. If embedding fails, old vectors remain intact.
            if docs:
                store.add_documents(docs, ids=ids)
                total += len(docs)
            existing = store._collection.get(where={'source': source}, include=['metadatas'])
            stale = sorted(set(existing.get('ids') or []) - set(ids))
            if stale:
                store.delete(ids=stale)
    return total


def delete_source(source: str) -> None:
    with _store_lock:
        store = get_store()
        existing = store._collection.get(where={'source': source}, include=['metadatas'])
        ids = existing.get('ids') or []
        if ids:
            store.delete(ids=ids)


def ingest_directory(directory: Path = KB_DIR) -> int:
    return ingest_paths(sorted(directory.glob('*')))


def _lexical_rerank(query: str, entries: list[dict]) -> list[dict]:
    terms = {term for term in re.findall(r'[\w-]{3,}', query.casefold())}
    if not terms:
        return entries
    for entry in entries:
        text_terms = set(re.findall(r'[\w-]{3,}', entry['text'].casefold()))
        coverage = len(terms & text_terms) / len(terms)
        entry['_rank'] = 0.78 * entry['relevance'] + 0.22 * coverage
    entries.sort(key=lambda row: row['_rank'], reverse=True)
    for entry in entries:
        entry.pop('_rank', None)
    return entries


def retrieve(query: str, k: int = 4) -> list[dict]:
    try:
        candidates = get_store().similarity_search_with_relevance_scores(query, k=max(k * 3, 12))
        entries = [
            {'text': doc.page_content, 'source': doc.metadata.get('source', 'Company knowledge'), 'relevance': float(score)}
            for doc, score in candidates if float(score) >= MIN_RELEVANCE
        ]
        if entries:
            return _lexical_rerank(query, entries)[:k]
    except Exception:
        # Use local lexical retrieval during first startup or when embeddings are unavailable.
        pass
    terms = set(re.findall(r'[\w-]{3,}', query.casefold()))
    matches = []
    for path in KB_DIR.glob('*'):
        if path.suffix.lower() not in {'.md', '.txt'}:
            continue
        for chunk in chunks(path.read_text(encoding='utf-8')):
            lowered = chunk.casefold()
            score = sum(1 for term in terms if term in lowered)
            # Avoid returning a chunk on one incidental word match.
            if score >= max(2, round(len(terms) * 0.16)):
                matches.append({'text': chunk, 'source': path.name, 'relevance': score / max(1, len(terms))})
    matches.sort(key=lambda item: item['relevance'], reverse=True)
    return matches[:k]
