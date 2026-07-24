# CLI Integration Contracts

## Global contract

Only official locally installed subscription-authenticated `codex` and `grok` CLIs may provide AI. No model API, API key, SDK model call, or direct model HTTP call is allowed.

Both adapters receive the same application-owned plan/result schemas. The working directory is the configured WorkOS Git root. Prompts state that WorkOS instructions are canonical, assistant persona is subordinate, and the provider must not commit, push, pull, or modify remotes.

Processes use argument arrays with `shell: false`. User text is never interpolated into a shell command. Output and runtime are bounded; raw stderr, hidden reasoning, credentials, and provider session identifiers stay server-side.

## Codex

Availability:

```powershell
codex --version
codex login status
```

Planning uses `codex exec` with JSON output, ephemeral state, read-only sandbox, the WorkOS root as `-C`, and a structured output schema.

Execution uses the same root with workspace-write sandbox and a structured result schema. Web search, apps/MCP, and multi-agent behavior are disabled unless the current Govern approval explicitly grants the capability.

The application does not disable WorkOS project discovery: inheriting WorkOS `AGENTS.md` and skills is the purpose of this product. It must not inject this application repository’s development instructions into the WorkOS assistant.

## Grok

Availability:

```powershell
grok version
```

Planning runs in the WorkOS root with plan permission mode, streaming JSON, no memory, disabled web search, and no subagents.

Execution runs in the same root with accepted-edit permission only after validation and any required approval. It does not use an always-approve mode and does not gain external capabilities implicitly.

Use official Grok Build only; do not substitute a similarly named API-key client.

## Required structured plan

Each preflight returns:

- `mode`: Observe, Operate, or Govern;
- concise summary and user-facing reply;
- risk;
- expected relative paths;
- proposed operations;
- requested capabilities;
- rationale;
- whether separate approval is required.

The server may increase risk or require approval. Model output cannot reduce deterministic risk.

## Required execution result

Execution returns:

- user-facing reply;
- semantic change summary;
- claimed changed paths;
- validation summaries.

The server independently reads Git status and compares actual paths. The result cannot authorize unexpected files.

## Git and synchronization

The provider never performs Git publication. The application creates the local receipt commit after validation. It does not push or pull.

Obsidian Sync is the primary cross-device synchronization mechanism and remains outside the CLI adapter. The adapter does not inspect credentials or claim synchronization completion.
