# Security Policy

## Supported version

Security fixes target the current `main` branch and the latest VeriRag release on [sainishanth-m/VERIRAG](https://github.com/sainishanth-m/VERIRAG).

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Security → Report a vulnerability** flow for this repository. Include the affected route or component, reproduction steps, impact, and any suggested mitigation. Do not include real API keys or private documents.

Please allow the maintainers time to confirm and fix the issue before public disclosure.

## Deployment responsibility

VeriRag operates statelessly without user accounts, server-side databases, or persistent file storage. When self-hosting or deploying on Vercel, keep `GOOGLE_API_KEY` and any optional provider credentials exclusively inside encrypted platform environment variables—never commit `.env` files.
