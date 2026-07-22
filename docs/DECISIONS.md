# Decision Log

Each decision is marked **Active**, **Superseded**, or **Transitional**. Superseded decisions remain here so later work does not mistake old implementation choices for unexplained drift.

## 2026-07-22 — Separate repository

**Status: Active**

The application lives in an independent public repository outside the legacy personal vault. This isolates application code, runtime data, secrets, and release history from personal source material.

## 2026-07-22 — Establish the responsive assistant shell before feature expansion

**Status: Active**

The first product-facing design artifact is a responsive chief-assistant workspace rather than a backend-driven collection of forms. The owner accepted this initial shell as the baseline information architecture. Desktop browsers, the owner's Galaxy Tab, and smartphone browsers are equally required targets. They share the same essential workflows while adapting composition: persistent navigation and operational context on wide screens, a context drawer on narrower tablets, and a single-column conversation with bottom navigation on phones.

The chief-assistant conversation is the visual center. Projects, schedule, knowledge, inbox, proposals, evidence, and receipts are supporting inspection and control surfaces. Prototype content must be visibly marked as example data until it is backed by canonical application state.

## 2026-07-22 — Provide explicit development data reset boundaries

**Status: Active, development-stage control**

The owner may clear all AI conversation history or reset all current application data from the settings UI. Both are destructive Govern operations: they require a separate final confirmation step, reject deletion while an AI job is queued or running, and execute as a database transaction. Typed confirmation is deferred while rapid development resets are frequent.

Conversation clearing affects only assistant conversations, messages, and job records. Full reset additionally clears current capture and task records. Neither operation touches CLI authentication, environment configuration, Tailscale configuration, source files, or data outside the application-owned SQLite schema. The reset implementation must be updated explicitly when new canonical tables are introduced.

## 2026-07-22 — Keep legacy WorkOS optional and independent

**Status: Active, clarified by the refoundation**

The legacy vault is historical reference material and a possible future import source, not a runtime, development, test, or product dependency. WorkOS formats do not define the new application's canonical model.

Any future integration begins as an explicitly authorized read-only adapter with provenance and a rebuildable import index. Reading does not authorize migration, rewriting, deletion, or external transmission. The application must remain fully operable when the adapter is absent, and canonical ownership changes require a later reviewed decision.

## 2026-07-22 — No model APIs

**Status: Active**

OpenAI, xAI, and other model APIs are prohibited. AI access uses official locally installed subscription-authenticated Codex and Grok CLIs. Provider behavior remains behind replaceable adapters, and credentials remain owned by the CLI and operating system.

## 2026-07-22 — AI is optional

**Status: Superseded**

The initial product required Capture, Today, complete, defer, search, export, and restore to work without AI. This produced a task application with AI attached rather than a professional-assistant system.

The replacement decision is “AI operates the product” below. Deterministic storage, validation, backup, and recovery remain mandatory, but they support the AI operator rather than define an AI-free user experience.

## 2026-07-22 — AI operates the personal executive office

**Status: Active**

Personal Ops Server is an AI-dependent personal executive office. The owner provides natural-language direction, evidence, values, corrections, and consequential approval. A chief assistant interprets requests, assembles context, delegates specialists, and manages the shared operational world through typed application tools.

If a supported AI provider is unavailable, intelligent work stops, queues, or reports a blocked state. The system preserves coherent state and never fabricates completion.

## 2026-07-22 — One chief assistant with specialist roles

**Status: Active**

The normal user experience has one chief-assistant front door. The first internal specialist roles are project manager and knowledge researcher. The owner may address a role directly, but should not have to route ordinary work manually.

A role exists only when it needs distinct expertise, context, tools, evaluation, or authority. Roles are not chat tabs, personalities, provider choices, or independent databases.

## 2026-07-22 — One shared evidence-backed operational world

**Status: Active**

All roles share application-owned canonical state. Raw evidence, operational state, reusable knowledge, bounded agent memory, and audit state remain distinct. Conversation history and provider memory are not systems of record.

Start with SQLite relation tables, explicit source references, and full-text search. Embeddings, graph traversal, or another storage engine must demonstrate value as derived capabilities before adoption.

## 2026-07-22 — Structured intent for mutations

**Status: Active, expanded**

Agents return schema-constrained domain operations. The application validates authority, current-state preconditions, invariants, idempotency, and conflicts before applying a transaction.

Every committed agent mutation produces a receipt and bounded undo path. Destructive, bulk, external, financial, migration, and policy-changing work uses a separate proposal and approval phase. Models never write SQLite or canonical files directly.

## 2026-07-22 — Private remote access

**Status: Active**

Remote devices connect through Tailscale Serve while Fastify remains bound to localhost. Public port forwarding, public reverse proxies, and Tailscale Funnel are excluded. The current tailnet contains only the owner.

Temporary development access may rely on the owner-only tailnet. Application authentication remains required before consequential integrations, external communication, or wider access.

## 2026-07-22 — Start with a small stack

**Status: Active**

The implementation uses Node.js 24+, TypeScript, Fastify, Node's built-in SQLite, and a dependency-light browser UI. The refoundation adds domain concepts and role orchestration without adopting a generic agent framework by default.

Framework, graph database, vector database, and UI stack expansion require a demonstrated workflow or measured failure of the current stack.

## 2026-07-22 — Use official CLI adapters, not Codex SDK

**Status: Active**

The Codex TypeScript SDK wraps the Codex CLI and its event stream but does not materially improve the accepted CLI-only boundary today. The current adapter uses private app-server stdio for streaming with `codex exec --json` fallback.

Reconsider the SDK only if it provides an accepted capability that cannot be cleanly supported behind the existing adapter, such as a stable application-tool loop or structured turn schema, without weakening the no-model-API constraint.

## 2026-07-22 — Use project-native Playwright

**Status: Active**

CLI development uses Playwright with an isolated Chromium runtime for repeatable layout and workflow checks. Tests use isolated data and keep screenshots, traces, reports, and test databases in ignored paths. Playwright does not access the owner's normal browser profile.

## 2026-07-22 — Persist AI conversations and durable jobs

**Status: Active foundation**

Conversations, messages, and jobs are stored in SQLite. Requests use unique client IDs, provider concurrency controls, explicit job states, cancellation, bounded output, and restart reconciliation. Only sanitized assistant text and state cross the SSE boundary.

The refoundation will retain this infrastructure while adding role invocation, context packages, proposals, approvals, receipts, and scheduled goals.

## 2026-07-22 — One or two durable assistant slots

**Status: Superseded**

The compact two-slot UI was preferable to unlimited consumer-chat history for the initial prototype, but it still modeled assistants as conversation containers. The target UI uses one chief-assistant conversation with specialist activity and object context behind it. Existing conversation archives remain data and may be migrated or retained as historical threads.

## 2026-07-22 — Borrow patterns from Hermes, Letta, and CoWork OS without adopting them

**Status: Active**

Useful reference patterns include a shared core across interaction surfaces, bounded curated memory, skills as procedural context, durable scheduling, isolated delegation, checkpoints, shared memory, evidence-aware state, and governed tools.

The project will not adopt an external runtime wholesale because the product needs an application-specific operational ledger, official CLI-only inference, narrow domain tools, and stricter control over personal evidence. Generic host-terminal access, API-provider assumptions, per-profile data silos, and early self-modifying skills conflict with current boundaries.
