# Current State

Updated: 2026-07-22

## Ready

- Independent repository scaffold outside the legacy personal vault.
- Durable project and security context.
- Local Fastify server.
- SQLite initialization using Node's built-in `node:sqlite`.
- Capture creation and listing.
- Task creation, Today/open listing, completion, and rescheduling.
- Minimal browser UI for the core workflow.
- Safe, non-AI CLI availability checks.
- Durable, read-only Codex and Grok conversations through installed subscription-authenticated CLIs.
- One primary and one optional secondary assistant with durable context reset archives.
- Allowlisted provider, model, and reasoning controls in the browser.
- SQLite-backed conversations, messages, idempotent AI jobs, sanitized SSE, cancellation, and restart recovery.
- Codex app-server text deltas over private stdio with buffered `codex exec` fallback; Grok streaming JSON.
- Fixed empty AI working directory, provider concurrency locks, two-minute timeout, and bounded output.
- Isolated Playwright Chromium checks for responsive layout, compact assistant switching, context archives, AI streaming, and reload recovery.
- Type checks, tests, and production build scripts.

## Deliberately not implemented

- Application authentication.
- structured-intent mutation parsing;
- AI approval and structured-intent mutation parsing;
- search, projects, notes, attachments, and export;
- database backup and restore automation;
- Legacy vault migration.

These are omitted to keep the first trust boundary small.

## Verification evidence

Verified on Windows with Node.js 24.18.0 on 2026-07-22:

- `npm run verify` passed;
- 26 unit/integration tests and 7 Playwright browser tests passed with no failures;
- TypeScript production build completed;
- `npm audit --audit-level=moderate` reported zero vulnerabilities;
- the built server answered `/api/health` successfully on `127.0.0.1:4310`;
- provider checks detected `codex-cli 0.144.6` and official Grok Build `0.2.106`;
- live durable streaming requests returned expected answers from both Codex and Grok;
- the Grok request was also verified through the tailnet-only Tailscale Serve URL.

## Recommended next milestone

Implement durable non-AI search next, while keeping AI mutation disabled:

1. add deterministic search across captures and tasks;
2. add documented JSON/Markdown export and SQLite backup;
3. add application authentication before access expands beyond the owner's current tailnet;
4. keep structured AI mutation interpretation and approval as a separate later milestone.

## First Codex prompt

```text
Read AGENTS.md and docs/PROJECT_BRIEF.md, ARCHITECTURE.md, SECURITY.md, CLI_CONTRACTS.md, and CURRENT_STATE.md. Inspect the existing scaffold and run npm run verify. Do not access any legacy personal vault and do not use any model API. Propose the smallest next milestone for a read-only CLI job runner, including tests and security boundaries, before editing.
```
