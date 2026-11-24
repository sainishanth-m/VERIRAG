---
title: VeriRag API
emoji: 🔎
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
---

# VeriRag

Full-stack single-container deployment for **VeriRag** (React frontend + FastAPI backend + ChromaDB + SQLite/PostgreSQL). The Docker image builds `frontend/dist` and serves both the web UI and API routes on port `7860`.

Configure secrets in the Space **Settings** (`GOOGLE_API_KEY` or `AGENTROUTER_API_KEY`, `VERIRAG_SESSION_SECRET`, `ENV=production`), attach persistent storage at `/data` (to preserve SQLite and Chroma embeddings across restarts), and keep `WEB_CONCURRENCY=1`.
