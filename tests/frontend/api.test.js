// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearLocalThreadHistory,
  createBackendThread,
  deleteBackendThread,
  getIndexedSources,
  getThreadMessages,
  getThreads,
  ingestFiles,
  ingestUrl,
  queryRAG,
  queryRAGStream,
  rateResponse,
  renameBackendThread,
  submitFeedback,
  unindexSource,
} from '../../frontend/src/api.js'
import { clearSessionSources, getSessionChunks } from '../../frontend/src/lib/sessionStore.js'

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeSource(id = 'src_doc1', name = 'report.pdf', text = 'Quarterly revenue rose 20%.') {
  return {
    source_id: id,
    key: id,
    source: name,
    display_name: name,
    type: 'upload',
    status: 'indexed',
    page_count: 1,
    chunk_count: 1,
    chunks: [
      {
        chunk_id: `${id}_chk1`,
        source_id: id,
        source: name,
        title: name,
        source_type: 'upload',
        page: 0,
        parent_id: `${id}::p0`,
        parent_text: text,
        text,
      },
    ],
    error: null,
  }
}

describe('Stateless VeriRag API client and session store', () => {
  beforeEach(() => {
    clearSessionSources()
    clearLocalThreadHistory()
    global.fetch = vi.fn()
  })

  afterEach(() => vi.restoreAllMocks())

  it('shows file extraction errors instead of reporting a successful upload', async () => {
    fetch.mockResolvedValue(jsonResponse({
      ok: false,
      source_count: 0,
      sources: [{ display_name: 'scan.pdf', error: 'File is empty or contains no extractable text' }],
    }))
    await expect(ingestFiles([new File(['scan'], 'scan.pdf', { type: 'application/pdf' })]))
      .rejects.toThrow('scan.pdf: File is empty or contains no extractable text')
  })

  it('tracks upload progress and saves parsed chunks into sessionStore', async () => {
    const sourcePayload = makeSource('src_notes', 'notes.txt', 'Key point in notes.')
    const xhr = {
      upload: {},
      open: vi.fn(),
      send: vi.fn(),
      status: 200,
      responseText: JSON.stringify({ ok: true, source_count: 1, indexed_chunks: 1, sources: [sourcePayload] }),
    }
    vi.stubGlobal('XMLHttpRequest', class { constructor() { return xhr } })
    try {
      const onProgress = vi.fn()
      const request = ingestFiles([new File(['text'], 'notes.txt')], { onProgress })
      expect(xhr.open).toHaveBeenCalledWith('POST', '/api/ingest/files')
      xhr.upload.onprogress({ lengthComputable: true, loaded: 88, total: 100 })
      expect(onProgress).toHaveBeenLastCalledWith({ stage: 'uploading', percent: 88 })
      xhr.upload.onload()
      expect(onProgress).toHaveBeenLastCalledWith({ stage: 'indexing', phase: 'Extracting text in memory', percent: 60 })
      xhr.onload()
      await expect(request).resolves.toMatchObject({ source_count: 1 })
      expect(onProgress).toHaveBeenLastCalledWith({ stage: 'done', phase: 'Ready to ask questions', percent: 100 })

      const listed = await getIndexedSources()
      expect(listed.count).toBe(1)
      expect(listed.sources[0].source_id).toBe('src_notes')
      expect(getSessionChunks()).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([
    [524, 'timed out (HTTP 524)'],
    [502, 'backend failed (HTTP 502)'],
    [413, 'request too large (HTTP 413)'],
    [200, 'unexpected response (HTTP 200)'],
  ])('preserves HTTP %s when the upload response is HTML instead of JSON', async (status, message) => {
    const xhr = { upload: {}, open: vi.fn(), send: vi.fn(), status, responseText: '<html>Error</html>' }
    vi.stubGlobal('XMLHttpRequest', class { constructor() { return xhr } })
    try {
      const request = ingestFiles([new File(['text'], 'notes.txt')], { onProgress: vi.fn() })
      xhr.onload()
      await expect(request).rejects.toThrow(message)
      expect(xhr.send).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('ingests a URL into sessionStore and supports unindexing without server storage', async () => {
    const urlSource = { ...makeSource('src_url1', 'https://example.com/docs', 'API usage guide.'), type: 'url' }
    fetch.mockResolvedValueOnce(jsonResponse({ ok: true, source_count: 1, indexed_chunks: 1, sources: [urlSource] }))

    await ingestUrl('https://example.com/docs')
    expect(fetch).toHaveBeenCalledWith('/api/ingest/url', expect.objectContaining({ method: 'POST' }))
    expect((await getIndexedSources()).count).toBe(1)

    const removed = await unindexSource('src_url1')
    expect(removed.removed).toBe(1)
    expect((await getIndexedSources()).count).toBe(0)
  })

  it('sends active session chunks and history on /api/query and does not retry non-idempotent POST', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ ok: true, source_count: 1, sources: [makeSource('src_a', 'a.pdf', 'Fact A')] }))
      .mockResolvedValueOnce(jsonResponse({ answer: 'Fact A [1]', sources: [] }))
    await ingestUrl('https://example.com/a')

    const res = await queryRAG('What is Fact A?', {
      threadId: 'thread-1',
      requestId: 'req-1',
      history: [{ role: 'user', text: 'Previous turn' }],
      initialQuestion: false,
    })
    expect(res.answer).toBe('Fact A [1]')
    const sentBody = JSON.parse(fetch.mock.calls[1][1].body)
    expect(sentBody.chunks).toHaveLength(1)
    expect(sentBody.available_sources).toHaveLength(1)
    expect(sentBody.history).toEqual([{ role: 'user', text: 'Previous turn' }])

    fetch.mockResolvedValueOnce(jsonResponse({ detail: 'failed' }, 500))
    await expect(queryRAG('question', { threadId: 'thread-1', requestId: 'request-2' })).rejects.toThrow('failed')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('rejects a stream that ends without a done event', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: token\ndata: {"token":"partial"}\n\n'))
        controller.close()
      },
    })
    fetch.mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    await expect(queryRAGStream('question', { threadId: 'thread-1', requestId: 'request-1' }))
      .rejects.toMatchObject({ interrupted: true })
  })

  it('finishes as soon as the done event arrives without waiting for connection close', async () => {
    const cancelled = vi.fn()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'event: token\ndata: {"token":"Finished"}\n\n' +
          'event: done\ndata: {"answer":"Finished","sources":[]}\n\n',
        ))
      },
      cancel: cancelled,
    })
    fetch.mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))

    await expect(queryRAGStream('question', { threadId: 'thread-1', requestId: 'request-1' }))
      .resolves.toMatchObject({ answer: 'Finished' })
    expect(cancelled).toHaveBeenCalledOnce()
  })

  it('manages threads, ratings, and feedback locally/statelessly', async () => {
    await createBackendThread('Budget Q&A', 't_1')
    expect((await getThreads()).threads).toHaveLength(1)
    await renameBackendThread('t_1', 'Renamed Q&A')
    expect((await getThreads()).threads[0].title).toBe('Renamed Q&A')
    expect((await getThreadMessages('t_1')).messages).toEqual([])
    await rateResponse('t_1', 'm_1', 'up')
    await deleteBackendThread('t_1')
    expect((await getThreads()).threads).toHaveLength(0)

    fetch.mockResolvedValueOnce(jsonResponse({ ok: true, message: 'Thank you for your feedback.' }))
    await expect(submitFeedback({ rating: 'up', comment: 'Clean UX' })).resolves.toMatchObject({ ok: true })
    expect(fetch).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({ method: 'POST' }))
  })
})
