# CLI Integration Contracts

## Global contract

Only official locally installed subscription-authenticated `codex` and `grok` CLIs may provide AI. No model API, API key, SDK model call, or direct model HTTP call is allowed.

For ordinary questions, both adapters receive the owner’s request unchanged and return the provider’s final assistant text without an application-owned output schema. Explicit mutations use the same application-owned plan/result schemas. The working directory is the configured WorkOS Git root. Mutation prompts state that WorkOS instructions are canonical, assistant persona is subordinate, and the provider must not commit, push, pull, or modify remotes.

Processes use argument arrays with `shell: false`. User text is never interpolated into a shell command. Output and runtime are bounded; raw stderr, hidden reasoning, credentials, and provider session identifiers stay server-side.

## Codex

Availability:

```powershell
codex --version
codex login status
```

Direct answers use `codex exec` with JSON event framing, ephemeral state, read-only sandbox, and the WorkOS root as `-C`; the final agent message is passed through without a structured output schema.

Mutation planning uses the same read-only sandbox with a structured output schema.

Execution uses the same root with workspace-write sandbox and a structured result schema. Web search, apps/MCP, and multi-agent behavior are disabled unless the current Govern approval explicitly grants the capability.

The application does not disable WorkOS project discovery: inheriting WorkOS `AGENTS.md` and skills is the purpose of this product. It must not inject this application repository’s development instructions into the WorkOS assistant.

## Grok

Availability:

```powershell
grok version
```

Direct answers run in the WorkOS root with read-only permission, planning behavior disabled, provider JSON framing, no memory, disabled web search, and no subagents. The outer framing is removed and its final text is passed through unchanged.

Mutation planning runs in the WorkOS root with plan permission mode and a structured output schema.

Execution runs in the same root with accepted-edit permission only after validation and any required approval. It does not use an always-approve mode and does not gain external capabilities implicitly.

Use official Grok Build only; do not substitute a similarly named API-key client.

## Direct answer

A direct answer has no application schema and no second model pass. The server stores exactly the final assistant text extracted from the provider’s transport framing. It never interprets a plan-like sentence as successful mutation, and the provider receives no write permission.

## Required mutation plan

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
