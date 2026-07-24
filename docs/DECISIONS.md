# Decision Log

Each decision is **Active**, **Superseded**, or **Transitional**.

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
