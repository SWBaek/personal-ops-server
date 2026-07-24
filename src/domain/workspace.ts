import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

import { InputError, requireNonEmptyText } from "./validation.js";

export type AiProviderId = "codex" | "grok";
export type WorkspaceMode = "observe" | "execute" | "govern";
export type WorkspaceCapability =
  | "local"
  | "web"
  | "mcp"
  | "subagents"
  | "external_reviewer"
  | "remote_git";

export interface WorkspaceConfiguration {
  rootPath: string;
  codexGranted: boolean;
  grokGranted: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceValidation {
  valid: boolean;
  rootPath: string;
  gitRoot: string | null;
  hasAgents: boolean;
  branch: string | null;
  dirty: boolean;
  dirtyPaths: string[];
  errors: string[];
}

export interface WorkspaceTurnPlan {
  mode: WorkspaceMode;
  summary: string;
  reply: string;
  risk: "low" | "high";
  expectedPaths: string[];
  operations: string[];
  capabilities: WorkspaceCapability[];
  rationale: string;
  requiresApproval: boolean;
}

export interface WorkspaceExecutionResult {
  reply: string;
  semanticSummary: string;
  changedPaths: string[];
  validation: string[];
}

export const WORKSPACE_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "mode",
    "summary",
    "reply",
    "risk",
    "expectedPaths",
    "operations",
    "capabilities",
    "rationale",
    "requiresApproval",
  ],
  properties: {
    mode: { type: "string", enum: ["observe", "execute", "govern"] },
    summary: { type: "string", minLength: 1, maxLength: 1_000 },
    reply: { type: "string", maxLength: 64_000 },
    risk: { type: "string", enum: ["low", "high"] },
    expectedPaths: {
      type: "array",
      maxItems: 100,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    operations: {
      type: "array",
      maxItems: 50,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    capabilities: {
      type: "array",
      items: {
        type: "string",
        enum: ["local", "web", "mcp", "subagents", "external_reviewer", "remote_git"],
      },
    },
    rationale: { type: "string", minLength: 1, maxLength: 2_000 },
    requiresApproval: { type: "boolean" },
  },
} as const;

export const WORKSPACE_EXECUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "semanticSummary", "changedPaths", "validation"],
  properties: {
    reply: { type: "string", minLength: 1, maxLength: 64_000 },
    semanticSummary: { type: "string", minLength: 1, maxLength: 2_000 },
    changedPaths: {
      type: "array",
      maxItems: 200,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
    validation: {
      type: "array",
      maxItems: 50,
      items: { type: "string", minLength: 1, maxLength: 1_000 },
    },
  },
} as const;

const HIGH_RISK_ROOTS = [
  "AGENTS.md",
  ".agents/",
  ".codex/",
  "20-Knowledge/Tools-Methods/PKM-System-Spec.md",
  "60-Templates/",
  "80-Dashboard/",
  "90-System/",
];

const HIGH_RISK_CAPABILITIES = new Set<WorkspaceCapability>([
  "web",
  "mcp",
  "subagents",
  "external_reviewer",
  "remote_git",
]);

export function parseWorkspacePlan(value: unknown): WorkspaceTurnPlan {
  if (!isRecord(value)) throw new InputError("AI planning result must be an object");
  const mode = requireEnum(value.mode, "mode", ["observe", "execute", "govern"]);
  const risk = requireEnum(value.risk, "risk", ["low", "high"]);
  const plan: WorkspaceTurnPlan = {
    mode,
    summary: requireNonEmptyText(value.summary, "summary", 1_000),
    reply: typeof value.reply === "string" ? value.reply.trim() : "",
    risk,
    expectedPaths: stringArray(value.expectedPaths, "expectedPaths", 100, 500).map(normalizeRelativePath),
    operations: stringArray(value.operations, "operations", 50, 500),
    capabilities: capabilityArray(value.capabilities),
    rationale: requireNonEmptyText(value.rationale, "rationale", 2_000),
    requiresApproval: requireBoolean(value.requiresApproval, "requiresApproval"),
  };
  return enforceWorkspaceRisk(plan);
}

export function parseWorkspaceExecution(value: unknown): WorkspaceExecutionResult {
  if (!isRecord(value)) throw new InputError("AI execution result must be an object");
  return {
    reply: requireNonEmptyText(value.reply, "reply", 64_000),
    semanticSummary: requireNonEmptyText(value.semanticSummary, "semanticSummary", 2_000),
    changedPaths: stringArray(value.changedPaths, "changedPaths", 200, 500).map(normalizeRelativePath),
    validation: stringArray(value.validation, "validation", 50, 1_000),
  };
}

export function enforceWorkspaceRisk(plan: WorkspaceTurnPlan): WorkspaceTurnPlan {
  const operationText = plan.operations.join(" ").toLowerCase();
  const highByOperation = /(delete|remove|move|rename|archive|bulk|migrate|install|reset|rebase|push|publish|send)/u
    .test(operationText);
  const highByPath = plan.expectedPaths.some((path) =>
    HIGH_RISK_ROOTS.some((root) => path === root || path.startsWith(root)));
  const highByCapability = plan.capabilities.some((capability) => HIGH_RISK_CAPABILITIES.has(capability));
  const high = plan.mode === "govern"
    || plan.expectedPaths.length > 5
    || highByOperation
    || highByPath
    || highByCapability;
  return {
    ...plan,
    risk: high ? "high" : plan.risk,
    requiresApproval: high || plan.requiresApproval,
  };
}

export function providerGranted(
  configuration: WorkspaceConfiguration,
  provider: AiProviderId,
): boolean {
  return provider === "codex" ? configuration.codexGranted : configuration.grokGranted;
}

export function requestsWorkspaceMutation(message: string): boolean {
  const normalized = message.normalize("NFKC").trim().toLowerCase();
  const koreanCommand =
    /(?:(?:추가|생성|작성|수정|변경|업데이트|삭제|제거|이동|저장|완료\s*처리|설치)\s*(?:해|해줘|해주세요|해라|하라|하세요|줘|주세요|줘요)|(?:만들어|바꿔|옮겨|미뤄)(?:줘|주세요|줘요)?)(?=$|[\s.!?,])/u;
  const englishCommand =
    /^(?:(?:please|can you|could you|would you|i want you to)\s+)*(?:create|add|edit|update|delete|remove|move|rename|archive|write|save|complete|reschedule|install|commit|push|pull)\b/u;
  return koreanCommand.test(normalized) || englishCommand.test(normalized);
}

export function assertPathInsideWorkspace(rootPath: string, candidate: string): string {
  const relativePath = normalizeRelativePath(candidate);
  const absolute = resolve(rootPath, relativePath);
  const fromRoot = relative(resolve(rootPath), absolute);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === ".." || isAbsolute(fromRoot)) {
    throw new InputError("workspace path must stay inside the configured WorkOS root");
  }
  return relativePath;
}

function normalizeRelativePath(value: string): string {
  const trimmed = value.trim().replaceAll("\\", "/").replace(/^\.\/+/u, "");
  if (!trimmed || trimmed === "." || isAbsolute(trimmed) || trimmed.startsWith("../") || trimmed === "..") {
    throw new InputError("workspace paths must be relative");
  }
  const normalized = normalize(trimmed).replaceAll("\\", "/");
  if (normalized === ".git" || normalized.startsWith(".git/") || normalized.startsWith("../")) {
    throw new InputError("workspace paths must not target Git internals");
  }
  return normalized;
}

function capabilityArray(value: unknown): WorkspaceCapability[] {
  const values = stringArray(value, "capabilities", 20, 100);
  const allowed: WorkspaceCapability[] = [
    "local",
    "web",
    "mcp",
    "subagents",
    "external_reviewer",
    "remote_git",
  ];
  if (values.some((item) => !allowed.includes(item as WorkspaceCapability))) {
    throw new InputError("capabilities contains an unsupported value");
  }
  return [...new Set(values)] as WorkspaceCapability[];
}

function stringArray(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new InputError(`${field} must be an array with at most ${maxItems} items`);
  }
  return value.map((item, index) => requireNonEmptyText(item, `${field}[${index}]`, maxLength));
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new InputError(`${field} must be a boolean`);
  return value;
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new InputError(`${field} is not supported`);
  }
  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
