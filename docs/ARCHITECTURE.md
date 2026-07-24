# Architecture

## System boundary

```text
Browser
  -> Fastify API and SSE
     -> deterministic read-or-mutate router
     -> plan/authority validator for explicit mutations
     -> durable SQLite runtime ledger
     -> Codex or Grok adapter
        -> configured WorkOS Git root
           -> AGENTS.md / PKM rules / skills / content
     -> local Git receipt and Undo controller

Obsidian Sync <-> WorkOS files
Optional remote Git <-> owner-managed, outside the default application flow
```

WorkOS is canonical. SQLite is a runtime and audit ledger only.

## Runtime data

The versioned SQLite schema stores:

- assistant profile and profile versions;
- WorkOS configuration proposals and the confirmed configuration;
- one conversation and provider segments;
- reversible per-conversation browser-view cutoff for long timelines;
- messages and durable jobs;
- structured preflight plans;
- activity summaries;
- local Git receipts and Undo relationships.

It deliberately does not store projects, tasks, events, memos, snapshots, knowledge, FTS indexes, or WorkOS file contents.

## Turn lifecycle

1. The server validates the browser request and provider selection.
2. It verifies that the provider has an owner grant and that the root remains valid.
3. An ordinary or ambiguous question invokes the provider once with read-only permissions.
4. The adapter waits for the provider’s terminal completion event, discards intermediate progress segments, and persists only the final answer text without a structured schema rewrite.
5. An explicit file-changing command instead runs a structured read-only preflight.
6. The server validates the mutation plan and deterministically escalates risk when required.
7. Govern pauses in `approval_required`.
8. Execution requires a valid clean worktree and an unchanged approved plan.
9. The provider edits only within WorkOS.
10. The server compares actual and expected paths.
11. Matching changes become one application-owned local commit and receipt.
12. Unexpected or interrupted changes enter `needs_review`; they are not auto-committed.

Jobs survive browser reload and interrupted jobs are reconciled at server startup.

While a job is active, liveness deliberately separates the browser SSE connection, the server-managed CLI process, and the timestamp of the last parsed provider event. The adapter incrementally decodes JSONL but emits only server-defined phases. Five-second SSE liveness events are not accumulated in SQLite; only meaningful phase changes are durable activity.

## Provider boundary

Both providers implement the same direct-answer, plan, and execution interfaces. Direct answers have no output schema and receive the owner’s request unchanged. Provider-specific event parsers require explicit terminal completion rather than equating the first assistant text with success. CLI arguments are arrays and use `shell: false`. The configured WorkOS root is the working directory, allowing the provider to inherit WorkOS instructions naturally.

Web search, MCP/apps, subagents, external review, and remote Git are disabled by default. A later workflow may add a narrowly scoped capability only behind Govern approval.

## Message presentation

Provider Markdown is preserved unchanged in SQLite and API responses. The browser parses assistant messages as GitHub-flavored Markdown, sanitizes the generated HTML against an explicit element and attribute allowlist, and then adds safe external-link attributes. Owner messages use text nodes only.

Markdown tables and code blocks own their horizontal scrolling so the application page remains contained on desktop, tablet, and phone.

Timeline hiding is presentation state only. SQLite retains every message, job, plan, activity event, and receipt; the conversation row stores one nullable cutoff message identifier. The browser hides messages through that stable timeline position, shows the hidden count, and can restore the full timeline immediately.

Typography is semantic rather than component-specific: Pretendard Variable is the UI, heading, prose, and table family; JetBrains Mono Variable is limited to code, logs, paths, commands, diffs, and identifiers. Version-pinned CDN stylesheets use system-font fallbacks and are not required for application startup or operation.

## Git boundary

The application requires local Git for transaction safety. It does not require or operate a remote. It stages only validated changed paths, creates one receipt commit, and can revert only the latest receipt when HEAD and worktree preconditions still match.

Obsidian Sync remains independent. Git commit creation does not promise that Obsidian Sync has completed, and Obsidian Sync status is not inferred from Git.

## Deployment

Fastify binds to localhost. Tailscale Serve terminates private HTTPS on an explicit port and proxies to the local HTTP service. No Funnel, public reverse proxy, or router forwarding is used.
