# Personal Executive Office

A private, AI-operated executive office for one owner. The system runs on the owner's home computer and is reachable from personal devices through a private tailnet.

The owner communicates naturally and provides raw material. A chief assistant retrieves context, delegates project-management or knowledge-research work, and manages one shared operational world with evidence, validated changes, receipts, and undo.

AI is required for intelligent operation. Inference uses only official locally installed subscription-authenticated `codex` and `grok` CLIs—never model APIs or API keys.

## Refoundation status

The repository currently contains a working technical prototype built around Capture, Tasks, and durable read-only AI conversations. Its infrastructure is being refounded into the executive-office product described in [PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md).

Reusable foundation:

- Fastify on localhost and private Tailscale access;
- Node's built-in SQLite;
- durable Codex and Grok CLI jobs;
- streaming, cancellation, concurrency limits, and restart recovery;
- a dependency-light browser UI and Playwright verification.

Not yet implemented:

- chief-assistant orchestration and specialist roles;
- shared project, meeting, decision, people, risk, evidence, and knowledge models;
- a read-only bridge to the legacy WorkOS source;
- typed agent mutations, receipts, corrections, and undo;
- proactive scheduled assistant work.

See [CURRENT_STATE.md](docs/CURRENT_STATE.md) and [ASSISTANT_SYSTEM_REFOUNDATION.md](docs/ASSISTANT_SYSTEM_REFOUNDATION.md) before selecting implementation work.

## Quick start

Requirements:

- Node.js 24 or newer
- npm
- authenticated official `codex` and/or `grok` CLI

```powershell
cd <repository-path>
npm install
Copy-Item .env.example .env
npm run dev
```

Open <http://127.0.0.1:4310> locally. Live development servers must also verify tailnet-only Tailscale Serve as described in `AGENTS.md`.

## Verification

```powershell
npx playwright install chromium
npm run verify
```

The Playwright suite uses isolated test data and keeps artifacts under the ignored `var/playwright/` path.

## Important boundaries

- No model APIs, SDK model calls, or model API keys.
- No public internet exposure.
- No automatic access to personal source data outside the repository.
- No browser-accessible shell, arbitrary paths, raw SQL, or provider protocol.
- Models propose typed operations; application code validates and commits them.
- Machine-specific settings belong only in ignored `.env` files.
- Public commits must not contain personal data, imported evidence, machine paths, private hostnames, credentials, databases, or logs.
