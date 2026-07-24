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

Assistant Markdown is also untrusted presentation input. The browser sanitizes rendered output against an explicit allowlist; scripts, images, event attributes, embedded content, style, and unsafe link protocols are not rendered. Raw provider Markdown remains available as evidence and is never replaced by generated HTML in SQLite.

Font CDN requests use version-pinned public stylesheets and contain no WorkOS path, message content, owner identifier, or credential. Font loading is presentation-only: local fallbacks preserve operation when the CDN is unavailable.

## Filesystem access

The owner explicitly configures one exact WorkOS Git root and grants access per provider. The server rejects missing directories, nested paths that are not the exact Git root, and roots without `AGENTS.md`.

Direct-answer turns may inspect the configured root only with read-only provider permissions. Mutation requires an explicit change command, a validated plan, and a clean worktree. Paths in plans and results must be relative, in-root, and free from traversal. The browser does not offer arbitrary path browsing or command execution.

## Authority

- Direct answers cannot mutate; ambiguous requests default to this path.
- Grok direct answers use explicit read-only tool permission, deny edit operations, and run under the read-only sandbox; Codex retains its read-only sandbox.
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
- missing terminal completion, max-turn exhaustion, and unterminated progress-only streams fail instead of becoming completed messages;
- dirty WorkOS blocks mutation;
- malformed plans/results fail closed;
- unexpected or residual edits enter `needs_review`;
- provider cancellation and restart preserve inspectable status;
- Undo rejects a dirty tree, divergent HEAD, non-latest receipt, or already-undone receipt;
- no failure path pushes to a Git remote or alters Obsidian Sync configuration.
