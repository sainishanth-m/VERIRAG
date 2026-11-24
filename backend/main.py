"""
backend/main.py

Stateless FastAPI backend for VeriRag: in-memory document/URL parsing,
hybrid retrieval + Gemini generation, and optional SPA static serving.
"""

import json
import os
import re
import sys
import threading
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

_PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(_PROJECT_ROOT / ".env")
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from src.embedding import EmbeddingPipeline
from src.ingest import MAX_UPLOAD_BYTES, load_uploaded_file, load_url_content

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
_FRONTEND_DIST = _PROJECT_ROOT / "frontend" / "dist"
_HAS_FRONTEND_DIST = (_FRONTEND_DIST / "index.html").is_file()

app = FastAPI(
    title="VeriRag API",
    version="1.0.0",
    docs_url="/api/docs" if _HAS_FRONTEND_DIST else "/docs",
    redoc_url="/api/redoc" if _HAS_FRONTEND_DIST else "/redoc",
)

_allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:7860",
    "http://127.0.0.1:7860",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
if FRONTEND_URL and FRONTEND_URL not in _allowed_origins:
    _allowed_origins.append(FRONTEND_URL)

for _origin in os.getenv("CORS_ORIGINS", "").split(","):
    _clean = _origin.strip().rstrip("/")
    if _clean and _clean not in _allowed_origins:
        _allowed_origins.append(_clean)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_runtime_lock = threading.RLock()
_rag_search_instance = None
_chunker = EmbeddingPipeline()


def _get_rag():
    global _rag_search_instance
    with _runtime_lock:
        if _rag_search_instance is None:
            from src.search import RAGSearch
            _rag_search_instance = RAGSearch()
        return _rag_search_instance


def _sse_event(event_name: str, payload: dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False, allow_nan=False)}\n\n"


def _is_simple_greeting(value: str) -> bool:
    normalized = re.sub(r"[^a-z\s]", " ", str(value or "").lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized in {
        "hi", "hello", "hey", "hiya", "howdy", "good morning",
        "good afternoon", "good evening", "hi there", "hello there", "hey there",
    }


def _local_greeting_answer() -> str:
    return (
        "Hi! Upload a PDF, DOCX, TXT file, or public URL in Data Center, "
        "and ask me any question—I’ll answer with verifiable source citations."
    )


def _format_history_context(history: list[dict] | None) -> str | None:
    if not history:
        return None
    lines = []
    for item in history[-8:]:
        role = "User" if item.get("role") == "user" else "Assistant"
        text = str(item.get("text") or "").strip()
        if text:
            lines.append(f"{role}: {text[:1200]}")
    if not lines:
        return None
    return "Recent turns:\n" + "\n".join(lines)


class UrlIngestRequest(BaseModel):
    url: str


class QueryChunk(BaseModel):
    chunk_id: str | None = None
    source_id: str
    source: str
    title: str | None = None
    source_type: str | None = "upload"
    page: int | str | None = 0
    parent_id: str | None = None
    parent_text: str | None = None
    text: str


class QueryHistoryTurn(BaseModel):
    role: str
    text: str


class QueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=8000)
    top_k: int = Field(default=5, ge=1, le=20)
    thread_id: str | None = Field(default=None, max_length=160)
    request_id: str | None = Field(default=None, max_length=160)
    model: str | None = Field(default=None, min_length=1, max_length=160, pattern=r"^[A-Za-z0-9._:/-]+$")
    use_reranker: bool = True
    language: str | None = Field(default=None, max_length=32)
    source_ids: list[str] | None = Field(default=None, max_length=100)
    chunks: list[QueryChunk] = Field(default_factory=list, max_length=2500)
    available_sources: list[dict] | None = Field(default=None, max_length=100)
    history: list[QueryHistoryTurn] = Field(default_factory=list, max_length=20)
    initial_question: bool = False


class FeedbackRequest(BaseModel):
    rating: str | None = "neutral"
    feedback: str


api_router = APIRouter()


@api_router.post("/ingest/files", summary="Extract and chunk uploaded files in memory (no storage)")
def ingest_files(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="A maximum of 20 files can be uploaded at once.")

    allowed_mimes = {
        ".pdf": {"application/pdf"},
        ".txt": {"text/plain"},
        ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    }
    documents = []
    preliminary = []
    seen_names = set()

    for file in files:
        name = (file.filename or "uploaded-file").strip()
        suffix = Path(name).suffix.lower()
        result = {"source_id": None, "display_name": name, "status": "failed", "page_count": 0, "chunk_count": 0, "chunks": [], "error": None}
        if name in seen_names:
            result["error"] = "Duplicate filename in this upload"
            preliminary.append(result)
            continue
        seen_names.add(name)
        if suffix not in allowed_mimes:
            result["error"] = f"Unsupported file extension: {suffix or 'unknown'}"
            preliminary.append(result)
            continue
        content_type = (file.content_type or "").split(";", 1)[0].lower()
        if content_type not in {"", "application/octet-stream", *allowed_mimes[suffix]}:
            result["error"] = f"Content type '{content_type}' does not match {suffix}"
            preliminary.append(result)
            continue
        content = file.file.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            result["error"] = "File exceeds the 50MB limit"
            preliminary.append(result)
            continue
        try:
            file_docs = load_uploaded_file(name, content)
            if not file_docs:
                raise ValueError("File is empty or contains no extractable text")
            documents.extend(file_docs)
            result["status"] = "ready"
            result["page_count"] = len(file_docs)
        except Exception as error:
            result["error"] = str(error)
        preliminary.append(result)

    if not documents:
        return {"ok": False, "message": "No files contained extractable text.", "indexed_chunks": 0, "source_count": 0, "sources": preliminary}

    built = _chunker.build_session_sources(documents)
    by_name = {item["display_name"]: item for item in built if item["chunk_count"] > 0}

    results = []
    for item in preliminary:
        built_item = by_name.get(item["display_name"])
        if built_item and item["status"] == "ready":
            results.append(built_item)
        else:
            if item["status"] == "ready":
                item["status"] = "failed"
                item["error"] = "No chunks were produced"
            results.append(item)

    successful = [r for r in results if r["status"] == "indexed"]
    return {
        "ok": bool(successful),
        "message": f"Processed {len(successful)} of {len(files)} file(s) in memory.",
        "indexed_chunks": sum(r["chunk_count"] for r in successful),
        "source_count": len(successful),
        "sources": results,
    }


@api_router.post("/ingest/url", summary="Fetch and chunk one public website URL in memory")
def ingest_url(req: UrlIngestRequest):
    if not req.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty.")
    try:
        docs = load_url_content(req.url.strip())
        built = _chunker.build_session_sources(docs)
        if not built:
            raise ValueError("No readable chunks could be extracted from this URL.")
        item = built[0]
        return {
            "ok": True,
            "message": "URL content extracted for this session.",
            "indexed_chunks": item["chunk_count"],
            "source_count": 1,
            "sources": built,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/query", summary="Stateless RAG query over session document chunks")
def handle_query(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    if _is_simple_greeting(req.query):
        return {
            "answer": _local_greeting_answer(),
            "query": req.query,
            "thread_id": req.thread_id,
            "request_id": req.request_id,
            "sources": [],
            "local": True,
        }

    try:
        rag = _get_rag()
        session_chunks = [c.model_dump() for c in req.chunks]
        memory_context = _format_history_context([h.model_dump() for h in req.history])
        payload = rag.answer_with_sources(
            query=req.query.strip(),
            chunks=session_chunks,
            top_k=req.top_k,
            memory_context=memory_context,
            model=req.model,
            use_reranker=req.use_reranker,
            source_ids=req.source_ids,
            language=req.language,
            available_sources=req.available_sources,
            initial_question=req.initial_question,
        )
        return {
            "answer": payload.get("answer", ""),
            "query": req.query,
            "thread_id": req.thread_id,
            "request_id": req.request_id,
            "sources": payload.get("sources", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/query/stream", summary="Stateless RAG query with server-sent events")
def handle_query_stream(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    def event_generator():
        try:
            if _is_simple_greeting(req.query):
                answer = _local_greeting_answer()
                yield _sse_event("meta", {"query": req.query, "thread_id": req.thread_id, "request_id": req.request_id, "sources": [], "local": True})
                time.sleep(0.08)
                for chunk in re.findall(r"\S+\s*", answer):
                    yield _sse_event("token", {"request_id": req.request_id, "token": chunk})
                    time.sleep(0.02)
                yield _sse_event("done", {"query": req.query, "thread_id": req.thread_id, "request_id": req.request_id, "answer": answer, "sources": [], "local": True})
                return

            rag = _get_rag()
            session_chunks = [c.model_dump() for c in req.chunks]
            memory_context = _format_history_context([h.model_dump() for h in req.history])
            sources, token_iter = rag.stream_answer_with_sources(
                query=req.query.strip(),
                chunks=session_chunks,
                top_k=req.top_k,
                memory_context=memory_context,
                model=req.model,
                use_reranker=req.use_reranker,
                source_ids=req.source_ids,
                language=req.language,
                available_sources=req.available_sources,
                initial_question=req.initial_question,
            )
            yield _sse_event("meta", {"query": req.query, "thread_id": req.thread_id, "request_id": req.request_id, "sources": sources})

            parts = []
            for token in token_iter:
                text = str(token or "")
                if not text:
                    continue
                parts.append(text)
                yield _sse_event("token", {"request_id": req.request_id, "token": text})

            answer = "".join(parts).strip() or "I couldn’t finish this answer. Please try asking again or rephrasing your question."
            yield _sse_event("done", {"query": req.query, "thread_id": req.thread_id, "request_id": req.request_id, "answer": answer, "sources": sources})
        except Exception as e:
            yield _sse_event("error", {"request_id": req.request_id, "message": str(e), "interrupted": True})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@api_router.post("/feedback", summary="Accept session feedback (stateless)")
def submit_feedback(payload: FeedbackRequest):
    if not (payload.feedback or "").strip():
        raise HTTPException(status_code=400, detail="Feedback cannot be empty.")
    return {"ok": True, "message": "Thank you for your feedback."}


@api_router.get("/health")
def health():
    provider = (os.getenv("LLM_PROVIDER") or ("google" if os.getenv("GOOGLE_API_KEY") else "agentrouter")).strip().lower()
    configured = bool(os.getenv("GOOGLE_API_KEY") if provider == "google" else (os.getenv("AGENTROUTER_API_KEY") or os.getenv("AGENT_ROUTER_API_KEY")))
    return {
        "status": "ok",
        "mode": "stateless",
        "llm": {
            "provider": provider,
            "model": os.getenv("GOOGLE_LLM_MODEL", "gemini-2.5-flash") if provider == "google" else os.getenv("AGENTROUTER_MODEL", "deepseek-v4-flash"),
            "configured": configured,
        },
    }


@api_router.get("/health/live")
def health_live():
    return {"status": "ok"}


@api_router.get("/health/ready")
def health_ready():
    info = health()
    checks = {"stateless_engine": True, "llm_configured": info["llm"]["configured"]}
    if not checks["llm_configured"]:
        raise HTTPException(status_code=503, detail={"status": "not_ready", "checks": checks})
    return {"status": "ready", "checks": checks}


# Mount routes at both root (for local/single-container) and /api (for Vercel serverless)
app.include_router(api_router)
app.include_router(api_router, prefix="/api")

_API_PREFIXES = ("api/", "ingest/", "query", "feedback", "health", "openapi.json")

if _HAS_FRONTEND_DIST:
    _assets_dir = _FRONTEND_DIST / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="frontend-assets")

    for _public_file in ("favicon.svg", "llm.txt", "robots.txt", "sitemap.xml"):
        _public_path = _FRONTEND_DIST / _public_file
        if _public_path.is_file():
            def _make_static_handler(file_path: Path):
                def _serve_static():
                    return FileResponse(file_path)
                return _serve_static
            app.add_api_route(f"/{_public_file}", _make_static_handler(_public_path), methods=["GET"], include_in_schema=False)

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend_spa(full_path: str):
        normalized = full_path.lstrip("/")
        if any(normalized == p.rstrip("/") or normalized.startswith(p) for p in _API_PREFIXES):
            raise HTTPException(status_code=404, detail="Not found.")
        return FileResponse(_FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
