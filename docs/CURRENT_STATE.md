# Current State

## Implemented

The WorkOS-native first vertical slice is implemented:

- first-run and settings-based WorkOS root configuration;
- exact Git-root and root `AGENTS.md` validation;
- separate standing grants for Codex and Grok;
- one continuous conversation with provider segments;
- one-call, read-only Codex and Grok answers with unmodified final text;
- deterministic routing that defaults ambiguous requests to read-only;
- provider-independent structured preflight plans for explicit mutations;
- sanitized Markdown rendering for assistant messages with responsive tables and code blocks;
- Observe, Operate, and Govern risk handling;
- visible Govern approval and rejection;
- direct provider execution in the configured WorkOS root;
- clean-worktree mutation gate and expected-path validation;
- application-owned local Git commits, receipts, diffs, and latest-receipt Undo;
- durable SQLite conversation, job, activity, profile, configuration, and receipt state;
- restart recovery, cancellation, provider concurrency guards, and idempotent turns;
- responsive desktop, Galaxy Tab, and smartphone UI;
- localhost and private Tailscale deployment boundary.

The old application-owned memo, project, snapshot, projection, FTS, Inbox, and Debug domains have been removed. Obsolete HTTP routes return 404.

## Synchronization status

Obsidian Sync is the primary synchronization system for WorkOS. Remote Git remains optional. This version performs no Git push, pull, remote setup, or synchronization status inference. Local Git is used only for clean-state validation, receipts, diffs, and Undo.

## Verified behavior

Synthetic tests cover:

- invalid roots and missing instructions;
- plan risk escalation;
- Codex and Grok direct-answer and mutation invocation contracts;
- raw final-answer preservation without structured result parsing;
- Markdown headings, lists, tables, quotations, code, safe links, and hostile HTML-shaped input;
- read-only turns with no file changes;
- low-risk change, local commit, receipt, diff, and Undo;
- Govern approval;
- dirty-worktree denial;
- idempotency and restart recovery;
- responsive desktop, tablet, and phone flows;
- provider switching within one timeline.

Live verification must use read-only questions against the owner’s configured WorkOS when it contains pre-existing changes. Repository tests never read personal WorkOS data.

## Deliberately not implemented

- SQLite project/task/schedule/knowledge mirrors;
- automatic Obsidian Sync integration or status;
- remote Git upload, push, pull, or hosting;
- browser shell and arbitrary filesystem browsing;
- web search, MCP/apps, subagents, or external review by default;
- direct file editors or manual project management screens;
- multi-user authentication;
- non-latest or history-rewriting Undo.

## Next real milestone

Evaluate representative direct WorkOS questions across both providers, then add the smallest approved mutation benchmark. Measure answer usefulness, mutation routing, path containment, useful receipts, and recovery. Add a new capability only when those results identify a concrete limitation.
