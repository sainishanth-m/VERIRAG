const SOURCES_STORAGE_KEY = 'verirag_session_sources_v1'
const THREADS_STORAGE_KEY = 'verirag_threads_v1'

const memorySources = new Map()
let hydrated = false

function hydrateSources() {
  if (hydrated) return
  hydrated = true
  try {
    const raw = window.sessionStorage?.getItem(SOURCES_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item?.source_id) memorySources.set(item.source_id, item)
      }
    }
  } catch {
    // Ignore storage read errors in restricted environments.
  }
}

function persistSources() {
  try {
    const payload = JSON.stringify([...memorySources.values()])
    window.sessionStorage?.setItem(SOURCES_STORAGE_KEY, payload)
  } catch {
    // Large PDFs stay in memory for the active tab without failing on QuotaExceededError.
  }
}

export function addSessionSources(sources) {
  hydrateSources()
  for (const item of sources || []) {
    if (item?.source_id && item.status === 'indexed' && Array.isArray(item.chunks) && item.chunks.length > 0) {
      memorySources.set(item.source_id, item)
    }
  }
  persistSources()
  return getSessionSources()
}

export function getSessionSources() {
  hydrateSources()
  return [...memorySources.values()].map(({ chunks, ...meta }) => ({
    ...meta,
    key: meta.source_id,
    chunk_count: Array.isArray(chunks) ? chunks.length : (meta.chunk_count || 0),
  }))
}

export function getSessionChunks(sourceIds = null) {
  hydrateSources()
  const filter = Array.isArray(sourceIds) && sourceIds.length > 0 ? new Set(sourceIds) : null
  const chunks = []
  for (const item of memorySources.values()) {
    if (filter && !filter.has(item.source_id)) continue
    if (Array.isArray(item.chunks)) {
      chunks.push(...item.chunks)
    }
  }
  return chunks
}

export function removeSessionSource(sourceId) {
  hydrateSources()
  const key = String(sourceId || '').trim()
  const removed = memorySources.get(key)
  memorySources.delete(key)
  persistSources()
  return Array.isArray(removed?.chunks) ? removed.chunks.length : 0
}

export function clearSessionSources() {
  memorySources.clear()
  hydrated = true
  try {
    window.sessionStorage?.removeItem(SOURCES_STORAGE_KEY)
  } catch {}
}

export function loadLocalThreads() {
  try {
    const raw = window.localStorage?.getItem(THREADS_STORAGE_KEY)
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveLocalThreads(threads) {
  try {
    const trimmed = (threads || []).slice(0, 20).map((thread) => ({
      ...thread,
      messages: (thread.messages || []).slice(-60).map((msg) => ({
        ...msg,
        streaming: false,
        activity: null,
        sources: (msg.sources || []).map(({ text, ...rest }) => rest),
      })),
    }))
    window.localStorage?.setItem(THREADS_STORAGE_KEY, JSON.stringify(trimmed))
  } catch {}
}

export function clearLocalThreads() {
  try {
    window.localStorage?.removeItem(THREADS_STORAGE_KEY)
  } catch {}
}
