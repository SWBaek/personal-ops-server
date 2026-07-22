# Current State

Updated: 2026-07-22

## Product status

The product direction has been reset.

The repository was initially implemented as a small personal task service with optional AI chat. That concept is now superseded. The target is an AI-dependent personal executive office with one chief-assistant front door, specialist roles, a shared evidence-backed operational ledger, typed mutations, receipts, and proactive follow-up.

The running application is therefore a useful technical prototype, not a valid representation of the target product experience.

## Reusable foundation already working

- Independent public repository outside the legacy personal vault.
- Local Fastify server bound to localhost.
- SQLite initialization using Node's built-in `node:sqlite`.
- Capture and Task primitives that can inform, but do not define, the future domain model.
- Private remote access through Tailscale Serve.
- Durable Codex and Grok conversations through official locally installed subscription-authenticated CLIs.
- Allowlisted provider, model, and reasoning controls.
- SQLite-backed conversations, messages, idempotent jobs, sanitized SSE, cancellation, and restart recovery.
- Codex app-server text deltas over private stdio with buffered `codex exec` fallback; Grok streaming JSON.
- Fixed empty AI working directory, provider concurrency locks, two-minute timeout, and bounded output.
- Playwright Chromium coverage for responsive layout, conversation switching, archives, streaming, and reload recovery.
- Type checking, unit/integration tests, production build, and verification scripts.

## Transitional or superseded product behavior

- Capture and Today currently dominate the main view.
- AI is read-only and cannot retrieve or operate on real project or knowledge context.
- The primary/secondary assistant slots model assistants as conversation containers rather than roles over shared state.
- Projects, people, meetings, decisions, dependencies, risks, knowledge artifacts, evidence provenance, receipts, and corrections do not exist in the application domain.
- Current project documentation previously required useful operation without AI; that requirement is superseded.
- The legacy WorkOS vault remains disconnected.

Do not expand these transitional behaviors as if they were the target architecture.

## Deliberately not implemented

- chief-assistant orchestration;
- specialist role execution;
- goal-specific context building;
- typed agent domain tools;
- shared operational ledger beyond primitive tasks;
- evidence ingestion and provenance;
- project, meeting, person, decision, dependency, risk, and knowledge models;
- legacy WorkOS read-only bridge;
- proposal, approval, receipt, correction, and undo workflows;
- durable scheduled assistant goals;
- application authentication;
- coordinated database/evidence backup, export, and restore.

## Verification baseline

The last implementation verification on Windows with Node.js 24.18.0 passed on 2026-07-22:

- `npm run verify`;
- 26 unit/integration tests and 7 Playwright tests;
- TypeScript production build;
- `npm audit --audit-level=moderate` with zero reported vulnerabilities;
- local health endpoint and tailnet-served page;
- live streaming requests from Codex and Grok.

This evidence validates the current infrastructure only. It does not validate the refounded assistant workflows.

## Current documentation milestone

The product constitution, architecture, security model, decision log, and refoundation plan now describe the new direction. No application code or legacy WorkOS data has been changed as part of this documentation milestone.

## Recommended next milestone

Build a read-only WorkOS context bridge and a chief-assistant question workflow:

1. obtain or confirm exact authorization for the legacy source scope;
2. parse supported project, meeting, knowledge, action, and link structures without modifying the source;
3. create a rebuildable local index with provenance;
4. let the chief assistant answer a bounded project or operational question using cited source context;
5. verify representative answers against known WorkOS records;
6. keep all domain mutation disabled until the shared ledger and receipt contract are accepted.

See `docs/ASSISTANT_SYSTEM_REFOUNDATION.md` for the staged plan and acceptance criteria.
