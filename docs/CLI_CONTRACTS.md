# CLI Integration Contracts

## Global contract

Only official locally installed subscription-authenticated `codex` and `grok` CLIs may provide AI. No model API, API key, SDK model call, or direct model HTTP call is allowed.

For ordinary questions, both adapters receive the owner’s request unchanged and return the provider’s final assistant text without an application-owned output schema. Explicit mutations use the same application-owned plan/result schemas. The working directory is the configured WorkOS Git root. Mutation prompts state that WorkOS instructions are canonical, assistant persona is subordinate, and the provider must not commit, push, pull, or modify remotes.

Processes use argument arrays with `shell: false`. User text is never interpolated into a shell command. Output and runtime are bounded; raw stderr, hidden reasoning, credentials, and provider session identifiers stay server-side.

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

The adapter accepts the answer only after a `turn.completed` event. An agent-message event without terminal completion is incomplete and fails the durable job.

Mutation planning uses the same read-only sandbox with a structured output schema.

Execution uses the same root with workspace-write sandbox and a structured result schema. Web search, apps/MCP, and multi-agent behavior are disabled unless the current Govern approval explicitly grants the capability.

The application does not disable WorkOS project discovery: inheriting WorkOS `AGENTS.md` and skills is the purpose of this product. It must not inject this application repository’s development instructions into the WorkOS assistant.

## Grok

Availability:

```powershell
grok version
grok models
```

Direct answers run in the WorkOS root with planning behavior disabled, streaming JSON framing, no memory, disabled web search, and no subagents. Headless `dontAsk` permission explicitly allows `Read`, `Grep`, and shell commands while denying `Edit`; the `read-only` sandbox is a second filesystem boundary. This lets an agent complete multi-step local inspection without granting a mutation.

The adapter treats text before another thought or tool step as an intermediate progress segment. It waits for the terminal `end` event with `stopReason: EndTurn` and returns only the final text segment unchanged. A matching `result` envelope and content-free `usage` metadata may follow completion; later text, thought, tool, mismatched result, unknown output, missing completion, max-turn exhaustion, and malformed events fail the job.

Mutation planning runs in the WorkOS root with plan permission mode and a structured output schema.

Execution runs in the same root with accepted-edit permission only after validation and any required approval. It does not use an always-approve mode and does not gain external capabilities implicitly.

Use official Grok Build only; do not substitute a similarly named API-key client.

## Direct answer

A direct answer has no application schema and no second model pass. The server stores exactly the final assistant text extracted after the provider’s terminal completion event. Intermediate progress messages and hidden thoughts are not persisted or shown as completed answers. It never interprets a plan-like sentence as successful mutation, and the provider receives no write permission.

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
