# WorkOS Web Assistant

A private responsive web workspace for using the official `codex` and `grok` CLIs directly with the owner’s WorkOS.

WorkOS remains the single source of truth. Ordinary questions use one read-only CLI call and preserve the CLI’s final answer without a structured planning pass. Explicit file-changing requests add risk-based planning and approval, durable job state, local Git receipts, diffs, and latest-receipt Undo. The application does not duplicate projects, schedules, tasks, or knowledge in SQLite.

Provider answers remain stored as original Markdown. The browser renders assistant messages through a sanitized Markdown presentation layer; owner messages remain plain text.

WorkOS is primarily synchronized by Obsidian Sync. Remote Git upload and push are optional and are never required or performed automatically. Local Git exists only to provide transactional receipts and Undo for assistant changes.

## Requirements

- Node.js 24 or newer
- npm
- an existing WorkOS Git root with a root `AGENTS.md`
- authenticated official `codex` and/or `grok` CLI

## Quick start

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://127.0.0.1:4310`. On first use, choose the WorkOS root and explicitly grant Codex and/or Grok access. The path is stored only in local runtime configuration.

For owner-only remote access:

```powershell
tailscale serve --https=4310 --bg --yes http://127.0.0.1:4310
```

Use the private tailnet hostname with HTTPS port `4310`. Do not use Funnel or public port forwarding.

## Verification

```powershell
npx playwright install chromium
npm run verify
```

Playwright uses a synthetic WorkOS repository and ignored artifacts under `var/playwright/`; tests never use personal WorkOS data.

## Boundaries

- No model APIs, SDK model calls, or model API keys.
- No browser shell, raw command input, arbitrary filesystem browser, or credential access.
- Read-only questions may run while WorkOS is dirty; mutations require a clean worktree.
- High-risk or external capabilities require a separate visible approval.
- Successful mutations create one application-owned local commit and receipt.
- Remote Git is optional and outside the default workflow.
- Machine-specific paths and hostnames belong only in ignored local configuration.

See [Product Overview](docs/PRODUCT_OVERVIEW.md), [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), and [Current State](docs/CURRENT_STATE.md).
