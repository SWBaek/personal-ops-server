# Personal Ops Server

A local-first personal command center that runs on the owner's home computer and can be reached from a phone, tablet, or another computer through a private network.

The application must work without model APIs. Optional AI features call only the official, locally installed `codex` and `grok` CLIs using their existing subscription authentication.

## Current state

The repository contains:

- a working local Fastify server;
- SQLite-backed Capture and Task primitives;
- a minimal browser UI;
- read-only, single-turn Codex and Grok CLI chat with model and reasoning controls;
- non-invasive CLI availability checks;
- product, architecture, security, and handoff documents;
- tests for the core date and input rules.

AI execution is limited to isolated, read-only, single-turn requests. Durable jobs, conversation history, streaming, cancellation, and AI-proposed mutations are not exposed yet.

## Quick start

Requirements:

- Node.js 24 or newer
- npm
- optional: authenticated `codex` and/or `grok` CLI

```powershell
cd <repository-path>
npm install
Copy-Item .env.example .env
npm run dev
```

Open <http://127.0.0.1:4310>.

Before implementation work, run:

```powershell
codex
```

Then ask Codex to read `AGENTS.md` and `docs/CURRENT_STATE.md` before choosing the next milestone.

## Verification

```powershell
npm run verify
```

## Important boundaries

- No model APIs or API keys.
- No public internet exposure.
- No automatic access to a legacy personal vault.
- No browser-accessible shell.
- No AI dependency for core task operations.

Machine-specific development settings belong in the ignored `.env` file. Keep `.env.example` limited to safe placeholder values. CLI authentication remains in the operating-system credential store and must never be copied into `.env`.

See [PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) for the full product context.
