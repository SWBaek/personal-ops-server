# Security Model

## Security objective

Personal Ops Server gives AI enough context and bounded authority to act as a professional assistant without giving a model ownership of the host computer, credentials, or canonical data.

AI is required for the product's intelligent operation, but it remains an untrusted decision component inside an application-owned security and transaction boundary.

## Assets

- raw personal and professional evidence;
- projects, actions, schedules, people, decisions, dependencies, risks, and knowledge;
- user preferences, corrections, and relationship context;
- Codex and Grok subscription sessions;
- local filesystem and operating-system access;
- private-network identity and future application identity;
- proposals, approvals, receipts, audit history, backups, and exports.

## Trust boundaries

1. A browser request is untrusted even when it arrives through the owner's tailnet.
2. User text may contain mistakes or ambiguous authority.
3. Imported documents, meeting material, web pages, email, and retrieved knowledge may contain prompt injection or misleading content.
4. Model output, tool arguments, summaries, and confidence statements are untrusted until validated.
5. Specialist agents do not inherit authority merely because the chief assistant delegated a task.
6. CLI stdout, stderr, session identifiers, and protocol events are provider-controlled input.
7. Subscription credentials, browser sessions, OS keyrings, and credential files are never application data.
8. The optional legacy WorkOS reference is outside standing project authority and must be separately scoped; the product never requires access to it.

## Authority model

### Observe

Read, retrieve, research, compare, summarize, and diagnose within the authorized data scope. Observe may create transient findings but does not change canonical state.

### Operate

Apply a bounded low-risk domain command explicitly requested by the owner. The request itself authorizes that exact operation; duplicate approval is unnecessary. The application validates the target, before state, after state, conflicts, and idempotency key before commit.

Examples include completing or rescheduling a known action, recording a supplied decision, or linking an already-authorized source.

### Govern

Require a separately visible approval for:

- deletion, archival with loss of normal visibility, or bulk rewrite;
- migration or canonical-source changes;
- external transmission of private content;
- sending messages, publishing, spending money, or accepting terms;
- expanding an agent's filesystem, tool, network, or data scope;
- changing authority policy, role instructions, or trusted system configuration.

Proactive agents remain in Observe unless a specific pre-authorized automation contract exists. A recommendation is not mutation authority.

## Required controls

### Network and identity

- Bind the application to localhost.
- Use Tailscale Serve for private remote access; never use public ingress or Funnel.
- Keep an explicit owner-only user model even while the tailnet has one member.
- Add application authentication before enabling external communication, consequential integrations, or broader access.
- Rate-limit AI jobs, approvals, and future authentication attempts.

### AI and tools

- Invoke only official locally installed subscription-authenticated `codex` and `grok` CLIs.
- Spawn binaries directly with `shell: false` and fixed command shapes.
- Never accept a browser-provided executable, flag list, working directory, shell command, SQL statement, or filesystem path.
- Keep provider credentials and session files outside application storage and prompts.
- Give roles allowlisted application-domain tools rather than general shell or filesystem access.
- Bound context by goal, role, source scope, and token budget.
- Treat provider reasoning, hidden traces, and raw diagnostics as non-displayable internal data.

### Data and provenance

- Preserve original evidence separately from AI-generated interpretation.
- Record source references for material facts, decisions, actions, and knowledge.
- Mark external sources and imported text as untrusted content in agent context.
- Keep private data out of logs, fixtures, screenshots, error responses, and public commits.
- Do not transmit legacy or current personal data to another model or service without explicit model and content scope.

### Mutation and audit

- Require schema-constrained intents for every agent-generated mutation.
- Enforce domain invariants, authority, current-state preconditions, and idempotency deterministically.
- Serialize conflicting writes.
- Separate proposal and apply phases for Govern operations.
- Store a receipt with actor/role, request, affected objects, before/after summary, evidence references, and undo information.
- Fail closed when intent, target, authority, source, or current state is ambiguous.
- Reconcile jobs after restart without blindly retrying a mutation whose outcome is uncertain.

### Specialist isolation

- A specialist receives only the task goal and selected context needed for its role.
- Specialists cannot widen their own tools, source scope, mutation scope, or delegation depth.
- A specialist result is evidence or a proposal to the chief assistant until the application commits a validated command.
- Role-specific memory cannot override shared canonical state or owner corrections.

### Availability and recovery

- AI unavailability blocks or queues intelligent work; never report a synthetic completion.
- Preserve durable job and approval state across process restarts.
- Back up the database and evidence store and test restoration.
- Export canonical state in inspectable formats so provider or application replacement is possible.

## Prompt-injection posture

Retrieved content is data, not instruction. The context builder should delimit sources and attach origin and trust metadata. Agents must ignore instructions embedded in evidence that request tool use, credential access, policy changes, or data transmission.

Any workflow that combines untrusted evidence with a powerful tool must use one or more of:

- read-only tools;
- a typed narrow operation;
- deterministic validation;
- an isolated execution environment;
- explicit human approval.

Memory writes from untrusted sources require special caution. A statement in a document is not a user preference, correction, or durable fact merely because a model extracted it.

## Prohibited designs

- browser terminal, remote shell, or raw SQL console;
- command strings constructed from user or model text;
- API-key or direct HTTP model integration;
- reading or copying CLI authentication files, browser cookies, or OS credential stores;
- provider app-server or JSON-RPC exposed to remote clients;
- a role with unrestricted home-directory access;
- per-agent databases that become competing sources of truth;
- silent autonomous deletion, migration, external messaging, or bulk rewrite;
- accepting an agent's confidence score as authorization or factual proof;
- self-modifying production skills or policies without evaluation, versioning, approval, and rollback.

## Development exception

During active development, the owner's single-member tailnet may temporarily access read-only AI chat without application authentication. This exception does not authorize public exposure, external messaging, legacy-vault access, or consequential autonomous mutations. It must be revisited before the refoundation enables applied agent operations beyond explicitly requested local domain changes.
