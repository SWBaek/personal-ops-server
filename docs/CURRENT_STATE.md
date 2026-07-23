# Current State

Updated: 2026-07-23

## Product status

The product direction has been reset.

The repository was initially implemented as a small personal task service with optional AI chat. That concept is now superseded. The target is an AI-dependent personal executive office with one chief-assistant front door, specialist roles, a shared evidence-backed operational ledger, typed mutations, receipts, and proactive follow-up.

The running application now presents the accepted information architecture and the first real operational object view. Projects are backed by confirmed, source-version-pinned application data; schedule, knowledge, review, receipts, and most contextual summaries remain future work.

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
- Rebuildable SQLite FTS5 retrieval over confirmed memo current versions, with bounded source/interpretation context packages.
- Grounded, insufficient, and conflicting answer states with server-validated memo citations and browser-safe Inbox links.
- Sequential `PRAGMA user_version` migrations that preserve existing databases and classify pre-project memos as `unprojected`.
- Reviewed `projectProjections` on memo proposals and versions, stable projects with normalized aliases, and source-pinned rebuildable project/action/decision/dependency/risk/meeting/judgment snapshots.
- Deterministic `RetrievalPlan` generation, exact longest alias resolution, SQL project readers, FTS fallback, persisted retrieval runs/candidates, and server-owned `unknown`/`partial`/`complete` coverage.
- Structured project briefs with fixed sections, exact `memo:<id>:v<version>` references, reload-stable message JSON, and closed-world claim protection when coverage is incomplete.
- Real read-only Projects APIs and a responsive Projects view: desktop list/detail panes, tablet and phone list-to-detail navigation, coverage banners, briefing prompts, and version-pinned source navigation.
- An allowlisted read-only Debug view for inspecting SQLite conversations, messages, jobs, proposals, memos, versions, captures, and tasks without exposing provider internals.
- A Project Overview process map that identifies the AI judgment policy, bounded context inputs, validation contract, and transactional storage path.
- Playwright Chromium coverage for the three device classes, context-drawer behavior, streaming, reload recovery, and browser API fallback.
- Two-step development controls for clearing AI history or resetting all current application data without touching CLI, environment, or Tailscale configuration.
- A viewport-fixed mobile shell where long conversations scroll inside the conversation region while the composer and bottom navigation remain reachable.
- Type checking, unit/integration tests, production build, and verification scripts.

## Transitional or superseded product behavior

- Capture and Task APIs remain in the backend but are no longer the visual center.
- AI can retrieve grounded project-domain state but cannot mutate project or future operational domains.
- The primary/secondary assistant-slot schema remains transitional backend state; the UI presents one chief assistant.
- Schedule, knowledge, review, receipts, and proactive context surfaces are not yet backed by their target domains.
- People, standalone event/meeting workflows, knowledge artifacts, richer evidence provenance, receipts, and corrections do not exist in the application domain.
- Current project documentation previously required useful operation without AI; that requirement is superseded.
- No legacy WorkOS vault is required or connected. This is the intended default, not a missing runtime dependency.

Do not expand these transitional behaviors as if they were the target architecture.

## Deliberately not implemented

- chief-assistant orchestration;
- specialist role execution;
- schedule, knowledge, and cross-domain context building beyond the project reader;
- typed agent domain tools;
- shared operational ledger beyond primitive tasks;
- evidence ingestion beyond confirmed conversational text;
- standalone event, person, meeting, and knowledge models;
- optional historical-source adapters, including a possible WorkOS importer;
- proposal, approval, receipt, correction, and undo workflows;
- durable scheduled assistant goals;
- application authentication;
- coordinated database/evidence backup, export, and restore.

## Verification baseline

The project-read implementation verification on Windows with Node.js 24 passed on 2026-07-23:

- `npm run verify`;
- 48 unit/integration tests and 19 Playwright tests;
- TypeScript production build;
- `npm audit --audit-level=moderate` with zero reported vulnerabilities;
- local health endpoint and tailnet-served page;
- provider-independent RetrievalPlan and manifest fixtures for Codex and Grok;
- visual Projects verification at desktop, Galaxy Tab, and smartphone viewports.

This evidence validates the conversational project creation, deterministic retrieval, structured brief, version-pinned source, reset, migration, and responsive Projects workflows. It does not validate future mutations or other domains.

## Current UI milestone

The browser now completes one project-manager read loop: provide project facts, confirm the integrated memo proposal, inspect the created project, ask for a fixed-section brief, review coverage and version-pinned sources, reload the same structured answer, and open the exact historical Inbox version. Missing, unresolved, filtered, and truncated evidence remain inspectable. No legacy WorkOS data is connected or required.

## Recommended next milestone

Extend the accepted retrieval/projection foundation to schedule:

1. define event projection and source-version provenance;
2. interpret relative dates in the owner’s stored IANA timezone;
3. distinguish point events, ranges, recurrence, and exceptions;
4. persist deterministic schedule retrieval plans and coverage;
5. render the same essential schedule workflow on desktop, Galaxy Tab, and smartphone;
6. keep it read-only until its context contract is accepted.

See `docs/ASSISTANT_SYSTEM_REFOUNDATION.md` for the staged plan and acceptance criteria.
