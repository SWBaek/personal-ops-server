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
- Read-only, single-turn Codex and Grok chat through installed subscription-authenticated CLIs.
- Allowlisted provider, model, and reasoning controls in the browser.
- Fixed empty AI working directory, provider concurrency locks, two-minute timeout, and bounded output.
- Type checks, tests, and production build scripts.

## Deliberately not implemented

- Application authentication.
- structured-intent mutation parsing;
- AI job persistence, conversation history, streaming, cancellation, and approval;
- search, projects, notes, attachments, and export;
- database backup and restore automation;
- Legacy vault migration.

These are omitted to keep the first trust boundary small.

## Verification evidence

Verified on Windows with Node.js 24.18.0 on 2026-07-22:

- `npm run verify` passed;
- 18 tests passed with no failures;
- TypeScript production build completed;
- `npm audit --audit-level=moderate` reported zero vulnerabilities;
- the built server answered `/api/health` successfully on `127.0.0.1:4310`;
- provider checks detected `codex-cli 0.144.6` and official Grok Build `0.2.106`;
- live single-turn requests returned expected answers from both Codex and Grok;
- the Grok request was also verified through the tailnet-only Tailscale Serve URL.

## Recommended next milestone

Make the working AI chat durable without enabling data mutation:

1. add a durable `ai_jobs` table and idempotent state transitions;
2. add explicit cancellation and sanitized streaming events;
3. decide whether conversation history should remain browser-local or become resumable provider threads;
4. add application authentication before persistent conversations or AI-proposed mutations;
5. keep structured mutation interpretation and approval as a separate later milestone.

## First Codex prompt

```text
Read AGENTS.md and docs/PROJECT_BRIEF.md, ARCHITECTURE.md, SECURITY.md, CLI_CONTRACTS.md, and CURRENT_STATE.md. Inspect the existing scaffold and run npm run verify. Do not access any legacy personal vault and do not use any model API. Propose the smallest next milestone for a read-only CLI job runner, including tests and security boundaries, before editing.
```
