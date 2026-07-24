import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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
import { AiChatError } from "./chat-service.js";

export interface WorkspaceProviderInput {
  provider: AiProviderId;
  model: string;
  reasoningEffort: string;
  rootPath: string;
  message: string;
  profile: AssistantProfile;
  signal: AbortSignal;
}

export interface WorkspaceExecutionInput extends WorkspaceProviderInput {
  plan: WorkspaceTurnPlan;
}

export interface WorkspaceProvider {
  answer(input: WorkspaceProviderInput): Promise<string>;
  plan(input: WorkspaceProviderInput): Promise<WorkspaceTurnPlan>;
  execute(input: WorkspaceExecutionInput): Promise<WorkspaceExecutionResult>;
}

interface Invocation {
  command: AiProviderId;
  args: string[];
  stdin: string | null;
}

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

  async answer(input: WorkspaceProviderInput): Promise<string> {
    const invocation = buildDirectInvocation(input);
    const output = await runInvocation(invocation, input.rootPath, input.signal);
    return parseDirectProviderText(input.provider, output);
  }

  async plan(input: WorkspaceProviderInput): Promise<WorkspaceTurnPlan> {
    const prompt = buildPlanningPrompt(input.profile, input.message);
    const invocation = buildInvocation({
      ...input,
      prompt,
      write: false,
      schemaPath: this.#planSchemaPath,
      schema: WORKSPACE_PLAN_SCHEMA,
      capabilities: [],
    });
    const output = await runInvocation(invocation, input.rootPath, input.signal);
    return parseWorkspacePlan(parseProviderJson(input.provider, output));
  }

  async execute(input: WorkspaceExecutionInput): Promise<WorkspaceExecutionResult> {
    const prompt = buildExecutionPrompt(input.profile, input.message, input.plan);
    const invocation = buildInvocation({
      ...input,
      prompt,
      write: true,
      schemaPath: this.#executionSchemaPath,
      schema: WORKSPACE_EXECUTION_SCHEMA,
      capabilities: input.plan.capabilities,
    });
    const output = await runInvocation(invocation, input.rootPath, input.signal);
    return parseWorkspaceExecution(parseProviderJson(input.provider, output));
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
    "plan",
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

export function parseDirectProviderText(provider: AiProviderId, output: string): string {
  try {
    if (provider === "grok") {
      const result = JSON.parse(output) as unknown;
      if (isRecord(result) && typeof result.text === "string" && result.text.trim()) {
        return result.text;
      }
      throw new Error("missing Grok response text");
    }
    let finalText: string | null = null;
    for (const line of output.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as unknown;
      if (
        isRecord(event)
        && event.type === "item.completed"
        && isRecord(event.item)
        && event.item.type === "agent_message"
        && typeof event.item.text === "string"
      ) {
        finalText = event.item.text;
      }
    }
    if (!finalText?.trim()) throw new Error("missing Codex response text");
    return finalText;
  } catch {
    throw new AiChatError("AI provider returned no usable answer", 502);
  }
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
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let captured = 0;
    let error: AiChatError | null = null;
    let settled = false;
    const stop = (next: AiChatError): void => {
      if (error) return;
      error = next;
      child.kill();
    };
    const timer = setTimeout(() => stop(new AiChatError("AI provider timed out", 504)), 300_000);
    const onAbort = (): void => stop(new AiChatError("AI request was cancelled", 499));
    signal.addEventListener("abort", onAbort, { once: true });
    const capture = (chunk: Buffer, keep: boolean): void => {
      captured += chunk.length;
      if (captured > 1024 * 1024) {
        stop(new AiChatError("AI provider output exceeded the safe limit", 502));
      } else if (keep) {
        stdout.push(chunk);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => capture(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => capture(chunk, false));
    child.once("error", () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (!settled) {
        settled = true;
        reject(new AiChatError("Selected AI provider is unavailable", 503));
      }
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (settled) return;
      settled = true;
      if (error) return reject(error);
      if (code !== 0) return reject(new AiChatError("AI provider could not complete the request", 502));
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
    if (invocation.stdin === null) child.stdin.end();
    else child.stdin.end(invocation.stdin, "utf8");
  });
}

export function parseProviderJson(provider: AiProviderId, output: string): unknown {
  try {
    if (provider === "grok") {
      const result = JSON.parse(output) as unknown;
      if (isRecord(result)) {
        if (result.structuredOutput !== undefined && result.structuredOutput !== null) {
          return typeof result.structuredOutput === "string"
            ? parseFirstJsonObject(result.structuredOutput)
            : result.structuredOutput;
        }
        if (typeof result.text === "string") {
          return parseFirstJsonObject(result.text);
        }
      }
      return result;
    }
    let finalText: string | null = null;
    for (const line of output.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as unknown;
      if (
        isRecord(event)
        && event.type === "item.completed"
        && isRecord(event.item)
        && event.item.type === "agent_message"
        && typeof event.item.text === "string"
      ) {
        finalText = event.item.text;
      }
    }
    if (!finalText) throw new Error("missing structured result");
    return parseFirstJsonObject(finalText);
  } catch {
    throw new AiChatError("AI provider returned an invalid structured result", 502);
  }
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
