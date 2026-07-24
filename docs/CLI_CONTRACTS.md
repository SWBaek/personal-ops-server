# CLI Integration Contracts

## Global contract

Only official locally installed subscription-authenticated `codex` and `grok` CLIs may provide AI. No model API, API key, SDK model call, or direct model HTTP call is allowed.

For ordinary questions, both adapters receive the owner’s request unchanged and return the provider’s final assistant text without an application-owned output schema. Explicit mutations use the same application-owned plan/result schemas. The working directory is the configured WorkOS Git root. Mutation prompts state that WorkOS instructions are canonical, assistant persona is subordinate, and the provider must not commit, push, pull, or modify remotes.

Processes use argument arrays with `shell: false`. User text is never interpolated into a shell command. Output and runtime are bounded; provider bodies, raw stderr, hidden reasoning, tool arguments, paths, credentials, metadata, and provider/session/request identifiers are discarded and never cross the adapter boundary.

Every answer, plan, and execution returns a discriminated provider outcome. Exit code zero, process exit, a last text segment, progress, liveness, and SSE termination are not completion evidence. Only `completed`, backed by the documented normal terminal reason and a provider-owned final artifact, can authorize a successful job/message transition.

Every invocation includes a concrete `--model` value. The product does not expose or persist a generic `default` model because that would let a CLI upgrade silently change which model handles the owner's work. The versioned product catalog follows the locally verified, list-visible CLI catalog:

- Codex: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, and `gpt-5.3-codex-spark`;
- Grok: `grok-4.5`.

The initial concrete selections are `gpt-5.6-sol` for Codex and `grok-4.5` for Grok. Existing ledger rows that stored `default` are migrated to those provider-specific identifiers.

## Codex

Availability:

```powershell
codex --version
codex login status
codex debug models
```

Direct answers use `codex exec` with JSON event framing, ephemeral state, read-only sandbox, and the WorkOS root as `-C`; the final agent message is passed through without a structured output schema.

Every Codex invocation pairs JSONL progress with `--output-last-message` in a unique runtime-only temporary directory. The adapter accepts a value only after exit zero, `turn.completed`, and a non-empty final file within the one MiB bound. JSONL agent-message events are never reconstructed into final content. The temporary directory is removed on success, failure, timeout, and cancellation.

Mutation planning uses the same read-only sandbox with a structured output schema.

Execution uses the same root with workspace-write sandbox and a structured result schema. Web search, apps/MCP, and multi-agent behavior are disabled unless the current Govern approval explicitly grants the capability.

The application does not disable WorkOS project discovery: inheriting WorkOS `AGENTS.md` and skills is the purpose of this product. It must not inject this application repository’s development instructions into the WorkOS assistant.

## Grok

Availability:

```powershell
grok version
grok models
```

Direct answers run in the WorkOS root with planning behavior disabled, one-object JSON framing, no memory, disabled web search, and no subagents. Headless `dontAsk` permission explicitly allows `Read`, `Grep`, and shell commands while denying `Edit`; the `read-only` sandbox is a second filesystem boundary. This lets an agent complete multi-step local inspection without granting a mutation.

The adapter waits for process exit and parses exactly one JSON object. Success requires exit zero, `stopReason: EndTurn`, and non-empty `text` or valid `structuredOutput`. `Cancelled`, `MaxTurns`, `MaxTokens`, missing or unknown terminal reasons, malformed output, and missing/empty final data are non-success even when response text exists. Owner AbortSignal cancellation is the only outcome mapped to a cancelled job. ACP-based structured progress is deferred to a separate decision.

Mutation planning runs in the WorkOS root with plan permission mode and a structured output schema.

Execution runs in the same root with accepted-edit permission only after validation and any required approval. It does not use an always-approve mode and does not gain external capabilities implicitly.

Use official Grok Build only; do not substitute a similarly named API-key client.

## Direct answer

A direct answer has no application schema and no second model pass. The server stores exactly the authoritative final artifact text after lifecycle validation. Intermediate progress messages and hidden thoughts are not persisted or shown as completed answers. It never interprets a plan-like sentence as successful mutation, and the provider receives no write permission.

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
