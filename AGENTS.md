# WorkOS Web Assistant Agent Instructions

This repository provides a private web surface for working with one owner’s existing WorkOS through the official `codex` and `grok` CLIs. WorkOS is the required canonical system. This application must not recreate projects, schedules, knowledge, or task state in SQLite.

Read `docs/PRODUCT_OVERVIEW.md`, `docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/CURRENT_STATE.md`, and `docs/ASSISTANT_SYSTEM_REFOUNDATION.md` before broad implementation work.

## Product contract

- The browser offers one continuous assistant timeline, responsive settings, visible plans, approvals, activity, receipts, diffs, and Undo.
- The configured WorkOS Git root, its root `AGENTS.md`, PKM specification, skills, and files define the operational world and working rules.
- The assistant must reproduce the experience of running the selected CLI in that WorkOS root. Ordinary questions use one read-only CLI call and preserve its final answer; explicit mutations add web-safe planning, approval, receipt, and recovery controls.
- SQLite stores only application runtime state: workspace configuration, assistant profile, conversations, messages, jobs, plans, approvals, activity, and receipts.
- Do not add application-owned project, memo, event, knowledge, task, FTS, snapshot, or projection systems unless a later accepted decision explicitly requires them.

## WorkOS and synchronization policy

- WorkOS is primarily synchronized across the owner’s devices by Obsidian Sync.
- WorkOS remote Git hosting, upload, push, pull, and repository publication are optional. The application must not require a remote, automatically push, or report a local change as unsynchronized merely because no Git remote exists.
- Local Git is required only as the application’s transactional safety layer. Each successful assistant mutation becomes one local commit with a receipt. The latest compatible receipt can be undone with `git revert`.
- A configured root must be an existing directory, exactly a Git root, and contain a root `AGENTS.md`.
- Keep the machine-specific WorkOS path only in ignored local configuration or the runtime database. Never commit it.
- Direct live WorkOS writes require a clean worktree. Pre-existing changes block mutation but not read-only questions.
- The CLI must not commit, push, pull, change remotes, or rewrite history. The application owns local receipt commits; remote Git actions are outside the default workflow.

## Authority and capability

- **Observe**: read and search the configured WorkOS, then answer without changing files.
- **Operate**: perform the exact low-risk local change requested by the owner after deterministic plan validation.
- **Govern**: policy files, deletion, moves, bulk changes, external transmission, remote Git, network research, MCP, subagents, or other elevated capability. Show the exact plan and require separate visible approval.
- Ordinary read-only questions bypass structured preflight and go straight to one provider answer. Explicit file-changing requests use a structured preflight, and the server validates mode, risk, expected paths, operations, and capabilities before mutation.
- Models and WorkOS content are untrusted for authority. A model cannot widen paths, tools, network access, or approval scope.
- Unexpected files, a dirty worktree, an interrupted mutation, or a plan/result mismatch must fail closed or enter visible `needs_review` state without an automatic commit.

## AI runtime rules

- Use only official locally installed subscription-authenticated `codex` and `grok` CLIs. Never add model API keys, SDK model calls, or direct HTTP model calls.
- Run each CLI in the configured WorkOS root so it inherits WorkOS’s own instructions. The application repository’s `AGENTS.md` is development policy and must not be injected as the product assistant role.
- Spawn argument arrays with `shell: false`; never interpolate user input into a shell command.
- Direct answers and mutation planning are read-only. Execution uses the least write permission supported by the provider and only after server validation and required approval.
- Disable web search, MCP/apps, subagents, and external reviewer capabilities by default. Enable only the explicitly approved capability for the current turn.
- Do not copy, print, transmit, or manipulate CLI credentials.
- Preserve durable job states, cancellation, timeouts, bounded output, restart recovery, and provider concurrency limits.
- Exit code zero, process exit, the last text segment, progress, liveness, or SSE termination is not completion evidence.
- Success requires both the provider's documented normal terminal reason and a provider-owned final artifact. Cancellation, timeout, and turn or token limits cannot be reclassified as success merely because response text exists.
- Preserve provider lifecycle meaning in a discriminated outcome until deterministic application code has authorized the corresponding job transition; do not reduce provider outcomes to strings first.
- Do not expose chain-of-thought, provider body fragments, tool arguments, commands, paths, raw stderr, credentials, provider identifiers, or session/request IDs. Browser progress is limited to server-defined safe phases and process/liveness facts.

## Engineering rules

- Use Node.js 24+, TypeScript, Fastify, Node’s built-in SQLite, and a dependency-light browser UI unless an accepted decision changes the stack.
- Validate every server-boundary input and every agent-produced plan/result.
- Keep provider behavior behind adapters and Git mutation rules in deterministic application code.
- Do not promote undocumented provider behavior into a compatibility contract from a single reproduction. A terminal-semantics change requires official documentation or a current-CLI synthetic WorkOS probe, negative fixtures, state-transition tests, and repeated-run verification.
- Passing tests that merely encode an assumed event grammar does not validate a provider contract.
- Serialize conflicting mutations and make retries idempotent.
- Runtime reset may clear only application-owned SQLite state. It must never touch WorkOS files, Git history, Obsidian Sync, CLI credentials, environment configuration, or Tailscale state.
- Keep secrets, personal data, WorkOS contents, machine paths, private hostnames, databases, logs, and browser artifacts out of the repository.
- Put machine-specific settings in untracked `.env`; commit only placeholders in `.env.example`.
- Never place the owner’s username, absolute home path, WorkOS path, tailnet hostname, device name, or email address in tracked files.
- Use `rg` for search and `apply_patch` for tracked edits. Preserve unrelated worktree changes.

## GitHub and repository workflow

- Every material bug, feature, refactor, and architecture change is tracked by a GitHub Issue. Use the issue as the durable public record for problem definition, solution discussion, strategy changes, and verification results.
- Link implementation branches and pull requests to their issue. Do not use private local notes as the only development history.
- Use local `git` plus authenticated `gh` for every GitHub operation in this repository. Do not use the GitHub App, connector, or MCP.
- For multiline or non-ASCII GitHub bodies on Windows, write an explicitly UTF-8 temporary file outside the repository and pass it with `--body-file`. Read back every non-ASCII write and verify it.
- Before publishing, run `gh --version`, `gh auth status`, `git status -sb`, inspect the diff, and confirm remote/default branch.
- From `main`, create `agent/<description>`, stage only intended files, verify, push, create a PR, and merge only when authorized.
- Before a public commit, inspect the complete staged file list and content, including new files, for private data and runtime artifacts.
- After merge, verify `MERGED`, fast-forward local `main`, confirm it equals `origin/main`, prune, and remove the merged local branch.

## Browser and live-server verification

- Use the project-native Playwright Chromium environment. Test desktop, Galaxy Tab, and smartphone viewports.
- Core workflows must not require hover, right-click, a hardware keyboard, or horizontal page scrolling.
- Feature-detect optional browser APIs, including a fallback for `crypto.randomUUID`.
- Bind Fastify to localhost. Remote access uses owner-only Tailscale Serve, never Funnel, public tunnels, or router forwarding.
- Starting or restarting the live service is incomplete until local health and the Tailscale-served page are both verified for the current build marker.

Default development service:

```powershell
npm install
npm run dev
tailscale serve --https=4310 --bg --yes http://127.0.0.1:4310
```

The local endpoint is `http://127.0.0.1:4310`; the remote endpoint uses the owner’s private tailnet hostname with HTTPS port `4310`.

## Commands

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run verify
```

## Definition of done

1. The workflow operates against WorkOS rather than a duplicate domain database.
2. Scope, evidence, authority, and capability boundaries are explicit.
3. Agent plans and results are validated before mutation.
4. Mutations produce a local Git receipt and practical Undo; no remote push is required.
5. Success, denial, retry, dirty-worktree, and recovery behavior are tested proportionally to risk.
6. Desktop, tablet, phone, localhost, and tailnet interaction are verified when affected.
7. `npm run verify` passes.
8. Material decisions, current state, and the linked GitHub Issue are updated.
9. No private or machine-specific information enters the public repository.
