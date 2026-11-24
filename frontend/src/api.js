import {
  addSessionSources,
  clearLocalThreads,
  getSessionChunks,
  getSessionSources,
  loadLocalThreads,
  removeSessionSource,
  saveLocalThreads,
} from './lib/sessionStore.js'

export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')
const BASE = API_BASE
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function parseError(response, fallback) {
  const payload = await response.json().catch(() => ({}))
  const detail = payload?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.message || JSON.stringify(detail)
  if (response.status === 500) {
    return 'VeriRag server is unavailable. Start the backend and try again.'
  }
  return fallback
}

async function apiFetch(path, options = {}, config = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})
  const retries = SAFE_METHODS.has(method) ? Number(config.retries ?? 2) : Number(config.retries ?? 0)
  let lastError

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${BASE}${path}`, {
        ...options,
        method,
        headers,
      })
      if (response.ok) return response
      if (response.status >= 500 && attempt < retries) {
        await sleep(300 * (2 ** attempt))
        continue
      }
      const error = new Error(await parseError(response, `Request failed (${response.status})`))
      error.status = response.status
      throw error
    } catch (error) {
      lastError = error
      if (error?.name === 'AbortError' || attempt >= retries) throw error
      await sleep(300 * (2 ** attempt))
    }
  }
  throw lastError || new Error('Request failed')
}

async function jsonRequest(path, options = {}, config = {}) {
  const response = await apiFetch(path, options, config)
  return response.json()
}

export async function ingestFiles(files, { onProgress, signal } = {}) {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  const result = onProgress ? await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/ingest/files`)
    const abort = () => xhr.abort()
    const cleanup = () => signal?.removeEventListener('abort', abort)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress({ stage: 'uploading', percent: Math.round(event.loaded / event.total * 100) })
    }
    xhr.upload.onload = () => onProgress({ stage: 'indexing', phase: 'Extracting text in memory', percent: 60 })
    xhr.onload = () => {
      cleanup()
      let payload
      try { payload = JSON.parse(xhr.responseText) } catch {
        const status = xhr.status
        let message = `Upload server returned an unexpected response (HTTP ${status}).`
        if ([408, 504, 524].includes(status)) {
          message = `Upload/indexing request timed out (HTTP ${status}). Try a smaller file.`
        } else if (status === 413) {
          message = 'Upload rejected by the server or proxy: request too large (HTTP 413). Try uploading smaller files.'
        } else if ([500, 502, 503, 520, 521, 522, 523].includes(status)) {
          message = `Upload backend failed (HTTP ${status}). Check the backend logs for the cause.`
        }
        reject(new Error(message))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload)
      else reject(new Error(typeof payload.detail === 'string' ? payload.detail : payload.detail?.message || `Upload failed (${xhr.status}).`))
    }
    xhr.onerror = () => { cleanup(); reject(new Error('Upload failed. Check your connection and try again.')) }
    xhr.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); return }
    xhr.send(form)
  }) : await jsonRequest('/ingest/files', { method: 'POST', body: form, signal })

  if (result.ok === false || result.source_count === 0) {
    const failures = (result.sources || []).filter((source) => source.error)
      .map((source) => `${source.display_name}: ${source.error}`)
    throw new Error(failures.join('; ') || result.message || 'No files contained extractable text.')
  }
  addSessionSources(result.sources || [])
  onProgress?.({ stage: 'done', phase: 'Ready to ask questions', percent: 100 })
  return result
}

export async function ingestUrl(url) {
  const result = await jsonRequest('/ingest/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  addSessionSources(result.sources || [])
  return result
}

export async function getIndexedSources() {
  const sources = getSessionSources()
  return { count: sources.length, sources }
}

export async function unindexSource(sourceId) {
  const removed = removeSessionSource(sourceId)
  return {
    ok: true,
    removed,
    message: `Removed source from session (${removed} chunk(s) cleared).`,
  }
}

export async function getThreads() {
  return { threads: loadLocalThreads() }
}

export async function createBackendThread(title = 'New Chat', id = null) {
  const now = Date.now()
  const tid = id || `thread_${now}_${Math.random().toString(36).slice(2, 8)}`
  const thread = { id: tid, sessionId: tid, title, messages: [], createdAt: now, updatedAt: now }
  const existing = loadLocalThreads()
  saveLocalThreads([thread, ...existing.filter((t) => t.id !== tid)])
  return { thread }
}

export async function getThreadMessages(threadId) {
  const thread = loadLocalThreads().find((t) => t.id === threadId)
  return { messages: thread?.messages || [] }
}

export async function renameBackendThread(threadId, title) {
  const threads = loadLocalThreads().map((t) => (t.id === threadId ? { ...t, title, updatedAt: Date.now() } : t))
  saveLocalThreads(threads)
  return { ok: true }
}

export async function deleteBackendThread(threadId) {
  const threads = loadLocalThreads().filter((t) => t.id !== threadId)
  saveLocalThreads(threads)
  return { ok: true }
}

export function clearLocalThreadHistory() {
  clearLocalThreads()
}

function queryBody(query, options = {}) {
  const allSources = getSessionSources()
  const sourceIds = options.sourceIds?.length ? options.sourceIds : undefined
  const chunks = getSessionChunks(sourceIds)
  return {
    query,
    thread_id: options.threadId,
    request_id: options.requestId,
    top_k: options.topK ?? 5,
    model: options.model || undefined,
    use_reranker: options.useReranker ?? true,
    language: options.language || 'auto',
    source_ids: sourceIds,
    chunks,
    available_sources: allSources.map(({ source_id, source, type }) => ({ source_id, source, title: source, type })),
    history: Array.isArray(options.history) ? options.history : [],
    initial_question: Boolean(options.initialQuestion),
  }
}

export function queryRAG(query, options = {}) {
  return jsonRequest('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody(query, options)),
    signal: options.signal,
  })
}

function parseSSEBlock(block) {
  const lines = block.split('\n')
  let event = 'message'
  const dataLines = []
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!dataLines.length) return null
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) }
  } catch {
    throw new Error('The server returned an invalid stream event.')
  }
}

export async function queryRAGStream(query, options = {}, handlers = {}) {
  const response = await apiFetch('/query/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(queryBody(query, options)),
    signal: handlers.signal || options.signal,
  })
  if (!response.body) throw new Error('Streaming is unavailable.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let donePayload = null
  let receivedText = false

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    for (const rawEvent of events) {
      const parsed = parseSSEBlock(rawEvent.replace(/\r/g, ''))
      if (!parsed) continue
      if (parsed.event === 'meta') handlers.onMeta?.(parsed.data)
      if (parsed.event === 'token') {
        receivedText = receivedText || Boolean(parsed.data?.token)
        handlers.onToken?.(parsed.data?.token || '')
      }
      if (parsed.event === 'done') {
        donePayload = parsed.data
        handlers.onDone?.(parsed.data)
        await reader.cancel().catch(() => {})
        return donePayload
      }
      if (parsed.event === 'error') {
        const error = new Error(parsed.data?.message || 'Streaming failed')
        error.interrupted = Boolean(parsed.data?.interrupted || receivedText)
        handlers.onError?.(error)
        throw error
      }
    }
  }
  if (!donePayload) {
    const error = new Error('The response stream ended before completion.')
    error.interrupted = receivedText
    throw error
  }
  return donePayload
}

export function submitFeedback({ rating, comment, feedback }) {
  return jsonRequest('/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: rating || 'neutral', feedback: (feedback || comment || '').trim() }),
  })
}

export async function rateResponse(threadId, messageId, rating) {
  const threads = loadLocalThreads().map((thread) => {
    if (thread.id !== threadId) return thread
    return {
      ...thread,
      messages: (thread.messages || []).map((msg) => (msg.id === messageId ? { ...msg, rating } : msg)),
    }
  })
  saveLocalThreads(threads)
  return { message_id: messageId, rating }
}

export async function saveIndexGuidance(_threadId, query) {
  return {
    request_id: `guide_${Date.now()}`,
    answer: 'I can answer from your documents once you add a source for this session. Upload a PDF, DOCX, TXT file, or public URL in Data Center first.',
    query,
  }
}
