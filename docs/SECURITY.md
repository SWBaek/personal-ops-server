# Security

## Trust model

Trusted deterministic components:

- server input and schema validation;
- provider grants and authority policy;
- WorkOS root validation;
- job state transitions and idempotency;
- changed-path comparison;
- local Git commit and Undo preconditions.

Untrusted inputs:

- owner-entered natural language until validated at the boundary;
- model output;
- WorkOS files and imported content;
- CLI stdout/stderr;
- optional browser and network content.

Untrusted content can inform a result but cannot grant tools, paths, network access, or authority.

## Filesystem access

The owner explicitly configures one exact WorkOS Git root and grants access per provider. The server rejects missing directories, nested paths that are not the exact Git root, and roots without `AGENTS.md`.

Read-only turns may inspect the configured root. Mutation requires a clean worktree. Paths in plans and results must be relative, in-root, and free from traversal. The browser does not offer arbitrary path browsing or command execution.

## Authority

- Observe cannot mutate.
- Operate is bounded by the owner’s current request and server-validated paths.
- Govern requires a visible plan and separate approval.
- External network, MCP/apps, subagents, external review, remote Git, deletion, moves, bulk rewrites, and policy changes are Govern capabilities.

The provider must not commit, push, pull, or change remotes. The application alone creates local receipt commits after validation.

## Data and credentials

Only official subscription-authenticated Codex and Grok CLIs are allowed. The application never reads or transports their tokens. Raw stderr, environment dumps, hidden reasoning, and provider thread IDs do not reach the browser.

SQLite may contain the local WorkOS path and conversation text. It stays under ignored local runtime storage and must never be committed. WorkOS content is not copied into the runtime database.

## Synchronization and remote access

Obsidian Sync is the primary WorkOS synchronization mechanism and is managed outside the application. Remote Git is optional and never automatic.

Fastify binds to localhost. Remote browser access uses the owner-only tailnet through Tailscale Serve HTTPS. Funnel, public tunnels, public port forwarding, and unauthenticated wider-network access are prohibited.

## Failure behavior

- unavailable AI reports a durable failure rather than fabricated completion;
- dirty WorkOS blocks mutation;
- malformed plans/results fail closed;
- unexpected or residual edits enter `needs_review`;
- provider cancellation and restart preserve inspectable status;
- Undo rejects a dirty tree, divergent HEAD, non-latest receipt, or already-undone receipt;
- no failure path pushes to a Git remote or alters Obsidian Sync configuration.
