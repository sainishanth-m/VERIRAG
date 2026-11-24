# Contributing to VeriRag

Thank you for improving VeriRag. Contributions are welcome as focused issues, documentation fixes, bug fixes, tests, and product changes.

## Development setup

1. Fork and clone [sainishanth-m/VERIRAG](https://github.com/sainishanth-m/VERIRAG).
2. Create a branch from `main`, for example `feat/source-filters` or `fix/stream-timeout`.
3. Copy `.env.example` to `.env` and add your development `GOOGLE_API_KEY`.
4. Install Python dependencies with `pip install -r requirements.txt` and frontend dependencies with `npm --prefix frontend ci`.
5. Run FastAPI on port `8000` and Vite on port `5173` as described in the README.

Never commit secrets, `.env` files, or private uploaded documents. Use synthetic or public fixtures in tests.

## Changes and commits

Keep each pull request small enough to review. Use clear imperative commit messages, preferably Conventional Commits:

```text
feat(chat): render structured answers as tables
fix(retrieval): stop the stream after the final event
docs(deploy): document Vercel deployment variables
test(api): cover stateless ingest and streaming query
```

## Validation

Run the checks related to your change before opening a pull request:

```bash
python -m pytest -q
npm --prefix frontend test -- --run
npm --prefix frontend run build
git diff --check
```

Include meaningful tests for behavior changes. UI pull requests should include screenshots for visible changes.

## Pull requests

Explain the problem, the resulting behavior, and the checks you ran. By contributing, you agree that your contribution is licensed under Apache License 2.0.

For vulnerabilities, do not open a public issue; follow [SECURITY.md](SECURITY.md).
