# WorkOS-Native Assistant Refoundation

## Why the direction changed

The earlier system copied conversational facts into SQLite memos, FTS indexes, projections, and project snapshots. Even with coverage tracking, important WorkOS facts could be missed and each new domain required more retrieval tuning.

The accepted product correction is simpler: use the actual WorkOS as the required canonical world and expose the same CLI experience through a controlled web interface.

## Accepted architecture

- WorkOS is the only operational and knowledge source of truth.
- Codex and Grok run in the configured WorkOS root and inherit its instructions.
- The browser provides one conversation, configuration, planning, approval, activity, receipts, diff, and Undo.
- SQLite stores only runtime and audit state.
- Ordinary questions use one read-only CLI invocation and preserve its final answer.
- Explicit mutations begin with a structured read-only plan.
- Mutations are bounded by a validated plan, clean Git state, and risk policy.
- Successful mutations become one local Git receipt commit.
- Obsidian Sync is primary synchronization; remote Git is optional and not automated.

## Completed phase: first vertical slice

### Configuration

- optional environment seed plus first-run browser selection;
- exact Git root and root `AGENTS.md` validation;
- provider-specific standing grants;
- machine paths kept out of tracked files.

### Runtime

- discriminated provider outcomes for direct answers and common mutation plan/result schemas;
- provider-owned final artifacts paired with documented normal terminal reasons so progress text cannot become a completed answer;
- Codex read-only planning and workspace-write execution;
- Grok planning and accepted-edit execution;
- disabled external capabilities by default;
- durable jobs, activity, cancellation, restart recovery, and provider locks.

### Governed mutation

- deterministic risk escalation;
- visible high-risk approval;
- clean-worktree gate;
- expected-versus-actual path validation;
- local application commit and receipt;
- latest-receipt divergence-safe Undo;
- visible `needs_review` for residual or unexpected changes.

### Interface

- responsive desktop, tablet, and phone conversation;
- workspace status and configuration;
- provider/model/reasoning controls;
- plan, approval, activity, receipt, diff, and Undo views;
- one timeline with explicit provider segments.

## Removed foundation

The following are no longer product architecture:

- application canonical projects and tasks;
- assistant memos and revisions;
- project projections and snapshots;
- FTS retrieval and coverage audits;
- Projects, Inbox, and raw database Debug screens;
- prototype data reset semantics tied to those domains.

Historical code is recoverable from Git history and must not be restored without a new accepted decision.

## Validation sequence

1. Run type checking, unit/integration tests, production build, and Playwright.
2. Use only synthetic WorkOS repositories in automated tests.
3. Verify a configured real WorkOS with read-only questions and compare Git status before and after.
4. Verify local health and current build marker.
5. Verify the private Tailscale HTTPS page on the explicit port.
6. Publish through the linked GitHub Issue and PR after scanning all staged content for private data.

## Next phase

Build an evaluation set from anonymized or synthetic equivalents of real WorkOS requests:

- project-state recovery;
- meeting and schedule questions;
- exact one-file updates;
- policy-change approval;
- dirty-tree denial;
- cancellation and provider failure;
- unexpected-path recovery.

Only after this benchmark should the product consider narrowly scoped web research, MCP, subagents, optional remote Git actions, or additional receipt operations.
