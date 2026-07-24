# Project Brief

## Problem

Running Codex or Grok directly in WorkOS provides strong contextual behavior because the CLI can read WorkOS instructions, skills, and files. It is less convenient across devices and does not provide a single web-visible approval, job, receipt, and recovery surface.

The previous application attempted to reproduce WorkOS content in SQLite through memos, FTS, projections, and snapshots. That introduced a second interpretation layer that could omit meetings or require continuous retrieval tuning. The accepted correction is to stop duplicating the operational world.

## Accepted solution

Keep the existing responsive browser shell and connect each assistant turn directly to a user-configured WorkOS root:

- preflight is always read-only and returns a schema-validated plan;
- Observe returns the answer immediately;
- low-risk Operate may execute the exact requested local change;
- Govern requires a separate visible approval;
- execution occurs in the WorkOS root with provider-specific adapters;
- deterministic code validates the resulting files;
- the application creates a local Git receipt commit;
- the latest compatible receipt can be undone with `git revert`.

## Data ownership

| Information | Owner |
| --- | --- |
| Projects, schedule, tasks, meetings, knowledge | WorkOS files |
| WorkOS policies and skills | WorkOS root |
| Cross-device WorkOS synchronization | Obsidian Sync |
| Optional remote Git hosting | Owner-selected external configuration |
| Conversation, jobs, plans, approvals, activity | Application SQLite |
| Local commit hashes, diffs, Undo receipts | Application SQLite + WorkOS local Git |
| CLI credentials | Official CLI and operating system |

## Authority

- Observe may read the configured root.
- Operate is limited to the owner’s exact low-risk request and validated expected paths.
- Govern covers policy, deletion, moves, bulk changes, network/external tools, remote Git, and other elevated capabilities.

The browser never exposes a free-form command or arbitrary path. WorkOS content cannot grant itself more authority.

## First milestone acceptance

- first-run WorkOS selection validates Git root and root `AGENTS.md`;
- provider grants are explicit and configurable;
- Codex and Grok use the same provider-independent plan/result contract;
- a read-only question changes no files;
- a bounded edit produces a local commit and receipt;
- Govern waits for visible approval;
- dirty WorkOS blocks mutations;
- latest receipt Undo is divergence-safe;
- provider switching preserves one timeline and marks the provider segment;
- remote Git is not required and no automatic push occurs;
- desktop, tablet, and phone E2E flows pass with synthetic data.
