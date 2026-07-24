# Architecture

## System boundary

```text
Browser
  -> Fastify API and SSE
     -> deterministic plan/authority validator
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
- messages and durable jobs;
- structured preflight plans;
- activity summaries;
- local Git receipts and Undo relationships.

It deliberately does not store projects, tasks, events, memos, snapshots, knowledge, FTS indexes, or WorkOS file contents.

## Turn lifecycle

1. The server validates the browser request and provider selection.
2. It verifies that the provider has an owner grant and that the root remains valid.
3. The provider runs a structured read-only preflight in the WorkOS root.
4. The server validates the plan and deterministically escalates risk when required.
5. Observe completes without execution.
6. Govern pauses in `approval_required`.
7. Execution requires a valid clean worktree and an unchanged approved plan.
8. The provider edits only within WorkOS.
9. The server compares actual and expected paths.
10. Matching changes become one application-owned local commit and receipt.
11. Unexpected or interrupted changes enter `needs_review`; they are not auto-committed.

Jobs survive browser reload and interrupted jobs are reconciled at server startup.

## Provider boundary

Both providers implement the same plan and execution interfaces. CLI arguments are arrays and use `shell: false`. The configured WorkOS root is the working directory, allowing the provider to inherit WorkOS instructions naturally.

Web search, MCP/apps, subagents, external review, and remote Git are disabled by default. A later workflow may add a narrowly scoped capability only behind Govern approval.

## Git boundary

The application requires local Git for transaction safety. It does not require or operate a remote. It stages only validated changed paths, creates one receipt commit, and can revert only the latest receipt when HEAD and worktree preconditions still match.

Obsidian Sync remains independent. Git commit creation does not promise that Obsidian Sync has completed, and Obsidian Sync status is not inferred from Git.

## Deployment

Fastify binds to localhost. Tailscale Serve terminates private HTTPS on an explicit port and proxies to the local HTTP service. No Funnel, public reverse proxy, or router forwarding is used.
