# CLI Integration Contracts

## Global rule

This application must never call a model API directly. It invokes only official locally installed CLIs that already have subscription authentication under the Windows user running the service.

The background process must run as the same Windows user that owns the CLI login and OS keyring entries. Do not run it as `LocalSystem` and do not copy credentials into the service.

## Codex adapter

Availability check:

```powershell
codex --version
codex login status
```

Buffered fallback invocation shape:

```powershell
codex exec --json --sandbox read-only --ephemeral --ignore-user-config --skip-git-repo-check -C "<fixed-empty-path>" -c 'web_search="disabled"' --disable apps --disable multi_agent --disable shell_tool [--model "<allowlisted-model>"] [-c 'model_reasoning_effort="<allowlisted-effort>"'] -
```

The prompt is written to stdin. The application parses JSONL and returns only the final `agent_message` and bounded usage counts.

Durable text streaming starts `codex app-server --listen stdio://` as a private child process. The server performs the JSON-RPC initialize handshake, starts or resumes an internal thread, and sends turns with a fixed working directory, `read-only` sandbox, `never` approval policy, disabled network access, and allowlisted model/reasoning values. It forwards only `item/agentMessage/delta` text and terminal usage. It never opens a WebSocket listener or exposes provider thread IDs.

Structured mutation interpretation will add an application-owned JSON Schema through `--output-schema`. The returned proposal is validated and applied by the server.

Do not use `danger-full-access`. Do not expose Codex app-server or remote-control directly to remote devices.

## Grok Build adapter

Availability check:

```powershell
grok version
```

Current headless invocation shape:

```powershell
grok --no-auto-update --output-format streaming-json --cwd "<fixed-empty-path>" --disable-web-search --no-memory --no-subagents --no-plan --max-turns 3 --permission-mode plan [--session-id "<server-generated-uuid>" | --resume "<stored-session-id>"] [--model "<allowlisted-model>"] [--reasoning-effort "<allowlisted-effort>"] --single "<prompt>"
```

Use official Grok Build only. Do not substitute similarly named community CLIs that require an xAI API key. Do not use `--always-approve` for web-triggered jobs.

The application incrementally parses assistant text and returns bounded usage counts. It does not expose thoughts, session IDs, cost estimates, raw stderr, or diagnostic fields.

## Process rules

- Use `child_process.spawn(binary, args, { shell: false })`.
- Pass user text as one argument or through stdin; never build a shell string.
- Fix the working directory in server configuration.
- Cap runtime and captured stdout/stderr.
- Parse JSON incrementally and treat malformed output as a failed job.
- Never return raw environment variables or diagnostic dumps to the browser.
- Keep adapters replaceable because CLI flags and output formats may evolve.
