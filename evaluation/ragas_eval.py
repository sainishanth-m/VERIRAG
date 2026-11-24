import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
from src.embedding import EmbeddingPipeline
from src.ingest import load_uploaded_file
from src.search import RAGSearch


def _load_dataset(path: Path) -> list[dict]:
    with open(path, "r", encoding="utf-8") as file:
        rows = json.load(file)
    if not isinstance(rows, list):
        raise ValueError("Dataset file must contain a JSON array.")

    cleaned = []
    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"Row {idx} is not an object.")
        question = str(row.get("question", "")).strip()
        ground_truth = str(row.get("ground_truth", "")).strip()
        if not question or not ground_truth:
            raise ValueError(f"Row {idx} requires non-empty 'question' and 'ground_truth'.")
        cleaned.append({"question": question, "ground_truth": ground_truth})
    return cleaned


def _load_session_chunks(docs_dir: Path) -> list[dict]:
    pipeline = EmbeddingPipeline()
    parsed = []
    for path in sorted(docs_dir.rglob("*")):
        if path.is_file() and path.suffix.lower() in {".pdf", ".txt", ".docx"}:
            parsed.extend(load_uploaded_file(path.name, path.read_bytes()))
    sources = pipeline.build_session_sources(parsed)
    chunks: list[dict] = []
    for source in sources:
        chunks.extend(source.get("chunks") or [])
    return chunks


def _build_eval_rows(rag: RAGSearch, rows: list[dict], chunks: list[dict], top_k: int) -> list[dict]:
    output = []
    for row in rows:
        result = rag.answer_with_sources(query=row["question"], chunks=chunks, top_k=top_k)
        contexts = [str(source.get("text", "") or "") for source in result.get("sources", [])]
        output.append(
            {
                "question": row["question"],
                "answer": str(result.get("answer", "") or ""),
                "contexts": contexts,
                "ground_truth": row["ground_truth"],
            }
        )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Run RAGAS evaluation for the stateless VeriRag pipeline.")
    parser.add_argument("--dataset", type=str, required=True, help="Path to a JSON array test set")
    parser.add_argument("--docs-dir", type=str, required=True, help="Directory of reference PDF/TXT/DOCX documents")
    parser.add_argument("--top-k", type=int, default=5, help="Retriever top-k")
    parser.add_argument("--min-faithfulness", type=float, default=0.7)
    parser.add_argument("--min-context-precision", type=float, default=0.6)
    parser.add_argument("--llm-model", type=str, default=os.getenv("GOOGLE_LLM_MODEL", "gemini-2.5-flash"))
    args = parser.parse_args()

    load_dotenv()
    dataset_path = Path(args.dataset).resolve()
    docs_dir = Path(args.docs_dir).resolve()
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset file not found: {dataset_path}")
    if not docs_dir.is_dir():
        raise FileNotFoundError(f"Documents directory not found: {docs_dir}")

    from datasets import Dataset
    from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
    from ragas import evaluate
    from ragas.metrics.collections import answer_relevancy, context_precision, faithfulness

    google_api_key = os.getenv("GOOGLE_API_KEY")
    if not google_api_key:
        raise ValueError("GOOGLE_API_KEY is required to run RAGAS evaluation.")

    questions = _load_dataset(dataset_path)
    chunks = _load_session_chunks(docs_dir)
    rag = RAGSearch()
    eval_rows = _build_eval_rows(rag, questions, chunks=chunks, top_k=args.top_k)
    eval_dataset = Dataset.from_list(eval_rows)

    eval_llm = ChatGoogleGenerativeAI(google_api_key=google_api_key, model=args.llm_model)
    eval_embeddings = GoogleGenerativeAIEmbeddings(
        google_api_key=google_api_key,
        model=os.getenv("GOOGLE_EMBEDDING_MODEL", "gemini-embedding-001"),
    )

    result = evaluate(
        dataset=eval_dataset,
        metrics=[faithfulness, context_precision, answer_relevancy],
        llm=eval_llm,
        embeddings=eval_embeddings,
    )

    print("\nRAGAS evaluation complete")
    print(result)
    scores = result.to_pandas().mean(numeric_only=True).to_dict()
    if scores.get("faithfulness", 0.0) < args.min_faithfulness:
        raise SystemExit(f"Faithfulness below threshold: {scores.get('faithfulness', 0.0):.3f}")
    if scores.get("context_precision", 0.0) < args.min_context_precision:
        raise SystemExit(f"Context precision below threshold: {scores.get('context_precision', 0.0):.3f}")


if __name__ == "__main__":
    main()
