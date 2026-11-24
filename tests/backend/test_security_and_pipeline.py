import io
import json
import socket
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from backend import main as api_main
from src.embedding import EmbeddingPipeline
from src.ingest import load_uploaded_file, validate_url
from src.search import RAGSearch


@pytest.fixture
def client():
    return TestClient(api_main.app)


def test_validate_url_blocks_private_and_loopback_addresses(monkeypatch):
    with pytest.raises(ValueError, match="http/https"):
        validate_url("file:///etc/passwd")
    with pytest.raises(ValueError, match="credentials"):
        validate_url("https://user:pass@example.com/")

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port, type=0: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))],
    )
    with pytest.raises(ValueError, match="reserved addresses"):
        validate_url("http://localhost:8000/secret")

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port, type=0: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", port))],
    )
    with pytest.raises(ValueError, match="reserved addresses"):
        validate_url("http://metadata.internal/latest")

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port, type=0: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))],
    )
    assert validate_url("https://example.com/docs") == "https://example.com/docs"


def test_in_memory_parsers_and_chunker():
    # TXT in-memory extraction
    txt_docs = load_uploaded_file("notes.txt", b"VeriRag processes files strictly in memory.")
    assert len(txt_docs) == 1
    assert "strictly in memory" in txt_docs[0].page_content

    # DOCX fixture extraction (no temp files required)
    fixture_docx = Path(__file__).resolve().parents[1] / "fixtures" / "sample.docx"
    docx_docs = load_uploaded_file("sample.docx", fixture_docx.read_bytes())
    assert len(docx_docs) == 1
    assert "DOCX extraction fixture" in docx_docs[0].page_content

    # Unsupported extension fails cleanly
    with pytest.raises(ValueError, match="Unsupported"):
        load_uploaded_file("malware.exe", b"MZ")

    # Chunker builds deterministic source + chunk payloads
    pipeline = EmbeddingPipeline(chunk_size=120, chunk_overlap=20, parent_chunk_size=400, parent_chunk_overlap=40)
    sources = pipeline.build_session_sources(txt_docs)
    assert len(sources) == 1
    assert sources[0]["status"] == "indexed"
    assert sources[0]["chunk_count"] >= 1
    assert sources[0]["chunks"][0]["parent_text"]


def test_hybrid_bm25_and_gemini_dense_rrf_retrieval(monkeypatch):
    rag = RAGSearch.__new__(RAGSearch)
    rag.google_api_key = "fake-key"

    chunks = [
        {
            "chunk_id": "chk_1",
            "source_id": "src_1",
            "source": "handbook.pdf",
            "title": "handbook.pdf",
            "source_type": "upload",
            "page": 0,
            "parent_id": "src_1::p0::c0",
            "parent_text": "Employee parental leave provides 16 weeks of paid time off [policy].",
            "text": "Employee parental leave provides 16 weeks of paid time off.",
        },
        {
            "chunk_id": "chk_2",
            "source_id": "src_1",
            "source": "handbook.pdf",
            "title": "handbook.pdf",
            "source_type": "upload",
            "page": 1,
            "parent_id": "src_1::p1::c0",
            "parent_text": "Office Wi-Fi credentials rotate quarterly.",
            "text": "Office Wi-Fi credentials rotate quarterly.",
        },
    ]

    # Mock dense embeddings so query matches chk_1 cleanly
    monkeypatch.setattr(
        "src.search.embed_texts_gemini",
        lambda texts, api_key=None: np.asarray([[1.0, 0.0], [0.98, 0.02], [0.1, 0.99]], dtype=np.float32),
    )

    ranked, _ = rag._retrieve_for_answer("How many weeks of parental leave?", chunks, top_k=2, use_reranker=True)
    assert ranked
    assert ranked[0]["metadata"]["chunk_id"] == "chk_1"
    assert "16 weeks" in ranked[0]["metadata"]["text"]


def test_health_and_ingest_endpoints_work_without_auth_or_storage(client):
    live = client.get("/api/health/live")
    assert live.status_code == 200
    assert live.json() == {"status": "ok"}

    # Invalid file type rejected
    bad_upload = client.post(
        "/api/ingest/files",
        files=[("files", ("script.js", b"alert(1)", "application/javascript"))],
    )
    assert bad_upload.status_code == 200
    assert bad_upload.json()["ok"] is False

    # Valid TXT upload returns session chunks without server DB
    good_upload = client.post(
        "/api/ingest/files",
        files=[("files", ("policy.txt", b"VeriRag keeps PDFs only in browser session memory.", "text/plain"))],
    )
    assert good_upload.status_code == 200
    payload = good_upload.json()
    assert payload["ok"] is True
    assert payload["source_count"] == 1
    assert payload["indexed_chunks"] >= 1
    assert payload["sources"][0]["chunks"]

    # Blank PDF stream without extractable text handled cleanly
    buf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buf)
    blank_pdf = client.post(
        "/api/ingest/files",
        files=[("files", ("blank.pdf", buf.getvalue(), "application/pdf"))],
    )
    assert blank_pdf.status_code == 200
    assert blank_pdf.json()["ok"] is False


def test_stateless_query_and_stream_endpoints(client, monkeypatch):
    # Local greeting works without LLM call
    greeting = client.post("/api/query", json={"query": "hello"})
    assert greeting.status_code == 200
    assert greeting.json()["local"] is True

    # Feedback works statelessly
    fb = client.post("/api/feedback", json={"rating": "up", "feedback": "Fast and stateless"})
    assert fb.status_code == 200
    assert fb.json()["ok"] is True

    fake_rag = RAGSearch.__new__(RAGSearch)
    fake_rag.google_api_key = None
    fake_rag._invoke_with_fallback = lambda *args, **kwargs: SimpleNamespace(content="PDFs stay in memory only [1].")
    fake_rag._stream_with_fallback = lambda *args, **kwargs: iter(["PDFs stay ", "in memory only [1]."])
    monkeypatch.setattr(api_main, "_get_rag", lambda: fake_rag)

    chunk = {
        "chunk_id": "chk_mem",
        "source_id": "src_mem",
        "source": "architecture.txt",
        "title": "architecture.txt",
        "source_type": "upload",
        "page": 0,
        "parent_id": "src_mem::p0",
        "parent_text": "VeriRag keeps uploaded PDFs in browser memory only.",
        "text": "VeriRag keeps uploaded PDFs in browser memory only.",
    }
    resp = client.post(
        "/api/query",
        json={"query": "Where do uploaded PDFs stay?", "chunks": [chunk], "use_reranker": False},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["answer"] == "PDFs stay in memory only [1]."
    assert len(data["sources"]) == 1

    stream_resp = client.post(
        "/api/query/stream",
        json={"query": "Where do uploaded PDFs stay?", "chunks": [chunk], "use_reranker": False},
    )
    assert stream_resp.status_code == 200
    body = stream_resp.text
    assert "event: meta" in body
    assert "event: token" in body
    assert "event: done" in body
    done_line = [line for line in body.splitlines() if line.startswith("data:")][-1]
    assert json.loads(done_line[5:])["answer"] == "PDFs stay in memory only [1]."
