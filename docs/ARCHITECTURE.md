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

The UI is intentionally plain and dependency-light. It provides Capture, Today, open Tasks, completion, deferral, and durable read-only AI conversations. On wide screens, operational data stays in the primary column and AI chat uses a separate sticky right-side panel; narrow screens collapse to one column. The UI does not expose a shell, arbitrary flags, or arbitrary path input.

### HTTP service

Fastify owns input validation, domain operations, static assets, and future authentication middleware. The server binds to localhost by default.

### Domain and storage

SQLite is the canonical operational store. The schema contains captures, tasks, AI conversations, messages, and durable jobs. Future tables may include projects, notes, approvals, and audit events.

Long documents and attachments may remain normal files with database references. Export must produce readable Markdown or JSON.

### AI adapters

Adapters call installed binaries only:

- Codex: private app-server stdio text events with stable `codex exec` buffered fallback.
- Grok: official Grok Build headless streaming JSON.

No adapter may read credential files or call provider HTTP APIs directly.

Normal assistant runs are read-only. Mutation interpretation returns schema-constrained intents that are validated by the domain service.

The AI boundary is asynchronous, durable, and read-only. It runs in a fixed empty working directory, allowlists provider/model/reasoning selections, limits each provider to one active request, and exposes only sanitized text and job state over SSE. SQLite stores browser-visible history while opaque provider thread identifiers remain internal.

### Job execution

AI execution uses a durable queue with:

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

## Why app-server is internal only

Codex app-server provides incremental assistant text but remains a version-sensitive CLI surface. The application therefore launches it only over stdio behind the provider adapter, validates its small protocol subset, and falls back to `codex exec` when initialization is incompatible. No app-server socket, remote-control endpoint, SDK, or provider protocol is exposed to the browser.
