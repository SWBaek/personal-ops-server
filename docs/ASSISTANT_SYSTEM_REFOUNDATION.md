# Assistant System Refoundation

## Purpose

This document translates the new product definition into an implementation sequence. It is a refoundation, not an instruction to rewrite the repository at once.

The goal is to turn the existing durable AI-chat prototype into a private personal executive office that understands the owner's real project and knowledge context, coordinates specialist roles, and performs validated operational work.

## Current implementation status

The first project-read vertical slice is implemented. Confirmed memo proposals can create source-version-pinned project snapshots; deterministic retrieval resolves exact project aliases, reads all current structured facts through SQL, records candidates and coverage, and renders a reload-stable fixed-section brief in the responsive Projects and conversation surfaces. Existing memos remain preserved as `unprojected`, and ambiguous targets fail closed.

This slice proves the shared project read model and provenance boundary. It does not yet implement specialist job delegation, project mutations, receipts, undo, schedule, standalone meeting workflows, durable knowledge, or cross-domain orchestration.

## Directional correction

### Previous center

- Capture and one-to-three tasks as the primary product.
- AI as optional read-only assistance.
- One or two assistants represented by conversation slots.
- Search, project, and knowledge features treated as later additions.

### New center

- One chief assistant as the primary user relationship.
- AI interpretation and judgment as required runtime behavior.
- Project management and knowledge research as first specialist roles.
- Evidence, operational state, knowledge, and audit as shared canonical layers.
- Conversation as the command and review surface, not the source of truth.
- Deterministic code as the safety, validation, transaction, scheduling, and recovery substrate.

## Product hypothesis

The refoundation succeeds if the owner can submit a natural-language question or raw source and the system can:

1. identify the relevant subject without manual filing;
2. recover the right project and knowledge context;
3. distinguish source evidence, current state, inference, and recommendation;
4. delegate a bounded specialist task when useful;
5. return one concise answer with inspectable provenance;
6. later apply a requested change through a validated command with a receipt and undo path.

## Target role contract

### Chief assistant

Owns the interaction, not the data. It determines intent, ambiguity, priority, context needs, delegation, and final synthesis.

Initial allowed work:

- answer questions from authorized indexed context;
- summarize what needs attention and why;
- route a bounded investigation to one specialist;
- present specialist findings and future mutation proposals.

Initial prohibited work:

- direct database or filesystem writes;
- external messaging or publishing;
- destructive or bulk operations;
- inventing commitments to make a project look complete.

### Project manager

Owns project reasoning, not project storage. It works with outcome, current state, actions, meetings, decisions, dependencies, risks, stakeholders, dates, and follow-up.

The first read workflow should answer questions such as:

- What is the current state of this project?
- What is blocking it?
- Which commitment or meeting evidence supports that conclusion?
- What needs the owner's judgment next?

The first mutation workflow should apply one explicitly requested project action change through a typed command and return a receipt.

### Knowledge researcher

Owns research and synthesis, not truth by assertion. It searches authorized internal evidence and, when explicitly enabled for a request, external sources. It separates claims, evidence, inference, contradiction, and open questions.

The first workflow should answer a bounded question using application-native evidence and project context. A later workflow may create a knowledge artifact with provenance after review. Historical WorkOS material may participate only after an optional importer is separately authorized and implemented.

## Shared information model

Use the smallest model that supports the accepted workflows. Do not begin with a universal ontology.

### First read model

- `SourceDocument`: authorized source identity, type, title, timestamps, content hash, and internal source locator.
- `SourceChunk`: retrievable excerpt with document and location provenance.
- `ProjectSnapshot`: source-backed outcome, state, current summary, dates, and source identity.
- `ActionSnapshot`: source-backed wording, completion state, planned date, due date, and project relation.
- `MeetingSnapshot`: scheduled time, related project, processing state, and source identity.
- `KnowledgeSnapshot`: title, summary or full text, related subjects, and source identity.
- `SourceLink`: explicit relation derived from links or supported metadata.

These records form a rebuildable read index. They do not become a competing writable system of record.

### First canonical write model

Add only when the native read, provenance, and context contracts are accepted:

- stable operational IDs;
- projects and their current state;
- commitments/actions;
- events/meetings;
- decisions;
- dependencies and risks;
- evidence references;
- proposals, receipts, corrections, and undo records.

People and richer knowledge structures should enter with the first workflow that needs them rather than through speculative schema work.

## Reuse map

### Keep and extend

- Fastify HTTP and static UI host.
- SQLite connection and migration mechanism.
- durable conversation/message/job tables.
- provider adapters and allowlisted model/reasoning choices.
- sanitized SSE streaming and cancellation.
- idempotent client request handling.
- provider concurrency locks and restart reconciliation.
- Tailscale deployment discipline.
- Playwright workflow and responsive-layout testing.

### Reframe

- `ai_conversations`: interaction threads with the chief assistant, not assistant identities.
- primary/secondary slots: temporary UI state to migrate into a chief-assistant conversation plus subject/work threads.
- Capture: an evidence-ingestion entry point, not an independent product center.
- Tasks: a precursor to commitments/actions, not the complete operational domain.
- AI job runner: a role-capable durable runtime rather than isolated chat completion.

### Do not expand

- unlimited chat-session management;
- assistant identity tied to provider or conversation slot;
- AI-free duplicate workflows;
- browser-facing CLI controls;
- free-form model access to the repository, vault, database, or home directory;
- a generic orchestration framework before a real assistant workflow needs it.

## Delivery sequence

### Phase 0 — Documentation and product boundary

Outcome: every contributor sees the same product and security definition.

Acceptance:

- `AGENTS.md` defines AI-required operation, chief assistant, specialists, shared state, and authority.
- Project, architecture, security, current-state, CLI, and decision documents agree.
- Superseded optional-AI and two-assistant-slot decisions are explicitly marked.
- No code or legacy personal data is changed.

### Phase 1 — Native evidence and context foundation

Outcome: the application can store native evidence, build a private rebuildable read index, and assemble source-neutral context without any legacy data source.

Scope:

- define application-owned `SourceDocument`, `SourceChunk`, provenance, subject, and relationship contracts;
- add versioned SQLite migrations and full-text retrieval;
- ingest native captures and explicitly uploaded or pasted text through a narrow source interface;
- store hashes, source identities, excerpts, trust metadata, and ingestion diagnostics;
- support deterministic rebuild and idempotent re-ingestion;
- expose application-domain queries, never arbitrary browser paths;
- use synthetic fixtures for all repository tests.

Acceptance:

- a clean installation works with no external vault or historical source;
- native captures can become searchable evidence without losing their original text;
- repeat ingestion is idempotent;
- source locators are sanitized before browser delivery;
- deleting or rebuilding the derived index does not delete canonical evidence;
- unit and integration tests use only synthetic content.

### Phase 2 — Chief assistant grounded question workflow

Outcome: the owner can ask one bounded question and receive an answer grounded in application-native indexed context.

Scope:

- replace slot selection with a chief-assistant identity in the main interaction;
- inject the versioned owner profile beneath immutable role, authority, and security policy;
- resolve an explicit project/topic and retrieve a bounded context package;
- run the selected official CLI with read-only role instructions;
- distinguish current state, source evidence, inference, and unknowns;
- return browser-safe citations to indexed source records;
- persist the question, context manifest, role invocation, answer, and job state.

Acceptance:

- answers to representative questions cite the correct source records;
- the model cannot access sources outside the selected context package;
- ambiguous subject resolution asks one useful question rather than guessing;
- provider failure is durable and visible;
- the same workflow works through localhost and Tailscale Serve;
- focused unit, integration, and Playwright tests pass.

### Phase 3 — Project manager read workflow

Outcome: the system produces a reliable operational brief for one project.

The brief covers outcome, current state, open actions, relevant dates, meetings, decisions, dependencies, risks, and owner judgments needed. Missing evidence is reported rather than filled with invented work.

Implemented vertical slice: confirmed conversational project projections, exact alias resolution, source-pinned snapshots, exhaustive SQL reads, server-owned coverage, retrieval audit, structured briefs, and version-pinned source navigation. The remaining delegation/job-graph acceptance items are deferred until a real multi-role workflow requires them.

Acceptance:

- the project manager receives only project-relevant context and tools;
- every material statement is traceable to shared state or evidence;
- contradictory or stale source signals remain visible;
- the chief assistant synthesizes the specialist result into one response;
- role delegation and result return are recorded as one durable job graph or equivalent linked jobs.

### Phase 4 — First validated mutation, receipt, and undo

Outcome: the owner can request one low-risk project operation in natural language and trust the result.

Recommended first operation: create, complete, or reschedule a single known action after a canonical-write strategy is accepted.

Scope:

- structured intent schema;
- target resolution and before-state precondition;
- authority and conflict validation;
- idempotent transaction;
- receipt with semantic before/after;
- bounded undo with divergence check;
- clear distinction between source bridge and new canonical ownership.

Acceptance:

- retry cannot duplicate the operation;
- stale or ambiguous targets fail closed;
- success, rejection, retry, restart, and undo are tested;
- the model never receives direct database or file-write access;
- the UI displays committed state rather than trusting the assistant's prose.

### Phase 5 — Knowledge researcher and durable knowledge

Outcome: a reusable answer can become a source-backed knowledge artifact without losing original evidence.

Scope:

- internal retrieval across authorized evidence and operational context;
- optional external research under explicit source and network scope;
- claim/evidence/inference/open-question structure;
- contradiction detection against existing knowledge;
- reviewed artifact creation and provenance;
- no silent rewrite of original personal thinking or source material.

Acceptance:

- cited sources support the claims attributed to them;
- external and internal sources are distinguishable;
- a knowledge artifact can be corrected without rewriting evidence;
- repeated conversations can retrieve the artifact without depending on provider chat history.

### Phase 6 — Proactive and scheduled assistance

Outcome: the assistant notices selected open loops and returns at the right time.

Start with one durable scheduled goal, such as a project follow-up review or meeting preparation. Scheduling is deterministic; interpretation and briefing are AI-driven.

Acceptance:

- jobs survive browser closure and server restart;
- provider unavailability records a blocked/retryable state;
- proactive work does not mutate canonical state without the authority defined for that job;
- delivery is private, concise, and linked to evidence and receipts.

### Phase 7 — Optional historical-source import

Outcome: selected historical data can be proposed for absorption without making any source system a permanent dependency.

Implement a source-neutral adapter interface first. A WorkOS adapter may then be added as one optional implementation after exact read scope and import behavior are approved.

Acceptance:

- disabling or removing the adapter does not affect native operation;
- source-specific folders, metadata, links, and task syntax stop at the adapter boundary;
- import candidates retain provenance and require an explicit canonical-acceptance policy;
- the source remains unchanged in read-only mode;
- tests use synthetic legacy-shaped fixtures rather than copied personal data.

## Evaluation strategy

Maintain an application-native evaluation set of representative questions and expected evidence targets covering:

- project-state recovery;
- action and due-date distinction;
- meeting follow-up;
- waiting or blocked dependencies;
- reusable knowledge retrieval;
- conflicting evidence;
- ambiguous subjects;
- owner corrections.

All repository tests use synthetic data. If separately authorized later, selected historical WorkOS scenarios may provide an optional private regression corpus, but they are never required for the baseline suite. Evaluation should inspect retrieval targets, structured intents, receipts, and committed state—not only the fluency of the final response.

## Decisions deferred on purpose

- migration of accepted canonical records between storage representations;
- embeddings and vector search;
- graph database or generalized temporal graph;
- additional permanent agent roles;
- self-created or self-improving skills;
- email and calendar write integrations;
- voice input;
- autonomous external communication;
- native mobile applications;
- adoption of Hermes, Letta, CoWork OS, or another general agent runtime.
- optional WorkOS or other historical-source import adapters.

Each is reconsidered only when an accepted workflow exposes a concrete limitation.

## Immediate next design artifacts

The next accepted slice extends the same projection, retrieval, coverage, audit, and responsive-source pattern to schedule:

1. define event projection with source-version provenance;
2. interpret relative dates against the stored IANA owner timezone;
3. distinguish point events, ranges, recurrence, and exceptions;
4. define deterministic schedule retrieval plans and completeness rules;
5. verify localhost and Tailscale interaction on desktop, Galaxy Tab, and smartphone;
6. keep the view read-only until its context contract is accepted.

After schedule, extend the foundation in order to standalone meeting detail, durable knowledge, then stable-ID cross-domain orchestration. Historical import, general multi-agent orchestration, and mutations remain outside these read slices.
