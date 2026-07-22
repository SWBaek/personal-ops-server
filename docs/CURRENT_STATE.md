# Current State

Updated: 2026-07-22

## Product status

The product direction has been reset.

The repository was initially implemented as a small personal task service with optional AI chat. That concept is now superseded. The target is an AI-dependent personal executive office with one chief-assistant front door, specialist roles, a shared evidence-backed operational ledger, typed mutations, receipts, and proactive follow-up.

The running application now presents the accepted baseline information architecture for the target product experience. Its responsive shell represents the intended hierarchy, but most operational content is visibly marked example data and is not yet backed by the target domain model.

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
- A chief-assistant-centered responsive shell for desktop, Galaxy Tab, and smartphone browsers.
- Playwright Chromium coverage for the three device classes, context-drawer behavior, streaming, reload recovery, and browser API fallback.
- Two-step development controls for clearing AI history or resetting all current application data without touching CLI, environment, or Tailscale configuration.
- A viewport-fixed mobile shell where long conversations scroll inside the conversation region while the composer and bottom navigation remain reachable.
- Type checking, unit/integration tests, production build, and verification scripts.

## Transitional or superseded product behavior

- Capture and Task APIs remain in the backend but are no longer the visual center.
- AI is read-only and cannot retrieve or operate on real project or knowledge context.
- The primary/secondary assistant-slot schema remains transitional backend state; the UI presents one chief assistant.
- The briefing, project progress, approval, and recent-activity content in the new shell is labeled prototype data rather than canonical state.
- Projects, people, meetings, decisions, dependencies, risks, knowledge artifacts, evidence provenance, receipts, and corrections do not exist in the application domain.
- Current project documentation previously required useful operation without AI; that requirement is superseded.
- No legacy WorkOS vault is required or connected. This is the intended default, not a missing runtime dependency.

Do not expand these transitional behaviors as if they were the target architecture.

## Deliberately not implemented

- chief-assistant orchestration;
- specialist role execution;
- goal-specific context building;
- typed agent domain tools;
- shared operational ledger beyond primitive tasks;
- evidence ingestion and provenance;
- project, meeting, person, decision, dependency, risk, and knowledge models;
- optional historical-source adapters, including a possible WorkOS importer;
- proposal, approval, receipt, correction, and undo workflows;
- durable scheduled assistant goals;
- application authentication;
- coordinated database/evidence backup, export, and restore.

## Verification baseline

The last implementation verification on Windows with Node.js 24.18.0 passed on 2026-07-22:

- `npm run verify`;
- 30 unit/integration tests and 10 Playwright tests;
- TypeScript production build;
- `npm audit --audit-level=moderate` with zero reported vulnerabilities;
- local health endpoint and tailnet-served page;
- live streaming requests from Codex and Grok.

This evidence validates the current infrastructure only. It does not validate the refounded assistant workflows.

## Current UI milestone

The product constitution and first responsive information architecture now point in the same direction. The browser places one chief-assistant conversation at the center, keeps model controls secondary, and exposes operational context without requiring it to occupy the phone viewport. No legacy WorkOS data is connected or required.

## Recommended next milestone

Build an application-native evidence/context foundation and one grounded chief-assistant question workflow:

1. define source-neutral evidence, excerpt, provenance, and subject contracts;
2. add versioned SQLite migrations and a rebuildable full-text read index;
3. ingest native captures or synthetic development documents through an application-owned source interface;
4. build a bounded context package for one explicit project or topic;
5. let the chief assistant answer with browser-safe citations to that context;
6. verify the workflow using synthetic fixtures that require no personal or legacy data;
7. keep domain mutation and optional historical import disabled until the native contracts are accepted.

See `docs/ASSISTANT_SYSTEM_REFOUNDATION.md` for the staged plan and acceptance criteria.
