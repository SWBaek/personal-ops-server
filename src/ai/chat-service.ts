import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

import { InputError, requireNonEmptyText } from "../domain/validation.js";

export type AiProviderId = "codex" | "grok";

export interface AiProviderOption {
  id: AiProviderId;
  label: string;
  models: Array<{ id: string; label: string }>;
  reasoningEfforts: Array<{ id: string; label: string }>;
}

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  {
    id: "codex",
    label: "Codex",
    models: [
      { id: "default", label: "기본 모델" },
      { id: "gpt-5.6", label: "GPT-5.6" },
      { id: "gpt-5.4", label: "GPT-5.4" },
    ],
    reasoningEfforts: [
      { id: "default", label: "기본값" },
      { id: "low", label: "낮음" },
      { id: "medium", label: "보통" },
      { id: "high", label: "높음" },
      { id: "xhigh", label: "매우 높음" },
    ],
  },
  {
    id: "grok",
    label: "Grok",
    models: [
      { id: "default", label: "기본 모델" },
      { id: "grok-4.5", label: "Grok 4.5" },
    ],
    reasoningEfforts: [
      { id: "default", label: "기본값" },
      { id: "low", label: "낮음" },
      { id: "medium", label: "보통" },
      { id: "high", label: "높음" },
    ],
  },
];

export interface AiChatInput {
  provider: AiProviderId;
  model: string;
  reasoningEffort: string;
  message: string;
}

export interface AiUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface AiChatResult {
  text: string;
  usage: AiUsage | null;
  durationMs: number;
}

export interface AiChatService {
  chat(input: AiChatInput): Promise<AiChatResult>;
}

interface AiChatRequestBody {
  provider?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
  message?: unknown;
}

interface CliAiChatServiceOptions {
  workingDirectory: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ProviderInvocation {
  command: AiProviderId;
  args: string[];
  stdin: string | null;
}

interface StructuredOutputOptions {
  schemaPath: string;
  schema: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_RESPONSE_LENGTH = 64 * 1024;

export function validateAiChatInput(body: AiChatRequestBody | undefined): AiChatInput {
  const provider = requireAllowedValue(
    body?.provider,
    "provider",
    AI_PROVIDER_OPTIONS.map((option) => option.id),
  ) as AiProviderId;
  const providerOptions = AI_PROVIDER_OPTIONS.find((option) => option.id === provider);
  if (!providerOptions) {
    throw new InputError("provider is not supported");
  }

  return {
    provider,
    model: requireAllowedValue(
      body?.model ?? "default",
      "model",
      providerOptions.models.map((option) => option.id),
    ),
    reasoningEffort: requireAllowedValue(
      body?.reasoningEffort ?? "default",
      "reasoningEffort",
      providerOptions.reasoningEfforts.map((option) => option.id),
    ),
    message: requireNonEmptyText(body?.message, "message", 8_000),
  };
}

export class CliAiChatService implements AiChatService {
  readonly #workingDirectory: string;
  readonly #timeoutMs: number;
  readonly #maxOutputBytes: number;
  readonly #activeProviders = new Set<AiProviderId>();

  constructor(options: CliAiChatServiceOptions) {
    this.#workingDirectory = options.workingDirectory;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    mkdirSync(this.#workingDirectory, { recursive: true });
  }

  async chat(input: AiChatInput): Promise<AiChatResult> {
    return this.#run(input);
  }

  async structuredChat(
    input: AiChatInput,
    output: StructuredOutputOptions,
  ): Promise<AiChatResult> {
    return this.#run(input, output);
  }

  async #run(input: AiChatInput, output?: StructuredOutputOptions): Promise<AiChatResult> {
    if (this.#activeProviders.has(input.provider)) {
      throw new AiChatError("The selected AI provider is already handling a request", 409);
    }

    this.#activeProviders.add(input.provider);
    const startedAt = performance.now();
    try {
      const invocation = buildProviderInvocation(input, this.#workingDirectory, output);
      const stdout = await runInvocation(invocation, {
        workingDirectory: this.#workingDirectory,
        timeoutMs: this.#timeoutMs,
        maxOutputBytes: this.#maxOutputBytes,
      });
      const parsed = input.provider === "codex"
        ? parseCodexOutput(stdout)
        : parseGrokOutput(stdout);
      return { ...parsed, durationMs: Math.round(performance.now() - startedAt) };
    } finally {
      this.#activeProviders.delete(input.provider);
    }
  }
}

export function buildProviderInvocation(
  input: AiChatInput,
  workingDirectory: string,
  output?: StructuredOutputOptions,
): ProviderInvocation {
  if (input.provider === "codex") {
    const args = [
      "exec",
      "--json",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--ignore-user-config",
      "--skip-git-repo-check",
      "-C",
      workingDirectory,
      "-c",
      'web_search="disabled"',
      "-c",
      "project_root_markers=[]",
      "--disable",
      "apps",
      "--disable",
      "multi_agent",
      "--disable",
      "shell_tool",
    ];
    if (input.model !== "default") {
      args.push("--model", input.model);
    }
    if (input.reasoningEffort !== "default") {
      args.push("-c", `model_reasoning_effort="${input.reasoningEffort}"`);
    }
    if (output) args.push("--output-schema", output.schemaPath);
    args.push("-");
    return { command: "codex", args, stdin: input.message };
  }

  const args = [
    "--no-auto-update",
    "--output-format",
    "json",
    "--cwd",
    workingDirectory,
    "--disable-web-search",
    "--no-memory",
    "--no-subagents",
    "--no-plan",
    "--max-turns",
    "3",
    "--permission-mode",
    "plan",
  ];
  if (input.model !== "default") {
    args.push("--model", input.model);
  }
  if (input.reasoningEffort !== "default") {
    args.push("--reasoning-effort", input.reasoningEffort);
  }
  if (output) args.push("--json-schema", output.schema);
  args.push("--single", input.message);
  return { command: "grok", args, stdin: null };
}

export function parseCodexOutput(stdout: string): Omit<AiChatResult, "durationMs"> {
  let text: string | null = null;
  let usage: AiUsage | null = null;

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      throw new AiChatError("Codex returned an invalid response", 502);
    }

    if (!isRecord(event)) continue;
    if (event.type === "item.completed" && isRecord(event.item)) {
      if (event.item.type === "agent_message" && typeof event.item.text === "string") {
        text = event.item.text;
      }
    }
    if (event.type === "turn.completed" && isRecord(event.usage)) {
      usage = mapUsage(event.usage, {
        input: "input_tokens",
        cached: "cached_input_tokens",
        output: "output_tokens",
        reasoning: "reasoning_output_tokens",
      });
    }
  }

  return { text: requireResponseText(text, "Codex"), usage };
}

export function parseGrokOutput(stdout: string): Omit<AiChatResult, "durationMs"> {
  let result: unknown;
  try {
    result = JSON.parse(stdout);
  } catch {
    throw new AiChatError("Grok returned an invalid response", 502);
  }
  if (!isRecord(result)) {
    throw new AiChatError("Grok returned an invalid response", 502);
  }

  const usage = isRecord(result.usage)
    ? mapUsage(result.usage, {
        input: "input_tokens",
        cached: "cache_read_input_tokens",
        output: "output_tokens",
        reasoning: "reasoning_tokens",
      })
    : null;
  return {
    text: requireResponseText(typeof result.text === "string" ? result.text : null, "Grok"),
    usage,
  };
}

export class AiChatError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AiChatError";
    this.statusCode = statusCode;
  }
}

function requireAllowedValue(value: unknown, field: string, allowed: readonly string[]): string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new InputError(`${field} is not supported`);
  }
  return value;
}

function runInvocation(
  invocation: ProviderInvocation,
  options: Required<Omit<CliAiChatServiceOptions, "workingDirectory">> & {
    workingDirectory: string;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.workingDirectory,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    let capturedBytes = 0;
    let abortError: AiChatError | null = null;
    let settled = false;

    const stopWith = (error: AiChatError): void => {
      if (abortError) return;
      abortError = error;
      child.kill();
    };
    const timer = setTimeout(() => {
      stopWith(new AiChatError("The AI provider did not respond in time", 504));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      capturedBytes += chunk.length;
      if (capturedBytes > options.maxOutputBytes) {
        stopWith(new AiChatError("The AI provider response was too large", 502));
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      capturedBytes += chunk.length;
      if (capturedBytes > options.maxOutputBytes) {
        stopWith(new AiChatError("The AI provider response was too large", 502));
      }
    });
    child.once("error", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new AiChatError("The selected AI provider is unavailable", 503));
      }
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (abortError) {
        reject(abortError);
        return;
      }
      if (code !== 0) {
        reject(new AiChatError("The AI provider could not complete the request", 502));
        return;
      }
      resolve(Buffer.concat(stdoutChunks).toString("utf8"));
    });

    if (invocation.stdin === null) {
      child.stdin.end();
    } else {
      child.stdin.end(invocation.stdin, "utf8");
    }
  });
}

function requireResponseText(text: string | null, provider: string): string {
  const normalized = text?.trim();
  if (!normalized) {
    throw new AiChatError(`${provider} returned no answer`, 502);
  }
  if (normalized.length > MAX_RESPONSE_LENGTH) {
    throw new AiChatError(`${provider} returned an answer that was too large`, 502);
  }
  return normalized;
}

function mapUsage(
  usage: Record<string, unknown>,
  keys: { input: string; cached: string; output: string; reasoning: string },
): AiUsage {
  return {
    inputTokens: numberOrZero(usage[keys.input]),
    cachedInputTokens: numberOrZero(usage[keys.cached]),
    outputTokens: numberOrZero(usage[keys.output]),
    reasoningTokens: numberOrZero(usage[keys.reasoning]),
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
