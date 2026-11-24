from types import SimpleNamespace

import pytest

from src.search import RAGSearch


def search_with_documents():
    rag = RAGSearch.__new__(RAGSearch)
    chunks = [
        {
            'source_id': 'one',
            'source': 'Annual_Report.pdf',
            'title': 'Annual Report',
            'page': page,
            'text': f'Page {page}: revenue, risks and company operations.',
            'chunk_id': f'one-{page}',
        }
        for page in range(60)
    ] + [
        {
            'source_id': 'two',
            'source': 'Research.pdf',
            'title': 'Research',
            'page': 0,
            'text': 'Research findings on hybrid retrieval benchmarks.',
            'chunk_id': 'two-0',
        }
    ]
    rag._retrieve_for_answer = lambda *args, **kwargs: (_ for _ in ()).throw(
        AssertionError('Generic summary must not use relevance search')
    )
    rag._extract_direct_snippets = lambda *args: []
    rag._invoke_with_fallback = lambda *args: SimpleNamespace(content='The report covers revenue and risks [1].')
    rag._stream_with_fallback = lambda *args: iter(['The report covers ', 'revenue and risks [1].'])
    return rag, chunks


@pytest.mark.parametrize('stream', [False, True])
@pytest.mark.parametrize('query', ['summarize the pdf', 'give me a brief summary of this document', 'summarize the pdf again'])
def test_single_document_summarizes_without_filename(stream, query):
    rag, chunks = search_with_documents()
    only_one = [c for c in chunks if c['source_id'] == 'one']
    if stream:
        sources, tokens = rag.stream_answer_with_sources(query, chunks=only_one)
        answer = ''.join(tokens)
    else:
        result = rag.answer_with_sources(query, chunks=only_one)
        sources, answer = result['sources'], result['answer']
    assert 'revenue and risks' in answer
    assert len(sources) == 18
    assert sources[0]['page'] == 0 and sources[-1]['page'] == 59


@pytest.mark.parametrize('stream', [False, True])
def test_multiple_documents_ask_which_one_before_model_call(stream):
    rag, chunks = search_with_documents()
    if stream:
        sources, tokens = rag.stream_answer_with_sources('summarize the pdf', chunks=chunks)
        answer = ''.join(tokens)
    else:
        result = rag.answer_with_sources('summarize the pdf', chunks=chunks)
        sources, answer = result['sources'], result['answer']
    assert sources == []
    assert 'Which document' in answer
    assert 'Annual Report' in answer and 'Research' in answer


@pytest.mark.parametrize('query,selected,expected_source', [
    ('summarize the pdf', ['two'], 'Research.pdf'),
    ('Annual_Report.pdf summarize this pdf', None, 'Annual_Report.pdf'),
    ('summarize Annual Report', None, 'Annual_Report.pdf'),
])
def test_named_or_selected_document_resolves_ambiguity(query, selected, expected_source):
    rag, chunks = search_with_documents()
    result = rag.answer_with_sources(query, chunks=chunks, source_ids=selected)
    assert result['sources']
    assert all(src['source'] == expected_source for src in result['sources'])


def test_specific_topic_summary_uses_regular_retrieval():
    rag, chunks = search_with_documents()
    assert rag._summary_request_context('summarize revenue growth', chunks, None) is None


def test_summary_never_uses_a_source_excluded_by_selection():
    rag, chunks = search_with_documents()
    result = rag._summary_request_context('summarize Annual Report', chunks, ['two'])
    assert result is None
