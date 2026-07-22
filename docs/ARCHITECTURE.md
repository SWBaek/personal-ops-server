# Architecture

## Context

The home computer is the single authoritative host. Personal devices access the service over a private network. Model inference remains remote through vendor CLIs, but the web application never handles model API keys.

```text
Phone / Tablet / Remote PC
            |
       private tailnet
            |
    Tailscale Serve (HTTPS)
            |
  Fastify on 127.0.0.1:4310
       |              |
  domain service    AI job queue
       |              |
    SQLite       provider adapters
  + documents     |          |
               codex       grok
                  \          /
              subscription services
```

## Layers

### Browser UI

The initial UI is intentionally plain and dependency-light. It provides Capture, Today, open Tasks, completion, deferral, and single-turn read-only AI chat. On wide screens, operational data stays in the primary column and AI chat uses a separate sticky right-side panel; narrow screens collapse to one column. The UI does not expose a shell, arbitrary flags, or arbitrary path input.

### HTTP service

Fastify owns input validation, domain operations, static assets, and future authentication middleware. The server binds to localhost by default.

### Domain and storage

SQLite is the canonical operational store. The initial schema contains captures and tasks. Future tables may include projects, notes, AI jobs, approvals, and audit events.

Long documents and attachments may remain normal files with database references. Export must produce readable Markdown or JSON.

### AI adapters

Adapters call installed binaries only:

- Codex: stable non-interactive `codex exec` with machine-readable output.
- Grok: official Grok Build headless mode with machine-readable output.

No adapter may read credential files or call provider HTTP APIs directly.

Normal assistant runs are read-only. Mutation interpretation returns schema-constrained intents that are validated by the domain service.

The initial AI chat boundary is synchronous and single-turn. It runs in a fixed empty working directory, allowlists provider/model/reasoning selections, limits each provider to one active request, and returns only the final answer plus bounded token usage. Durable jobs and resumable conversations remain a later layer.

### Job execution

Future AI execution uses a durable queue with:

- one active job per provider by default;
- explicit timeout and cancellation;
- bounded captured output;
- audit records without secrets;
- no shell command interpolation;
- safe restart behavior;
- separate proposal and apply phases for mutations.

## Remote access

The local server stays on `127.0.0.1`. Tailscale Serve terminates private HTTPS and proxies to the local port. Public port forwarding and Tailscale Funnel are excluded.

Application-level authentication remains required before remote AI execution is enabled. Network membership alone is not treated as sufficient authorization for sensitive operations.

## Availability and backup

The home computer must be powered on, signed in sufficiently for the user-level service, and prevented from sleeping when remote use is expected.

SQLite backup and export are separate milestones. A restore test is required before the system becomes the only source of new operational data.

## Why not Codex app-server first

The Codex app-server and remote-control surfaces are currently experimental. The initial integration should use the stable `codex exec` boundary. Provider adapters make a later transition possible without changing the domain model.
