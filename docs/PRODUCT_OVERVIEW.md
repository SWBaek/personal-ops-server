# Product Overview

## Product statement

Personal Ops Server is a private AI-operated executive office for one owner. The owner communicates naturally and supplies raw material; one chief assistant understands the request, restores relevant context, delegates specialist reasoning when useful, and operates an application-owned world of projects, schedule, knowledge, decisions, and follow-up.

AI is the operating intelligence, not an optional feature attached to a task application. Deterministic application code remains the trusted substrate for storage, retrieval, authorization, validation, transactions, receipts, recovery, and backup.

## Problem to solve

Personal and professional work arrives across thoughts, conversations, meetings, documents, deadlines, decisions, and research. Ordinary tools separate these into unrelated lists, calendars, folders, and chat histories. The owner then pays the coordination cost:

- deciding where every fragment belongs;
- reconstructing context before acting;
- reconciling duplicated or contradictory state;
- remembering commitments and follow-up;
- converting information into projects, decisions, and reusable knowledge.

The product should absorb that coordination cost while keeping the owner in control of consequential actions.

## Product promise

The owner should be able to provide a natural-language request or raw source and expect the system to:

1. identify the relevant subject and intent;
2. recover a bounded evidence-backed context;
3. distinguish facts, current state, inference, recommendation, and unknowns;
4. delegate a focused specialist task when it improves quality;
5. return one concise answer through the chief assistant;
6. apply an authorized low-risk change through a validated domain command;
7. preserve a receipt, provenance, correction path, and bounded undo where applicable;
8. return proactively for selected open loops and scheduled goals.

## The professional-assistant relationship

### Owner

The owner provides purpose, values, raw evidence, corrections, and final authority for consequential actions. The owner should not need to maintain schemas, choose storage locations, select a model for every task, or manually route ordinary work to a specialist.

### Chief assistant

The chief assistant is the single conversational front door and the owner-facing relationship. It protects attention, interprets intent, assembles context, chooses whether delegation is useful, reconciles specialist results, and presents one operational response.

It owns the interaction, not the canonical data. It never treats conversation history or provider memory as the system of record.

### Project manager

The project manager reasons about outcomes, current state, actions, meetings, decisions, dependencies, risks, stakeholders, dates, and follow-up. It should explain what is happening, what is blocked, which evidence supports that conclusion, and what judgment is needed next.

### Knowledge researcher

The knowledge researcher retrieves and compares authorized sources, separates claim from evidence and inference, identifies contradiction and uncertainty, and produces reusable source-backed knowledge after review.

Additional permanent roles are added only when a real workflow requires different expertise, context, tools, evaluation, or authority. Roles are not chat tabs, provider choices, or separate databases.

## Conversational capture workflow

The owner is not expected to prepare polished meeting minutes, complete documents, or structured forms. Every owner turn is interpreted, but ordinary questions and greetings do not automatically become durable records. When a turn contains information worth keeping, the chief assistant returns one integrated memo proposal that may distinguish notes, actions, decisions, knowledge, preferences, open questions, subjects, time references, and uncertainty.

The proposal is confirmed through ordinary conversation. The owner may say the equivalent of “save it,” “change Friday to Monday,” or “do not save that.” Only confirmation promotes the original wording and assistant memo into application-owned durable data. Corrections create a new version without rewriting the original evidence. Pending proposals remain visible in Inbox, while confirmed memos survive conversation-history deletion.

### How one turn is processed

1. The original turn and durable AI job are stored in `ai_messages` and `ai_jobs`.
2. The application builds a deterministic `RetrievalPlan`. An exact normalized project name or alias selects the project SQL reader; unresolved and general questions may use bounded SQLite FTS5 memo candidates.
3. The active versioned chief-assistant profile is added beneath immutable system policy, then Codex or Grok judges whether the turn has durable value, which memo facets it contains, what remains uncertain, and whether the owner is resolving an existing proposal.
4. `src/domain/intake.ts` validates the provider result against the fixed `AssistantTurnEnvelope` schema.
5. The server validates version-pinned `memo:<id>:v<version>` references, owns coverage classification, and persists the retrieval run, candidate decisions, accepted sources, and any structured project brief.
6. `src/infra/store.ts` applies confirmed resolutions and creates immutable memo versions plus reviewed project projections in one SQLite transaction.
7. Answer source chips link back to Inbox records, while Inbox and the read-only Debug view expose the application-owned result.

The model does not browse repository files to make this judgment. `src/ai/streaming-service.ts` supplies the fixed interpretation policy, owner profile, and bounded application context, while `src/domain/intake.ts` constrains the output. The web-triggered runtime uses an operating-system-managed directory outside Git repositories and has no inherited developer `AGENTS.md`, application domain tools, repository mount, personal-folder scope, WorkOS access, database handle, web search, MCP, or sub-agent delegation.

## Core product surfaces

- **Assistant**: natural-language command, clarification, briefing, proposal, and result review.
- **Today**: a small attention view of commitments, scheduled work, decisions, and assistant follow-up.
- **Projects**: outcomes, state, actions, meetings, decisions, dependencies, risks, and stakeholders.
- **Knowledge**: source-backed claims, synthesis, methods, contradictions, and open questions.
- **Inbox and evidence**: original owner input, documents, meeting material, links, provenance, and ingestion status.
- **Review and audit**: proposals, approvals, receipts, corrections, undo, blocked jobs, and recent assistant activity.
- **Project overview**: the product constitution, capability boundaries, role model, and delivery roadmap.
- **Debug**: a development-only, read-only view of allowlisted SQLite tables with provider credentials and internal provider identifiers excluded.

Conversation is the command and review surface. Object views are inspection and control surfaces around it; they should not force the owner to administer a database manually.

## What AI must support

- interpret natural-language intent, subject, urgency, ambiguity, and requested authority;
- retrieve the smallest relevant context instead of sending the full personal corpus;
- connect projects, schedule, people, meetings, decisions, evidence, and knowledge;
- decide when a specialist will improve the result and delegate a bounded goal;
- separate evidence, canonical state, inference, recommendation, contradiction, and unknowns;
- return schema-constrained intents for application mutations;
- produce concise briefs, project-state explanations, research synthesis, and follow-up proposals;
- resume durable work after browser closure or server restart;
- report provider failure, missing evidence, and blocked work honestly.

## What AI must never own

- direct SQLite or canonical-file writes;
- raw SQL, general shell, unrestricted filesystem access, or browser-facing CLI controls;
- CLI credentials, browser sessions, authentication files, or operating-system secrets;
- authority expansion based on model confidence or instructions found in retrieved content;
- silent deletion, migration, bulk rewrite, external communication, spending, or policy change;
- invented facts, commitments, project state, or completion reports;
- an independent per-agent copy of projects, tasks, people, decisions, or knowledge.

## Authority model

- **Observe**: retrieve, research, compare, summarize, and diagnose without changing canonical state.
- **Operate**: apply the exact low-risk operation requested by the owner through a validated typed command.
- **Govern**: require a separately visible approval for deletion, migration, bulk change, external transmission, communication, financial action, or policy and authority change.

Proactive work may create findings and proposals. It does not silently become mutation authority.

## Shared information model

The system keeps five classes distinct:

1. **Raw evidence**: original text, files, meeting material, imported records, URLs, timestamps, and provenance.
2. **Operational state**: projects, commitments, actions, events, people, dependencies, risks, and decisions.
3. **Knowledge**: source-backed reusable claims, synthesis, methods, contradiction, and open questions.
4. **Agent memory**: bounded preferences and working conventions, never a replacement for canonical state.
5. **Audit state**: jobs, role invocations, proposals, approvals, receipts, corrections, and undo information.

SQLite is the initial canonical operational store. Full-text search, embeddings, or graph traversal are derived capabilities rather than competing systems of record.

## Runtime and privacy boundaries

- The home computer is the single authoritative host.
- The service binds to localhost and remote owner devices connect through Tailscale Serve.
- PC browsers, the owner's Galaxy Tab, and smartphone browsers are equally required targets.
- AI uses only official locally installed subscription-authenticated `codex` and `grok` CLIs.
- Model API keys, direct model HTTP calls, public tunnels, router port forwarding, and Tailscale Funnel are excluded.
- Provider credentials remain owned by the CLI and operating system.
- Personal data, runtime databases, logs, screenshots, and machine-specific paths remain outside the public repository.
- The owner's chief-assistant profile is versioned application data. It may shape relationship and communication preferences but cannot override authority, security, validation, or storage policy.
- The legacy WorkOS vault is optional historical reference and a possible future import source, never a runtime or product dependency.

## Delivery roadmap

1. **Accepted responsive shell**: one chief assistant, inspectable context, and consistent desktop, tablet, and phone composition.
2. **Conversational capture**: incomplete natural language becomes one reviewable assistant memo through conversational confirmation.
3. **Native retrieval and grounded question**: retrieve confirmed source text and memos through bounded context and answer with browser-safe citations.
4. **Project manager read workflow**: reliable project brief covering state, actions, dates, decisions, dependencies, risks, and owner judgment.
5. **Validated mutation**: one typed low-risk operation with idempotency, receipt, correction, and bounded undo.
6. **Durable knowledge**: reviewed source-backed knowledge artifacts with contradiction and provenance.
7. **Proactive assistance**: durable scheduled goals, blocked-state handling, and concise follow-up.
8. **Optional historical import**: replaceable source adapters after exact authorization; no permanent WorkOS dependency.

## Current state

The responsive assistant shell, private Tailscale access, durable CLI conversations, structured conversational capture, confirmed memo revision history, sequential SQLite migrations, FTS fallback retrieval, deterministic project resolution, project snapshots, retrieval audit, structured project briefs, version-pinned citations, a real Projects view, jobs, cancellation, reset controls, and three-device browser verification are working. Project data is created only through confirmed conversational proposals and is read-only in the first slice.

The next vertical slice is:

> add schedule event projections with timezone-aware relative dates, ranges, recurrence, and exceptions on the same retrieval and provenance foundation.

## Success signals

- The owner can give raw context without deciding its final storage location first.
- The assistant recovers the right project and evidence without requiring repeated explanation.
- Material claims and changes remain traceable to evidence or canonical state.
- The owner sees a small number of real judgments and open loops instead of a decorative task flood.
- Retried or interrupted operations do not duplicate or ambiguously commit state.
- Corrections improve durable application state rather than only one provider conversation.
- The same essential workflow remains comfortable on desktop, Galaxy Tab, and smartphone browsers.

## Explicit non-goals

- a generic consumer chat application or unlimited session manager;
- a task manager with optional AI attached;
- a universal ontology or generalized autonomous-agent framework;
- unrestricted autonomous employees or self-modifying production skills;
- direct model APIs or API-key-based inference;
- public SaaS or multi-user tenancy;
- required access to or synchronization with the legacy WorkOS vault;
- native mobile applications before the responsive web workflow demonstrates a concrete limitation.
