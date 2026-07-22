# Architecture

## Target system

The home computer is the single authoritative host. Personal devices connect through the owner's private tailnet. The browser presents one chief-assistant conversation plus inspectable operational views. Specialist roles operate behind the chief assistant and share one application-owned world model.

```text
Phone / Tablet / Remote PC
            |
       private tailnet
            |
    Tailscale Serve (HTTPS)
            |
  Fastify on 127.0.0.1:4310
            |
  Conversation and Command Gateway
            |
   Chief Assistant Orchestrator
       |                 |
 Project Manager   Knowledge Researcher
       \                 /
        Context and Domain Tools
                 |
 Intent → Policy → Validation → Commit
                 |
  Evidence | Operational Ledger | Knowledge
                 |
    Jobs | Receipts | Corrections | Audit
                 |
      Codex / Grok CLI adapters
```

The diagram describes responsibility, not a requirement for separate processes. The first implementation may run the chief assistant and specialists through the same durable job runner with different role instructions, context builders, and tool allowlists.

## Architectural invariants

1. There is one canonical operational state.
2. An agent role never owns a private copy of a project, action, person, event, decision, or knowledge artifact.
3. Models cannot write canonical state directly.
4. Every mutation crosses an application-owned typed command boundary.
5. Evidence, interpretation, proposal, and committed state remain distinguishable.
6. Conversation and provider thread history are not canonical memory.
7. Provider failure may stop intelligent work but must not corrupt or ambiguously commit state.
8. The browser never exposes a general shell or provider-control protocol.

## Layers

### Browser UI

The primary surface is one durable chief-assistant conversation. The UI also exposes object views for Projects, Schedule, Knowledge, Inbox/Evidence, Reviews, and Receipts.

The owner may address a specialist directly as an advanced shortcut, but should not need to select a role for ordinary requests. Model and reasoning controls remain secondary. Progress displays the job and role currently working, while final results show evidence and committed changes rather than raw internal traces.

The existing two-slot assistant UI is transitional infrastructure, not the target information architecture.

### Conversation and command gateway

Fastify owns request validation, conversation persistence, streaming, cancellation, authentication middleware, static assets, and APIs. It binds to localhost.

The gateway converts a user turn into a durable assistant job. It supplies the chief assistant with the active subject, relevant shared state, source references, available domain tools, and the authority envelope for the request.

### Chief assistant orchestrator

The chief assistant performs four responsibilities:

1. identify intent, subject, ambiguity, and risk;
2. request the smallest relevant context package;
3. delegate bounded specialist work when it improves quality or context isolation;
4. reconcile findings and proposals into one owner-facing result.

Delegation is not required for simple work. A specialist receives only its goal, selected evidence, relevant state, tools, and authority. It cannot expand these scopes or write shared memory outside typed operations.

### Specialist roles

The first roles are configuration and policy boundaries over a common runtime:

- **Project manager**: project status, actions, meetings, dependencies, risks, decisions, stakeholder context, and follow-up.
- **Knowledge researcher**: internal retrieval, external research when authorized, source comparison, claim/evidence separation, contradictions, and reusable knowledge artifacts.

Future roles require a documented need for different tools, context, evaluation, or authority. Personality alone is not enough to create another agent.

### Context builder

The context builder assembles a goal-specific package rather than exposing the whole personal corpus. Inputs may include:

- the owner's bounded profile and preferences;
- the named or inferred project, person, event, or knowledge topic;
- current commitments, dependencies, risks, and decisions;
- exact evidence excerpts and provenance;
- recent receipts, corrections, and unresolved proposals;
- the role's policy and permitted domain tools.

Start with deterministic relational and full-text retrieval. Add embeddings or graph traversal only after measured retrieval failures justify them.

### Domain service and intent pipeline

Agents call typed application tools such as:

- `get_project_brief`
- `search_evidence`
- `propose_action`
- `reschedule_action`
- `record_decision`
- `record_dependency`
- `create_knowledge_artifact`
- `link_source`

Tool names are illustrative until the domain contract is accepted.

Mutation flow:

```text
agent-generated structured intent
  → schema validation
  → authority and risk policy
  → domain invariant validation
  → idempotency and conflict check
  → transaction commit
  → receipt and undo record
  → projection refresh
```

No model receives raw SQL or a filesystem path as a mutation interface.

### Data model

SQLite remains the initial canonical operational store. The refoundation introduces explicit classes instead of forcing all data into tasks or conversations.

#### Evidence

Original capture text, imported records, meeting material, files, URLs, content hashes, timestamps, source type, trust zone, and ingestion state. Evidence is preserved and not silently rewritten by synthesis.

#### Operational ledger

Projects, actions/commitments, events, people, dependencies, risks, decisions, relationships, and their current state. Important records carry stable IDs and source references.

#### Knowledge

Source-backed artifacts containing claims, evidence, inference, contradictions, and open questions. Knowledge may be revised while preserving provenance and history.

#### Agent and audit state

Conversations, messages, jobs, role invocations, proposals, approvals, receipts, corrections, and provider-thread mappings. Agent memory contains only bounded preferences and learned procedures; it does not duplicate the operational ledger.

SQLite relation tables and FTS are the default. A graph database or embedding index is a derived optimization, never a second source of truth.

### AI runtime and adapters

Adapters call installed binaries only:

- Codex: private app-server stdio text events with stable `codex exec` fallback.
- Grok: official Grok Build headless streaming JSON.

Provider adapters expose capabilities, not product roles. The role runtime supplies instructions, context, tools, and schemas independently of the chosen provider.

The current read-only runner uses a fixed empty working directory and no domain tools. During refoundation it will evolve into an application-tool loop; broad filesystem or shell access will remain unavailable to web-triggered assistant roles.

### Durable work and scheduling

All assistant turns and scheduled operations use durable jobs with:

- explicit queued, running, waiting-for-approval, blocked, failed, cancelled, and completed states;
- provider and mutation concurrency limits;
- timeouts and bounded captured output;
- idempotency keys and restart reconciliation;
- evidence of what was attempted and what committed;
- safe separation between proposal and apply phases.

Scheduled jobs trigger an assistant goal with a fresh bounded context package. They do not depend on an open browser or an indefinitely growing chat history.

## Source adapters and optional historical import

The application owns a source-neutral evidence contract. Normal operation begins with native capture and application-managed records and never requires a legacy vault, synchronized folder, or external source system.

Source adapters may later ingest explicitly authorized historical or external material. An adapter:

1. maps source-specific records into application-owned evidence and import candidates;
2. keeps source format and location details outside the canonical domain model;
3. records provenance, content hashes, diagnostics, and source identity;
4. builds a replaceable derived import index;
5. remains removable without disabling native operation or invalidating already accepted canonical records.

A legacy WorkOS adapter is one optional implementation of this interface. It is not the default repository, benchmark requirement, runtime mount, or source of domain rules. Its first authorized mode must be read-only. No migration, deletion, rewrite, or external transmission follows from read authorization, and canonical ownership moves only through a later reviewed import decision.

## Remote access

The server stays on `127.0.0.1` and Tailscale Serve proxies private HTTPS. Public port forwarding and Tailscale Funnel are excluded.

The current tailnet has one owner and no other members. Temporary development access may rely on this boundary. Application authentication remains required before external communications, high-impact mutations, or a broader network/user scope is enabled.

## Backup and recovery

The canonical database, evidence store, and configuration need coordinated backup. Export produces readable Markdown and JSON in addition to SQLite backup. Restore tests must cover evidence references, operational state, receipts, and pending job reconciliation.

The product does not promise AI-free operation. Recovery guarantees that when AI returns, the assistants resume from coherent shared state rather than reconstructing the owner's world from chat history.
