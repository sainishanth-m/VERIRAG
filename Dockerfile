FROM node:24-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
ENV VITE_API_URL=""
RUN npm run build

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    WEB_CONCURRENCY=1

RUN useradd --create-home --uid 1000 verirag \
    && mkdir -p /app \
    && chown -R verirag:verirag /app

WORKDIR /app

COPY --chown=verirag:verirag requirements.txt README.md ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=verirag:verirag api ./api
COPY --chown=verirag:verirag backend ./backend
COPY --chown=verirag:verirag src ./src
COPY --chown=verirag:verirag --from=frontend-builder /app/frontend/dist ./frontend/dist

USER verirag

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"PORT\", \"7860\")}/api/health/live', timeout=4)" || exit 1

CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860} --workers ${WEB_CONCURRENCY:-1} --timeout-keep-alive 30 --proxy-headers --forwarded-allow-ips='*'"]
