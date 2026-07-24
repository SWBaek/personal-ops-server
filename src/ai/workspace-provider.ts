import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { assistantProfilePrompt, type AssistantProfile } from "../domain/assistant-profile.js";
import {
  WORKSPACE_EXECUTION_SCHEMA,
  WORKSPACE_PLAN_SCHEMA,
  parseWorkspaceExecution,
  parseWorkspacePlan,
  type AiProviderId,
  type WorkspaceExecutionResult,
  type WorkspaceTurnPlan,
} from "../domain/workspace.js";

export interface WorkspaceProviderInput {
  provider: AiProviderId;
  model: string;
  reasoningEffort: string;
  rootPath: string;
  message: string;
  profile: AssistantProfile;
  signal: AbortSignal;
  onProgress?: (event: ProviderProgressEvent) => void;
}

export type ProviderPhase = "starting" | "checking_workos" | "composing" | "validating" | "committing";

export type ProviderProgressEvent =
  | { type: "started"; at: string }
  | { type: "signal"; at: string; phase: ProviderPhase }
  | { type: "stopped"; at: string };

export interface WorkspaceExecutionInput extends WorkspaceProviderInput {
  plan: WorkspaceTurnPlan;
}

export interface WorkspaceProvider {
  answer(input: WorkspaceProviderInput): Promise<ProviderRunOutcome<string>>;
  plan(input: WorkspaceProviderInput): Promise<ProviderRunOutcome<WorkspaceTurnPlan>>;
  execute(input: WorkspaceExecutionInput): Promise<ProviderRunOutcome<WorkspaceExecutionResult>>;
}

export interface ProviderCompletionEvidence {
  provider: AiProviderId;
  protocol: "codex-jsonl-final-file" | "grok-json";
  terminalReason: "end_turn";
  artifact: "output-last-message" | "json-object";
}

export type IncompleteReason =
  | "max_turns"
  | "max_tokens"
  | "missing_completion"
  | "missing_final"
  | "empty_final"
  | "artifact_too_large"
  | "malformed_final"
  | "unknown_terminal";

export type ProviderFailureReason =
  | "invalid_output"
  | "nonzero_exit"
  | "timeout"
  | "unavailable";

export type ProviderRunOutcome<T> =
  | { kind: "completed"; value: T; evidence: ProviderCompletionEvidence }
  | { kind: "cancelled"; source: "owner" | "provider" }
  | { kind: "incomplete"; reason: IncompleteReason }
  | { kind: "failed"; reason: ProviderFailureReason };

export interface Invocation {
  command: AiProviderId;
  args: string[];
  stdin: string | null;
}

interface ProcessOutcome {
  kind: "completed" | "cancelled" | "failed";
  stdout?: string;
  source?: "owner";
  reason?: ProviderFailureReason;
}

const MAX_PROVIDER_BYTES = 1024 * 1024;

export class CliWorkspaceProvider implements WorkspaceProvider {
  readonly #runtimeDir: string;
  readonly #planSchemaPath: string;
  readonly #executionSchemaPath: string;

  constructor(runtimeDir: string) {
    this.#runtimeDir = runtimeDir;
    mkdirSync(runtimeDir, { recursive: true });
    this.#planSchemaPath = join(runtimeDir, "workspace-turn-plan.schema.json");
    this.#executionSchemaPath = join(runtimeDir, "workspace-execution.schema.json");
    writeFileSync(this.#planSchemaPath, JSON.stringify(WORKSPACE_PLAN_SCHEMA), { encoding: "utf8", mode: 0o600 });
    writeFileSync(this.#executionSchemaPath, JSON.stringify(WORKSPACE_EXECUTION_SCHEMA), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async answer(input: WorkspaceProviderInput): Promise<ProviderRunOutcome<string>> {
    const invocation = buildDirectInvocation(input);
    return this.#run(input, invocation, (provider, output, finalArtifact) =>
      parseDirectProviderOutcome(provider, output, finalArtifact));
  }

  async plan(input: WorkspaceProviderInput): Promise<ProviderRunOutcome<WorkspaceTurnPlan>> {
    const prompt = buildPlanningPrompt(input.profile, input.message);
    const invocation = buildInvocation({
      ...input,
      prompt,
      write: false,
      schemaPath: this.#planSchemaPath,
      schema: WORKSPACE_PLAN_SCHEMA,
      capabilities: [],
    });
    return this.#run(input, invocation, (provider, output, finalArtifact) => {
      const artifact = parseStructuredProviderOutcome(provider, output, finalArtifact);
      return mapCompleted(artifact, (value) => parseWorkspacePlan(value));
    });
  }

  async execute(input: WorkspaceExecutionInput): Promise<ProviderRunOutcome<WorkspaceExecutionResult>> {
    const prompt = buildExecutionPrompt(input.profile, input.message, input.plan);
    const invocation = buildInvocation({
      ...input,
      prompt,
      write: true,
      schemaPath: this.#executionSchemaPath,
      schema: WORKSPACE_EXECUTION_SCHEMA,
      capabilities: input.plan.capabilities,
    });
    return this.#run(input, invocation, (provider, output, finalArtifact) => {
      const artifact = parseStructuredProviderOutcome(provider, output, finalArtifact);
      return mapCompleted(artifact, (value) => parseWorkspaceExecution(value));
    });
  }

  async #run<T>(
    input: WorkspaceProviderInput,
    invocation: Invocation,
    parse: (provider: AiProviderId, output: string, finalArtifact: string | null) => ProviderRunOutcome<T>,
  ): Promise<ProviderRunOutcome<T>> {
    const temporaryDirectory = mkdtempSync(join(this.#runtimeDir, "provider-run-"));
    const finalArtifactPath = join(temporaryDirectory, "final.txt");
    const effectiveInvocation = input.provider === "codex"
      ? {
          ...invocation,
          args: addCodexFinalArtifact(invocation.args, finalArtifactPath),
        }
      : invocation;
    try {
      const process = await runInvocation(
        effectiveInvocation,
        input.rootPath,
        input.signal,
        input.provider,
        input.onProgress,
      );
      if (process.kind === "cancelled") return { kind: "cancelled", source: "owner" };
      if (process.kind === "failed") return { kind: "failed", reason: process.reason ?? "invalid_output" };
      let finalArtifact: string | null = null;
      if (input.provider === "codex") {
        const inspected = inspectFinalArtifact(finalArtifactPath);
        if (inspected.kind !== "completed") return inspected;
        finalArtifact = inspected.value;
      }
      try {
        return parse(input.provider, process.stdout ?? "", finalArtifact);
      } catch {
        return { kind: "failed", reason: "invalid_output" };
      }
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

export function buildDirectInvocation(input: WorkspaceProviderInput): Invocation {
  if (input.provider === "codex") {
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "-C",
      input.rootPath,
      "-c",
      'web_search="disabled"',
      "-c",
      "mcp_servers={}",
      "--disable",
      "apps",
      "--disable",
      "multi_agent",
    ];
    args.push("--model", input.model);
    if (input.reasoningEffort !== "default") {
      args.push("-c", `model_reasoning_effort="${input.reasoningEffort}"`);
    }
    args.push("-");
    return { command: "codex", args, stdin: input.message };
  }

  const args = [
    "--no-auto-update",
    "--output-format",
    "json",
    "--cwd",
    input.rootPath,
    "--max-turns",
    "20",
    "--permission-mode",
    "dontAsk",
    "--allow",
    "Read",
    "--allow",
    "Grep",
    "--allow",
    "Bash(*)",
    "--deny",
    "Edit",
    "--sandbox",
    "read-only",
    "--no-plan",
    "--disable-web-search",
    "--no-memory",
    "--no-subagents",
  ];
  args.push("--model", input.model);
  if (input.reasoningEffort !== "default") {
    args.push("--reasoning-effort", input.reasoningEffort);
  }
  args.push("--verbatim", "--single", input.message);
  return { command: "grok", args, stdin: null };
}

export function buildInvocation(input: WorkspaceProviderInput & {
  prompt: string;
  write: boolean;
  schemaPath: string;
  schema: object;
  capabilities: WorkspaceTurnPlan["capabilities"];
}): Invocation {
  const has = (capability: WorkspaceTurnPlan["capabilities"][number]): boolean =>
    input.capabilities.includes(capability);
  if (input.provider === "codex") {
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--sandbox",
      input.write ? "workspace-write" : "read-only",
      "-C",
      input.rootPath,
      "--output-schema",
      input.schemaPath,
    ];
    if (!has("web")) args.push("-c", 'web_search="disabled"');
    if (!has("mcp")) args.push("-c", "mcp_servers={}", "--disable", "apps");
    if (!has("subagents")) args.push("--disable", "multi_agent");
    args.push("--model", input.model);
    if (input.reasoningEffort !== "default") {
      args.push("-c", `model_reasoning_effort="${input.reasoningEffort}"`);
    }
    args.push("-");
    return { command: "codex", args, stdin: input.prompt };
  }

  const args = [
    "--no-auto-update",
    "--output-format",
    "json",
    "--cwd",
    input.rootPath,
    "--max-turns",
    input.write ? "20" : "12",
    "--permission-mode",
    input.write ? "acceptEdits" : "plan",
    "--json-schema",
    JSON.stringify(input.schema),
  ];
  if (!has("web")) args.push("--disable-web-search");
  if (!has("subagents")) args.push("--no-subagents");
  args.push("--model", input.model);
  if (input.reasoningEffort !== "default") {
    args.push("--reasoning-effort", input.reasoningEffort);
  }
  args.push("--single", input.prompt);
  return { command: "grok", args, stdin: null };
}

export function parseDirectProviderOutcome(
  provider: AiProviderId,
  output: string,
  finalArtifact: string | null = null,
): ProviderRunOutcome<string> {
  if (provider === "codex") {
    const terminal = parseCodexTerminal(output);
    if (terminal.kind !== "completed") return terminal;
    if (!finalArtifact?.trim()) return { kind: "incomplete", reason: "empty_final" };
    return {
      kind: "completed",
      value: finalArtifact,
      evidence: codexEvidence(),
    };
  }
  const artifact = parseGrokArtifact(output);
  if (artifact.kind !== "completed") return artifact;
  const finalText = grokFinalText(artifact.value);
  if (finalText === null) return { kind: "incomplete", reason: "empty_final" };
  return {
    kind: "completed",
    value: finalText,
    evidence: grokEvidence(),
  };
}

export function parseStructuredProviderOutcome(
  provider: AiProviderId,
  output: string,
  finalArtifact: string | null = null,
): ProviderRunOutcome<unknown> {
  if (provider === "codex") {
    const terminal = parseCodexTerminal(output);
    if (terminal.kind !== "completed") return terminal;
    if (!finalArtifact?.trim()) return { kind: "incomplete", reason: "empty_final" };
    try {
      return {
        kind: "completed",
        value: parseFirstJsonObject(finalArtifact),
        evidence: codexEvidence(),
      };
    } catch {
      return { kind: "incomplete", reason: "malformed_final" };
    }
  }
  const artifact = parseGrokArtifact(output);
  if (artifact.kind !== "completed") return artifact;
  const structured = artifact.value.structuredOutput;
  const text = artifact.value.text;
  try {
    const value = structured !== undefined && structured !== null
      ? (typeof structured === "string" ? parseFirstJsonObject(structured) : structured)
      : (typeof text === "string" && text.trim() ? parseFirstJsonObject(text) : null);
    if (value === null) return { kind: "incomplete", reason: "empty_final" };
    return { kind: "completed", value, evidence: grokEvidence() };
  } catch {
    return { kind: "incomplete", reason: "malformed_final" };
  }
}

function parseCodexTerminal(output: string): ProviderRunOutcome<null> {
  let completed = false;
  try {
    for (const line of output.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as unknown;
      if (!isRecord(event) || typeof event.type !== "string") {
        return { kind: "incomplete", reason: "malformed_final" };
      }
      if (event.type === "turn.completed") completed = true;
      if (event.type === "turn.failed") return { kind: "failed", reason: "invalid_output" };
    }
  } catch {
    return { kind: "incomplete", reason: "malformed_final" };
  }
  return completed
    ? { kind: "completed", value: null, evidence: codexEvidence() }
    : { kind: "incomplete", reason: "missing_completion" };
}

function parseGrokArtifact(output: string): ProviderRunOutcome<Record<string, unknown>> {
  let artifact: unknown;
  try {
    artifact = JSON.parse(output);
  } catch {
    return { kind: "incomplete", reason: "malformed_final" };
  }
  if (!isRecord(artifact)) return { kind: "incomplete", reason: "malformed_final" };
  const reason = artifact.stopReason;
  if (reason === "Cancelled") return { kind: "cancelled", source: "provider" };
  if (reason === "MaxTurns") return { kind: "incomplete", reason: "max_turns" };
  if (reason === "MaxTokens") return { kind: "incomplete", reason: "max_tokens" };
  if (reason === undefined || reason === null || reason === "") {
    return { kind: "incomplete", reason: "missing_completion" };
  }
  if (reason !== "EndTurn") return { kind: "incomplete", reason: "unknown_terminal" };
  const text = artifact.text;
  const structured = artifact.structuredOutput;
  const hasText = typeof text === "string" && text.trim().length > 0;
  const hasStructured = validStructuredArtifact(structured);
  if (!hasText && !hasStructured) return { kind: "incomplete", reason: "missing_final" };
  return { kind: "completed", value: artifact, evidence: grokEvidence() };
}

function validStructuredArtifact(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") {
    if (!value.trim()) return false;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}

function grokFinalText(artifact: Record<string, unknown>): string | null {
  if (typeof artifact.text === "string" && artifact.text.trim()) return artifact.text;
  const structured = artifact.structuredOutput;
  if (!validStructuredArtifact(structured)) return null;
  return typeof structured === "string" ? structured : JSON.stringify(structured);
}

function buildPlanningPrompt(profile: AssistantProfile, message: string): string {
  return `You are operating from the configured WorkOS Git workspace.
The workspace AGENTS.md, PKM specification, and local skills are authoritative operational rules.
${assistantProfilePrompt(profile)}

This is the mandatory read-only preflight. Inspect only the files needed to understand the request.
Do not modify files, Git state, configuration, or external systems.
Classify the request:
- observe: answer now in reply; no later execution.
- execute: a narrow file operation explicitly requested by the owner.
- govern: deletion, move, archive, bulk rewrite, workspace rules, external tools, or remote Git.
Use paths relative to the WorkOS root. Include "local" when local file/search/shell tools are sufficient.
Name web, mcp, subagents, external_reviewer, or remote_git only when genuinely required.
Return only the requested JSON object.

Owner request:
${message}`;
}

function buildExecutionPrompt(
  profile: AssistantProfile,
  message: string,
  plan: WorkspaceTurnPlan,
): string {
  return `You are now authorized to execute exactly the validated WorkOS plan below.
The workspace AGENTS.md, PKM specification, and local skills remain authoritative.
${assistantProfilePrompt(profile)}

Application boundary:
- Stay inside the current WorkOS root.
- Apply only the requested and approved scope.
- Do not commit, push, change branches, or alter Git history. The application owns commits.
- Do not use capabilities outside the plan.
- Preserve unrelated work and validate the changed files.
- Return only the requested JSON result.

Validated plan:
${JSON.stringify(plan)}

Owner request:
${message}`;
}

function runInvocation(
  invocation: Invocation,
  cwd: string,
  signal: AbortSignal,
  provider: AiProviderId,
  onProgress?: (event: ProviderProgressEvent) => void,
): Promise<ProcessOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const progressParser = createProviderProgressParser(provider, onProgress);
    let captured = 0;
    let error: ProviderFailureReason | "cancelled" | null = null;
    let settled = false;
    const stop = (next: ProviderFailureReason | "cancelled"): void => {
      if (error) return;
      error = next;
      child.kill();
    };
    const timer = setTimeout(() => stop("timeout"), 300_000);
    const onAbort = (): void => stop("cancelled");
    signal.addEventListener("abort", onAbort, { once: true });
    const capture = (chunk: Buffer, keep: boolean): void => {
      captured += chunk.length;
      if (captured > MAX_PROVIDER_BYTES) {
        stop("invalid_output");
      } else if (keep) {
        stdout.push(chunk);
        if (provider === "codex") progressParser.push(chunk);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => capture(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => capture(chunk, false));
    child.once("error", () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (!settled) {
        settled = true;
        resolve({ kind: "failed", reason: "unavailable" });
      }
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (settled) return;
      settled = true;
      progressParser.finish();
      onProgress?.({ type: "stopped", at: new Date().toISOString() });
      if (error === "cancelled") return resolve({ kind: "cancelled", source: "owner" });
      if (error) return resolve({ kind: "failed", reason: error });
      if (code !== 0) return resolve({ kind: "failed", reason: "nonzero_exit" });
      resolve({ kind: "completed", stdout: Buffer.concat(stdout).toString("utf8") });
    });
    if (invocation.stdin === null) child.stdin.end();
    else child.stdin.end(invocation.stdin, "utf8");
    onProgress?.({ type: "started", at: new Date().toISOString() });
  });
}

function addCodexFinalArtifact(args: string[], finalArtifactPath: string): string[] {
  const promptIndex = args.lastIndexOf("-");
  const insertion = ["--output-last-message", finalArtifactPath];
  if (promptIndex < 0) return [...args, ...insertion];
  return [...args.slice(0, promptIndex), ...insertion, ...args.slice(promptIndex)];
}

export function inspectFinalArtifact(path: string): ProviderRunOutcome<string> {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return { kind: "incomplete", reason: "missing_final" };
    if (stat.size > MAX_PROVIDER_BYTES) return { kind: "incomplete", reason: "artifact_too_large" };
    const value = readFileSync(path, "utf8");
    if (!value.trim()) return { kind: "incomplete", reason: "empty_final" };
    return { kind: "completed", value, evidence: codexEvidence() };
  } catch {
    return { kind: "incomplete", reason: "missing_final" };
  }
}

function mapCompleted<T, U>(
  outcome: ProviderRunOutcome<T>,
  map: (value: T) => U,
): ProviderRunOutcome<U> {
  if (outcome.kind !== "completed") return outcome;
  try {
    return { kind: "completed", value: map(outcome.value), evidence: outcome.evidence };
  } catch {
    return { kind: "failed", reason: "invalid_output" };
  }
}

function codexEvidence(): ProviderCompletionEvidence {
  return {
    provider: "codex",
    protocol: "codex-jsonl-final-file",
    terminalReason: "end_turn",
    artifact: "output-last-message",
  };
}

function grokEvidence(): ProviderCompletionEvidence {
  return {
    provider: "grok",
    protocol: "grok-json",
    terminalReason: "end_turn",
    artifact: "json-object",
  };
}

export function createProviderProgressParser(
  provider: AiProviderId,
  onProgress?: (event: ProviderProgressEvent) => void,
): { push(chunk: Uint8Array): void; finish(): void } {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let pending = "";
  const inspect = (line: string): void => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as unknown;
      if (!isRecord(event) || typeof event.type !== "string") return;
      const phase = safePhaseForEvent(provider, event);
      if (phase) onProgress?.({ type: "signal", at: new Date().toISOString(), phase });
    } catch {
      // Progress parsing is advisory. The terminal parser remains authoritative.
    }
  };
  return {
    push(chunk) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? "";
      for (const line of lines) inspect(line);
    },
    finish() {
      pending += decoder.decode();
      inspect(pending);
      pending = "";
    },
  };
}

function safePhaseForEvent(provider: AiProviderId, event: Record<string, unknown>): ProviderPhase | null {
  if (provider === "codex") {
    if (event.type === "thread.started" || event.type === "turn.started") return "checking_workos";
    if (event.type === "item.started" || event.type === "item.completed") return "composing";
    if (event.type === "turn.completed" || event.type === "turn.failed") return "validating";
    return null;
  }
  if (event.type === "start" || event.type === "thought" || event.type === "tool") return "checking_workos";
  if (event.type === "text") return "composing";
  if (event.type === "end" || event.type === "result") return "validating";
  return null;
}

function parseFirstJsonObject(value: string): unknown {
  const start = value.indexOf("{");
  if (start < 0) throw new Error("structured result has no JSON object");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }
    if (character === "\"") {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        const trailing = value.slice(index + 1).trim().replace(/^```(?:\s*)/u, "").trim();
        if (trailing.startsWith("{") || trailing.startsWith("[")) {
          throw new Error("structured result contains multiple JSON values");
        }
        return JSON.parse(value.slice(start, index + 1)) as unknown;
      }
    }
  }
  throw new Error("structured result has an incomplete JSON object");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
