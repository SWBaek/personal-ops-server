# Decision Log

## 2026-07-22 — Separate repository

The application lives in an independent repository outside any legacy personal vault. This prevents vault-specific schemas, agent rules, and dirty worktree state from affecting application development.

## 2026-07-22 — Preserve, do not migrate, the legacy vault

Any existing legacy vault remains an independent read-only archive. No automatic indexing or migration is authorized. Future migration must name the exact source scope and target behavior.

## 2026-07-22 — No model APIs

OpenAI, xAI, and other model APIs are prohibited. AI access uses only official subscription-authenticated Codex and Grok CLIs installed locally.

## 2026-07-22 — AI is optional

Capture, Today, complete, defer, search, export, and restore must work without AI. Provider outages and usage limits must not block the personal operations service.

## 2026-07-22 — Structured intent for mutations

AI proposes schema-constrained domain operations. The server validates and applies them. The browser does not receive a shell, and models do not receive direct database ownership.

## 2026-07-22 — Private remote access

Remote devices connect through Tailscale Serve. Public port forwarding and public tunnels are excluded.

## 2026-07-22 — Start with a small stack

The first implementation uses Node.js 24+, TypeScript, Fastify, Node's built-in SQLite, and a plain browser UI. Framework expansion requires a demonstrated product need.

## 2026-07-22 — Start AI with isolated single-turn CLI chat

The first live AI feature is synchronous, read-only, and single-turn. The browser may select only allowlisted providers, models, and reasoning levels. The server runs the installed Codex or Grok CLI in a fixed empty working directory with time, output, and provider-concurrency limits, then returns only the final answer and bounded usage counts.

The official Codex SDK is a useful future option for streaming and resumable Codex threads, but it is not adopted in this milestone. Keeping the provider adapter at the official installed CLI boundary preserves the current CLI-only constraint and a common architecture for Codex and Grok.

A follow-up review confirmed that the TypeScript SDK wraps the Codex CLI and exchanges the same JSONL event stream that the current adapter already parses. Migrating now would not materially improve the single-turn workflow and would introduce a second Codex CLI version boundary through the SDK dependency. Reconsider the SDK when persistent Codex threads, structured streaming, per-turn schemas, or image inputs become an accepted milestone.

Temporary unauthenticated access is limited to the owner's private tailnet for active development inspection. The tailnet currently has no other members and all connected devices belong to the owner. Application authentication remains required before wider use, persistent AI conversations, or AI-proposed mutations.

## 2026-07-22 — Use project-native Playwright for visual verification

CLI development uses Playwright with an isolated Chromium runtime for repeatable layout checks and screenshots. Tests start a temporary localhost server on a dedicated port with separate SQLite and AI working directories. All screenshots, traces, reports, and test data stay under ignored artifact paths. This does not provide access to the owner's normal Chrome profile or signed-in browser sessions.

## 2026-07-22 — Persist read-only AI conversations and stream sanitized events

AI conversations, messages, and job state are canonical SQLite data. A conversation is fixed to one provider while model and reasoning effort may change per turn. Requests use a unique client request ID, one active job is allowed per provider, and jobs follow explicit queued, running, and terminal states. Running jobs become interrupted after a server restart rather than being retried automatically.

The project does not adopt any model SDK because repository policy permits only installed subscription-authenticated CLIs. Codex text streaming uses the official CLI's app-server over a child-process stdio transport; it never opens an app-server network listener or exposes raw JSON-RPC to the browser. If this version-sensitive integration cannot initialize, the adapter falls back to the stable buffered `codex exec --json` path. Grok uses its official streaming JSON and resumable session flags.

Only assistant text deltas, sanitized state, final usage, and bounded errors cross the SSE boundary. Reasoning, tool output, provider session identifiers, raw stderr, credentials, and CLI diagnostics remain server-side. Temporary unauthenticated use remains restricted to the owner's single-member tailnet; authentication and AI-proposed mutations remain separate later milestones.
