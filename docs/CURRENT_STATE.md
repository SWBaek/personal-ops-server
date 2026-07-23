# Current State

Updated: 2026-07-23

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
- Explicit provider switching that archives the current provider-native context and starts a clean context in the same chief-assistant slot.
- SQLite-backed conversations, messages, idempotent jobs, sanitized SSE, cancellation, and restart recovery.
- Codex app-server text deltas over private stdio with buffered `codex exec` fallback; Grok streaming JSON.
- Environment-separated managed AI runtime outside Git repositories, Codex parent-project discovery disabled, provider concurrency locks, two-minute timeout, and bounded output.
- A versioned owner-configured chief-assistant profile for name, form of address, role, communication style, and working principles.
- A chief-assistant-centered responsive shell for desktop, Galaxy Tab, and smartphone browsers.
- A responsive Project Overview tab that explains the product purpose, professional-assistant roles, intended capabilities, AI contract, shared data classes, boundaries, and roadmap.
- A structured conversational capture pipeline that proposes one integrated assistant memo from incomplete natural language and accepts confirmation, correction, or rejection through conversation.
- Confirmed assistant memos with preserved source wording, immutable revisions, and a responsive Inbox view.
- An allowlisted read-only Debug view for inspecting SQLite conversations, messages, jobs, proposals, memos, versions, captures, and tasks without exposing provider internals.
- A Project Overview process map that identifies the AI judgment policy, bounded context inputs, validation contract, and transactional storage path.
- Playwright Chromium coverage for the three device classes, context-drawer behavior, streaming, reload recovery, and browser API fallback.
- Two-step development controls for clearing AI history or resetting all current application data without touching CLI, environment, or Tailscale configuration.
- A viewport-fixed mobile shell where long conversations scroll inside the conversation region while the composer and bottom navigation remain reachable.
- Type checking, unit/integration tests, production build, and verification scripts.

## Transitional or superseded product behavior

- Capture and Task APIs remain in the backend but are no longer the visual center.
- AI can propose and resolve assistant memos but cannot retrieve grounded project or knowledge context or mutate those future domains.
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

The last implementation verification on Windows with Node.js 24.18.0 passed on 2026-07-23:

- `npm run verify`;
- 38 unit/integration tests and 16 Playwright tests;
- TypeScript production build;
- `npm audit --audit-level=moderate` with zero reported vulnerabilities;
- local health endpoint and tailnet-served page;
- live streaming requests from Codex and Grok.

This evidence validates the current infrastructure only. It does not validate the refounded assistant workflows.

## Current UI milestone

The product constitution and first responsive information architecture now point in the same direction. The browser places one chief-assistant conversation at the center, keeps model controls secondary, exposes operational context without requiring it to occupy the phone viewport, and provides a Project Overview reference from desktop and mobile navigation. No legacy WorkOS data is connected or required.

## Recommended next milestone

Build one grounded chief-assistant question workflow over confirmed conversational material:

1. index confirmed source wording and assistant memo fields with rebuildable SQLite FTS;
2. retrieve a small set of relevant memo versions for one explicit topic;
3. build a bounded context package that keeps source wording separate from assistant interpretation;
4. let the chief assistant answer with browser-safe links back to Inbox records;
5. report missing or conflicting evidence rather than inventing project state;
6. verify retrieval with synthetic fixtures before introducing project-domain mutation.

See `docs/ASSISTANT_SYSTEM_REFOUNDATION.md` for the staged plan and acceptance criteria.
