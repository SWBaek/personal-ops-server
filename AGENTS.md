# Personal Ops Server Agent Instructions

This repository is a fresh application project. It is not a knowledge-management vault and must not inherit or reproduce legacy PKM bureaucracy.

## Product intent

Build a small local-first personal operations web service that is reachable from the owner's devices and remains useful when AI is unavailable.

Human-facing actions should stay small:

- capture something quickly
- see one to three tasks for today
- complete or defer a task
- search durable context
- optionally ask an installed AI CLI for help

Read `docs/PROJECT_BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and `docs/CURRENT_STATE.md` before broad implementation work.

## Non-negotiable constraints

- Never add or use OpenAI, xAI, or other model API keys, SDK calls, direct HTTP model calls, or pay-per-token API integrations.
- AI access may use only official locally installed subscription-authenticated CLIs: `codex` and `grok`.
- Do not extract, copy, print, transmit, or manipulate CLI authentication tokens or credential files.
- Any legacy personal vault outside this repository is outside the project's authority. Do not read, write, migrate, index, or transmit it unless the user explicitly authorizes an exact scope.
- Never expose a general shell, raw command execution, arbitrary filesystem paths, or CLI credentials through the web UI.
- Bind locally by default. Remote access must use a private authenticated network such as Tailscale Serve, not router port forwarding or a public tunnel.
- The current tailnet is used only by the owner and has no other members. Connected devices belong to the same owner.
- AI must not be required for capture, task completion, deferral, search, or data export.
- Mutating AI workflows should return validated structured intents. The application applies allowed operations; the model does not write the database directly.
- Default AI runs to read-only access. Elevated filesystem actions require an explicit, separately reviewed admin workflow.

## Engineering rules

- Prefer the smallest implementation that proves a user workflow.
- Use Node.js 24+, TypeScript, Fastify, Node's built-in SQLite, and a dependency-light browser UI unless an accepted decision changes the stack.
- Keep provider-specific behavior behind adapters.
- Spawn CLIs with argument arrays and `shell: false`; never interpolate user input into a shell command.
- Serialize data-mutating jobs and make retries idempotent.
- Validate all input at the server boundary.
- Keep secrets out of the repository, logs, browser responses, and AI prompts.
- Put machine-specific development settings such as ports, local paths, and private-network hostnames in the untracked `.env` file. Commit only placeholder values in `.env.example`; never commit `.env` or any `.env.*` variant other than `.env.example`.
- Before every public commit, inspect staged files and history for personal paths, hostnames, email addresses, credentials, database files, logs, and runtime data.
- Preserve data portability through documented SQLite backup and Markdown/JSON export paths.

## Commands

```powershell
npm install
npm run dev
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run verify
```

Install the Playwright Chromium runtime once on a development machine with `npx playwright install chromium`. Browser-test screenshots, traces, reports, and isolated test data must stay under ignored artifact paths and must never contain production or personal data.

The local service defaults to `http://127.0.0.1:4310`.

Whenever a live application server is started, also start or verify a tailnet-only Tailscale Serve proxy to the local service so the owner can inspect it from another personal device. Keep the application bound to localhost, never use Tailscale Funnel, and verify both the local health endpoint and the Tailscale-served page before reporting that the server is available. For the default development port, the current working command is:

```powershell
tailscale serve --http=80 --bg --yes http://127.0.0.1:4310
```

## Definition of done

A change is done when:

1. the relevant user workflow works without AI where applicable;
2. input and authorization boundaries remain explicit;
3. focused tests cover the changed behavior;
4. `npm run verify` passes;
5. material architecture decisions are recorded in `docs/DECISIONS.md`;
6. `docs/CURRENT_STATE.md` reflects the next real step when a milestone changes.

Do not create daily reports, closure queues, generated task copies, speculative metadata, or self-maintaining skill systems.
