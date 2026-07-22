# Security Model

## Assets

- personal tasks, notes, and project context;
- local filesystem access;
- Codex and Grok subscription sessions;
- remote access identity;
- audit history and backups.

## Trust boundaries

1. A browser request is untrusted even when it arrives through the private network.
2. User-provided text and retrieved documents may contain prompt injection.
3. CLI output is untrusted input to the application.
4. The AI model is not authorized to mutate state merely because it proposed an operation.
5. Subscription credential files and OS keyring entries are never application data.

## Required controls

- Bind the application to localhost by default.
- Use Tailscale Serve rather than public ingress.
- Add application authentication before remote mutation or AI execution.
- Spawn binaries directly with `shell: false` and fixed command shapes.
- Never accept a browser-provided executable, flag list, working directory, or filesystem path.
- Use a fixed project working directory and explicit allowlisted data paths.
- Default Codex runs to a read-only sandbox.
- Never enable Grok `--always-approve` for web-triggered work.
- Apply database changes only through validated domain commands.
- Log who requested and applied each mutation, without prompts that contain secrets.
- Rate-limit authentication attempts and AI jobs.
- Set process timeouts and output-size limits.
- Keep dependencies and CLIs updated deliberately, not during an active request.
- Back up the database and test restoration.

## Prohibited designs

- web terminal or remote shell;
- command strings constructed from user input;
- API keys stored in environment variables for model access;
- reading or copying `~/.codex/auth.json`, `~/.grok`, browser cookies, or OS credential-store contents;
- public exposure through router forwarding, Funnel, or an unauthenticated reverse proxy;
- unrestricted model access to the user's home directory;
- autonomous deletion, archival, migration, or bulk rewriting.

## Approval model

Read-only questions can run after authentication. Proposed mutations display the exact affected entity and before/after values. Destructive, bulk, external-transmission, and system-configuration operations require a stronger explicit approval path.

