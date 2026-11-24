from types import SimpleNamespace

import pytest

from src.search import DOCUMENT_SCOPE_MARKER, EMPTY_ANSWER_MESSAGE, RAGSearch


@pytest.mark.parametrize('stream', [False, True])
@pytest.mark.parametrize('available,selected,expected', [
    ([{'source_id': 'source-1', 'source': 'Doc1.pdf'}], ['source-1'], 'Let’s keep this chat focused'),
    ([], None, 'Add a document in Data Center'),
    ([{'source_id': 'source-1', 'source': 'Doc1.pdf'}], ['removed-source'], 'Choose an available document'),
])
def test_missing_context_guides_user_without_claiming_upload_failed(stream, available, selected, expected):
    rag = RAGSearch.__new__(RAGSearch)
    rag._retrieve_for_answer = lambda *args, **kwargs: ([], 'unrelated question')
    rag._build_source_payload = lambda rows: []
    chunks = [{'source_id': item['source_id'], 'source': item['source'], 'text': 'Sample text'} for item in available]

    if stream:
        sources, tokens = rag.stream_answer_with_sources(
            'unrelated question',
            chunks=chunks,
            available_sources=available,
            source_ids=selected,
        )
        answer = ''.join(tokens)
    else:
        result = rag.answer_with_sources(
            'unrelated question',
            chunks=chunks,
            available_sources=available,
            source_ids=selected,
        )
        sources, answer = result['sources'], result['answer']

    assert sources == []
    assert expected in answer
    assert 'No relevant documents found' not in answer
    assert 'document' in answer


def test_insufficient_context_prompt_keeps_user_grounded_in_documents():
    prompt = RAGSearch._build_answer_prompt(
        RAGSearch.__new__(RAGSearch),
        'What is the weather?',
        [{'index': 1, 'source': 'Research.pdf', 'text': 'This paper explains a research method.'}],
        [],
        None,
    )
    assert DOCUMENT_SCOPE_MARKER in prompt
    assert 'Do not invent document topics' in prompt
    assert 'answer from general knowledge' in prompt


def test_empty_model_answer_does_not_claim_documents_are_missing():
    rag = RAGSearch.__new__(RAGSearch)
    rag._retrieve_for_answer = lambda *args, **kwargs: ([{'metadata': {'source': 'Notes.txt'}}], 'question')
    rag._build_source_payload = lambda rows: [{'index': 1, 'source': 'Notes.txt', 'text': 'Notes'}]
    rag._extract_direct_snippets = lambda *args: []
    rag._invoke_with_fallback = lambda *args: SimpleNamespace(content='')
    result = rag.answer_with_sources('question', chunks=[{'source_id': 'n1', 'source': 'Notes.txt', 'text': 'Notes'}])
    assert result['answer'] == EMPTY_ANSWER_MESSAGE
    assert result['sources']


@pytest.mark.parametrize('stream', [False, True])
def test_initial_scope_overview_summarizes_each_selected_document_only(stream):
    import json

    rag = RAGSearch.__new__(RAGSearch)
    calls = []
    available = [
        {'source_id': 'a', 'title': 'Plants.pdf', 'source': 'Plants.pdf'},
        {'source_id': 'b', 'title': 'Viva.pdf', 'source': 'Viva.pdf'},
        {'source_id': 'excluded', 'title': 'Private.pdf', 'source': 'Private.pdf'},
    ]
    chunks = [
        {'source_id': 'a', 'source': 'Plants.pdf', 'title': 'Plants.pdf', 'page': 0, 'text': 'A study of plant growth.'},
        {'source_id': 'b', 'source': 'Viva.pdf', 'title': 'Viva.pdf', 'page': 0, 'text': 'A guide to exam preparation.'},
        {'source_id': 'excluded', 'source': 'Private.pdf', 'title': 'Private.pdf', 'page': 0, 'text': 'Secret notes.'},
    ]
    rag._retrieve_for_answer = lambda *args, **kwargs: ([], 'unrelated')
    rag._build_source_payload = lambda rows: []

    def summarize(prompt, model):
        calls.append(prompt)
        assert 'Private.pdf' not in prompt
        assert 'plant growth' in prompt
        return SimpleNamespace(content=json.dumps({
            'a': 'Plant growth: describes a plant study.',
            'b': 'Exam preparation: outlines preparation guidance.',
        }))

    rag._invoke_with_fallback = summarize
    options = dict(chunks=chunks, available_sources=available, source_ids=['a', 'b'], initial_question=True)
    if stream:
        sources, tokens = rag.stream_answer_with_sources('unrelated', **options)
        answer = ''.join(tokens)
    else:
        result = rag.answer_with_sources('unrelated', **options)
        sources, answer = result['sources'], result['answer']

    assert sources == []
    assert 'Plants.pdf' in answer and 'Viva.pdf' in answer
    assert 'Plant growth:' in answer and 'Exam preparation:' in answer
    assert 'Which document would you like to explore?' in answer
    assert 'couldn’t find' not in answer

    options['initial_question'] = False
    followup = rag.answer_with_sources('another unrelated question', **options)['answer']
    assert 'Plants.pdf' not in followup
    assert len(calls) == 1


@pytest.mark.parametrize('stream', [False, True])
def test_unsupported_retrieved_context_uses_scope_redirect_without_leaking_marker(stream):
    rag = RAGSearch.__new__(RAGSearch)
    chunks = [{'source_id': 'a', 'source': 'Notes.txt', 'text': 'Plants grow using sunlight.'}]
    rag._retrieve_for_answer = lambda *args, **kwargs: ([{'metadata': chunks[0]}], 'question')
    rag._build_source_payload = lambda rows: [{'index': 1, 'source': 'Notes.txt', 'text': 'Plants'}]
    rag._extract_direct_snippets = lambda *args: []
    rag._invoke_with_fallback = lambda *args: SimpleNamespace(content=DOCUMENT_SCOPE_MARKER)
    rag._stream_with_fallback = lambda *args: iter(['VERIRAG_', 'DOCUMENT_', 'SCOPE'])

    if stream:
        sources, tokens = rag.stream_answer_with_sources('weather', chunks=chunks)
        answer = ''.join(tokens)
    else:
        result = rag.answer_with_sources('weather', chunks=chunks)
        sources, answer = result['sources'], result['answer']

    assert sources == []
    assert DOCUMENT_SCOPE_MARKER not in answer
    assert 'Let’s keep this chat focused' in answer
