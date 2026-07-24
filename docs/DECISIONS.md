# Decision Log

Each decision is **Active**, **Superseded**, or **Transitional**.

## 2026-07-24 — Grok completion permits only compatible trailing envelopes

**Status: Active**

GitHub Issue: #29.

Grok direct answers still require `end` with `stopReason: EndTurn`. After that event, the adapter may accept a `result` envelope only when any included answer exactly matches the already completed final segment, plus a content-free `usage` envelope. Later text, thought, tool, mismatched result, or unknown events remain failures. This preserves terminal integrity across CLI envelope changes without storing or exposing provider traces.

## 2026-07-24 — Owner-visible tool traces are permitted on the private tailnet

**Status: Superseded by AI liveness signal policy below**

The browser may expose otherwise hidden AI tool traces so the owner can inspect long-running work and diagnose provider behavior. This is permitted only on the authenticated owner-only private tailnet surface; it does not authorize public exposure.

Tool traces remain untrusted evidence and cannot expand agent authority. Chain-of-thought, credentials, tokens, raw stderr, environment dumps, provider diagnostics, and provider session identifiers remain prohibited. This decision changes policy only; a trace UI requires a separate implementation with bounded output and secret filtering.

## 2026-07-24 — AI liveness uses three factual signals

**Status: Active**

GitHub Issue: #27.

The interface reports browser/server connectivity, server-managed CLI process state, and the age of the last structured provider event separately. It does not infer percentage progress. Fifteen and sixty seconds without a provider signal produce informational quiet and delayed labels; only the existing 300-second provider timeout is a failure boundary.

Provider JSONL is decoded incrementally, but event bodies never cross the adapter boundary. Only the server-defined phases starting, WorkOS checking, answer composition, validation, and local receipt commit are exposed. This decision retires the earlier allowance for hidden tool traces in the browser.

## 2026-07-24 — Provider terminal events own direct-answer completion

**Status: Active**

Assistant text is not itself proof that a direct-answer turn completed. Codex must emit `turn.completed`; Grok must emit a terminal `end` event with `stopReason: EndTurn`. Missing completion, max-turn exhaustion, malformed streams, and events after completion fail the durable job.

Grok uses official streaming JSON so intermediate progress narration can be separated from the final text segment. Its direct-answer process runs in headless `dontAsk` mode with explicit read, search, and shell permission, an edit deny rule, and the read-only sandbox. This replaces the contradictory `plan` plus `--no-plan` invocation that prevented multi-step WorkOS inspection.

## 2026-07-24 — Every CLI invocation pins a concrete model

**Status: Active**

The model selector contains only concrete model identifiers confirmed by the installed CLIs. The application neither displays nor accepts a generic `default` model and passes `--model` on every direct-answer, planning, and execution invocation.

Codex initially selects `gpt-5.6-sol`; Grok initially selects its sole listed model, `grok-4.5`. SQLite schema version 2 replaces legacy `default` ledger values with these provider-specific identifiers. This makes stored job provenance stable across CLI default changes while keeping provider catalogs behind a versioned application contract.

## 2026-07-24 — Semantic variable-font stacks with resilient CDN loading

**Status: Active**

Pretendard Variable is the default family for UI controls, headings, prose, and tables. JetBrains Mono Variable is reserved for code, logs, paths, commands, diffs, and identifiers.

The browser loads version-pinned font stylesheets from a public font CDN. No WorkOS or conversation content is placed in font URLs. Both families have local system fallbacks, and application startup, conversation, and responsive layout must remain functional when CDN requests fail.

## 2026-07-24 — Preserve Markdown evidence; sanitize only at presentation

**Status: Active**

The application stores and transports the provider’s original Markdown unchanged. Assistant messages are parsed and sanitized only in the browser presentation layer. Generated HTML is not canonical state and is not persisted.

The renderer uses an explicit HTML element and attribute allowlist. Images, scripts, event attributes, embedded content, styles, and unsafe link protocols are excluded. Owner messages remain plain text. Tables and code blocks scroll within the message rather than widening the application page.

## 2026-07-24 — WorkOS is the required canonical system

**Status: Active**

The configured WorkOS root is the source of truth for projects, schedule, tasks, meetings, decisions, and knowledge. The web application does not maintain a parallel operational model in SQLite.

This supersedes the application-native project, memo, FTS, projection, snapshot, and coverage architecture.

## 2026-07-24 — Direct CLI work in the WorkOS root

**Status: Active**

Codex and Grok run with WorkOS as their working directory so they receive the same `AGENTS.md`, PKM specification, skills, and files as an owner-started CLI session. Provider behavior stays behind adapters and uses a common structured plan/result contract.

The application repository’s development policy is not the product assistant role.

## 2026-07-24 — One-call direct answers; structured planning only for mutations

**Status: Active**

Ordinary questions invoke the selected CLI exactly once with read-only permissions, no structured output schema, and no server-authored answer rewrite. The application removes provider transport framing and persists the final assistant text unchanged. Ambiguous requests default to this read-only path.

An explicit file-changing command begins with a structured read-only preflight. Operate applies an exact low-risk request. Govern covers policy, deletion, moves, bulk changes, external capabilities, and other high-impact work and requires a separate visible approval.

The server owns risk escalation and validates actual changed paths.

## 2026-07-24 — Local Git receipts; remote Git optional

**Status: Active**

WorkOS is primarily synchronized through Obsidian Sync. Git remote upload, push, pull, and hosting are optional.

Local Git remains required only for transaction safety. Mutations require a clean worktree, successful changes become one application-owned local commit, receipts expose the diff, and the latest compatible receipt can be undone with `git revert`. The provider and application do not automatically push.

## 2026-07-24 — SQLite is a runtime ledger only

**Status: Active**

SQLite stores configuration, profile, conversation, messages, jobs, plans, approvals, activity, and receipts. It does not store WorkOS content or duplicate operational domains.

## 2026-07-24 — One assistant timeline with provider segments

**Status: Active**

The owner sees one durable timeline. Switching between Codex and Grok creates a visible provider segment without pretending that provider-native hidden context transfers.

## 2026-07-24 — External capabilities disabled by default

**Status: Active**

Web search, MCP/apps, subagents, external review, and remote Git are unavailable by default. A concrete later workflow may request one capability through Govern approval.

## 2026-07-24 — Obsidian Sync remains independent

**Status: Active**

The application neither configures nor monitors Obsidian Sync in this milestone. A local receipt commit does not represent sync completion, and Git state is not used to infer Obsidian Sync state.

## 2026-07-24 — Private web access

**Status: Active**

Fastify binds to localhost. Tailscale Serve provides owner-only HTTPS on an explicit port. Funnel, public tunnels, and router forwarding are excluded.

## 2026-07-24 — GitHub Issues are the development record

**Status: Active**

Every material issue or feature is tracked in GitHub. Problem definition, solution discussion, strategy changes, implementation links, and verification results belong in the Issue and linked PR rather than private local-only notes.

## 2026-07-22 — No model APIs

**Status: Active**

Only official locally authenticated Codex and Grok CLIs are allowed. Model API keys and SDK/direct HTTP model calls are prohibited.

## 2026-07-23 — SQLite project retrieval and structured briefs

**Status: Superseded**

The system previously converted confirmed memos into project snapshots and used SQL/FTS retrieval coverage. It was removed because maintaining a second interpretation of WorkOS could omit facts and required ongoing domain-specific tuning.

## 2026-07-22 — Application-owned operational world

**Status: Superseded**

The previous refoundation treated WorkOS as optional historical input and SQLite as canonical. The accepted product now requires WorkOS and keeps SQLite strictly for runtime/audit state.
