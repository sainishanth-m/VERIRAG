import hashlib
import os
from pathlib import Path
from typing import Any, List
from urllib.parse import urlsplit, urlunsplit

import numpy as np
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


class EmbeddingPipeline:
    """Stateless parent-child document chunker and optional Gemini API embedder."""

    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        parent_chunk_size: int = 2200,
        parent_chunk_overlap: int = 250,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.parent_chunk_size = parent_chunk_size
        self.parent_chunk_overlap = parent_chunk_overlap

    @staticmethod
    def canonical_source(source: str, source_type: str = "upload") -> str:
        value = str(source or "").strip()
        if source_type == "url":
            parts = urlsplit(value)
            host = (parts.hostname or "").lower()
            if parts.port:
                host = f"{host}:{parts.port}"
            return urlunsplit((parts.scheme.lower(), host, parts.path or "/", parts.query, ""))
        return value

    @classmethod
    def source_id_for(cls, source: str, source_type: str = "upload") -> str:
        canonical = cls.canonical_source(source, source_type)
        digest = hashlib.sha256(f"{source_type}\0{canonical}".encode("utf-8")).hexdigest()
        return f"src_{digest[:24]}"

    def chunk_documents(self, documents: List[Any]) -> List[Document]:
        parent_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.parent_chunk_size,
            chunk_overlap=self.parent_chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", " ", ""],
        )
        child_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        chunks: list[Document] = []
        for doc_index, doc in enumerate(documents):
            parent_texts = parent_splitter.split_text(str(getattr(doc, "page_content", "") or ""))
            if not parent_texts:
                continue

            base_metadata = dict(getattr(doc, "metadata", {}) or {})
            source = str(base_metadata.get("source", "unknown"))
            source_type = str(base_metadata.get("source_type", "upload")).lower()
            page = base_metadata.get("page", 0)
            source_id = str(base_metadata.get("source_id") or self.source_id_for(source, source_type))
            title = str(base_metadata.get("title") or Path(source).name or source)

            for parent_index, parent_text in enumerate(parent_texts):
                parent_id = f"{source_id}::p{page}::d{doc_index}::c{parent_index}"
                child_texts = child_splitter.split_text(parent_text)
                for child_index, child_text in enumerate(child_texts):
                    content = child_text.strip()
                    if not content:
                        continue
                    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
                    chunk_id = f"chk_{hashlib.sha256(f'{source_id}:{page}:{parent_index}:{child_index}:{content_hash}'.encode()).hexdigest()[:24]}"
                    metadata = dict(base_metadata)
                    metadata.update(
                        {
                            "chunk_id": chunk_id,
                            "source_id": source_id,
                            "source": source,
                            "source_type": source_type,
                            "title": title,
                            "parent_id": parent_id,
                            "parent_index": parent_index,
                            "child_index": child_index,
                            "parent_text": parent_text,
                        }
                    )
                    chunks.append(Document(page_content=content, metadata=metadata))

        return chunks

    def build_session_sources(self, documents: List[Any]) -> List[dict]:
        """Convert parsed documents into serializable source + chunk payloads for the browser session."""
        chunks = self.chunk_documents(documents)
        if not chunks:
            return []

        by_source: dict[str, dict] = {}
        for chunk in chunks:
            meta = dict(chunk.metadata or {})
            source_id = str(meta["source_id"])
            entry = by_source.setdefault(
                source_id,
                {
                    "source_id": source_id,
                    "key": source_id,
                    "source": str(meta.get("title") or meta.get("source") or "Document"),
                    "display_name": str(meta.get("title") or meta.get("source") or "Document"),
                    "type": str(meta.get("source_type") or "upload"),
                    "status": "indexed",
                    "pages": set(),
                    "chunk_count": 0,
                    "chunks": [],
                    "error": None,
                },
            )
            entry["pages"].add(str(meta.get("page", 0)))
            entry["chunk_count"] += 1
            entry["chunks"].append(
                {
                    "chunk_id": meta["chunk_id"],
                    "source_id": source_id,
                    "source": str(meta.get("source") or entry["display_name"]),
                    "title": str(meta.get("title") or entry["display_name"]),
                    "source_type": entry["type"],
                    "page": meta.get("page", 0),
                    "parent_id": meta.get("parent_id", ""),
                    "parent_text": meta.get("parent_text", ""),
                    "text": chunk.page_content,
                }
            )

        results = []
        for item in by_source.values():
            item["page_count"] = len(item.pop("pages"))
            results.append(item)
        return results


def embed_texts_gemini(texts: List[str], api_key: str | None = None, model: str | None = None) -> np.ndarray | None:
    """Compute normalized embeddings via Gemini API without loading local PyTorch weights."""
    key = api_key or os.getenv("GOOGLE_API_KEY")
    if not key or not texts:
        return None
    embed_model = model or os.getenv("GOOGLE_EMBEDDING_MODEL", "gemini-embedding-001")
    try:
        from google import genai

        client = genai.Client(api_key=key)
        vectors: list[list[float]] = []
        batch_size = 64
        for start in range(0, len(texts), batch_size):
            batch = [t[:4000] if t else " " for t in texts[start : start + batch_size]]
            resp = client.models.embed_content(model=embed_model, contents=batch)
            for emb in resp.embeddings:
                vectors.append(list(emb.values))
        arr = np.asarray(vectors, dtype=np.float32)
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return arr / norms
    except Exception as exc:
        print(f"[WARN] Gemini embedding fallback to BM25-only: {type(exc).__name__}: {exc}")
        return None
