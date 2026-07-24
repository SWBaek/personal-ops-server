# Product Overview

## Product statement

Personal Ops Server is a private web surface for working with an existing WorkOS through locally installed Codex and Grok CLIs. It brings the practical experience of running those CLIs in the WorkOS root to desktop, tablet, and phone, with stronger visibility and recovery controls.

WorkOS is required and remains the only source of truth for projects, schedule, tasks, meetings, decisions, and knowledge. The server does not extract those concepts into a competing SQLite model.

## Product promise

The owner can ask a question or request a change in one conversation and expect the system to:

1. run an ordinary question as one read-only CLI invocation in the configured WorkOS root;
2. follow WorkOS’s own `AGENTS.md`, PKM specification, and skills;
3. preserve the CLI’s final answer instead of asking it for a structured plan first;
4. detect explicit file-changing commands and show their plan, expected paths, operations, capabilities, and risk;
5. execute an approved bounded change only when the worktree is clean;
6. validate actual changed paths;
7. create one local Git commit and a human-readable receipt;
8. show the exact diff and provide bounded Undo.

## Synchronization

Obsidian Sync is the primary way WorkOS content is synchronized across the owner’s devices. Remote Git is optional. The product does not require a remote, automatically push, or treat the absence of a remote as a fault.

Local Git is a safety mechanism, not the synchronization product. It supplies clean-worktree preconditions, immutable receipt commits, diff inspection, and latest-receipt Undo.

## Product surfaces

- one continuous assistant conversation;
- provider, model, and reasoning controls kept secondary to the request;
- first-run and settings-based WorkOS configuration;
- visible workspace and local Git status;
- plan and approval cards for Govern work;
- concise activity summaries;
- receipt, diff, and Undo inspection;
- assistant persona configuration below immutable WorkOS and security policy.

## Explicit non-goals

- a second project/task/knowledge database;
- an Obsidian replacement;
- a Git hosting or synchronization service;
- automatic Git push or pull;
- a browser shell or arbitrary filesystem interface;
- a generic autonomous-agent framework;
- model APIs or pay-per-token integrations;
- public internet exposure.

## Success criteria

The implementation is successful when read-only Codex and Grok questions behave as they do in the actual WorkOS root, bounded mutations are recoverable and auditable, no duplicate canonical state is created, and the same essential workflow works through localhost and owner-only Tailscale access on desktop, tablet, and phone.
