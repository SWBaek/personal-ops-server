import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

export type AiRuntimeEnvironment = "development" | "production" | "test";
export type AiRuntimeMode = "managed" | "custom";

export interface AiRuntimeConfig {
  workingDirectory: string;
  environment: AiRuntimeEnvironment;
  mode: AiRuntimeMode;
}

export type GrokRuntimeInspection = "isolated" | "unavailable";

type GrokInspectRunner = (
  command: string,
  args: string[],
  options: { cwd: string; encoding: "utf8"; shell: false; windowsHide: true },
) => SpawnSyncReturns<string>;

interface RuntimeSystem {
  platform?: NodeJS.Platform;
  homeDirectory?: string;
}

const PROJECT_INSTRUCTION_NAMES = new Set([
  "agents.md",
  "agents.override.md",
]);

export function resolveAiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  system: RuntimeSystem = {},
): AiRuntimeConfig {
  const environment = runtimeEnvironment(env);
  const customPath = env.OPS_AI_WORKING_DIR?.trim();
  if (customPath) {
    return {
      workingDirectory: resolve(customPath),
      environment,
      mode: "custom",
    };
  }

  const platform = system.platform ?? process.platform;
  const homeDirectory = system.homeDirectory ?? homedir();
  const baseDirectory = managedBaseDirectory(env, platform, homeDirectory);
  return {
    workingDirectory: join(baseDirectory, "PersonalOpsServer", environment, "ai-runtime"),
    environment,
    mode: "managed",
  };
}

export function prepareAiRuntime(config: AiRuntimeConfig): void {
  assertSafeAiRuntimePath(config.workingDirectory);
  mkdirSync(config.workingDirectory, { recursive: true });
  assertSafeAiRuntimePath(config.workingDirectory);
}

export function verifyGrokRuntimeIsolation(
  config: AiRuntimeConfig,
  runner: GrokInspectRunner = spawnSync,
): GrokRuntimeInspection {
  const result = runner(
    "grok",
    ["--cwd", config.workingDirectory, "inspect", "--json"],
    {
      cwd: config.workingDirectory,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );
  if (result.error && "code" in result.error && result.error.code === "ENOENT") return "unavailable";
  if (result.error || result.status !== 0) {
    throw new Error("Grok runtime isolation inspection failed");
  }

  let inspection: unknown;
  try {
    inspection = JSON.parse(result.stdout);
  } catch {
    throw new Error("Grok runtime isolation inspection returned invalid JSON");
  }
  if (!inspection || typeof inspection !== "object" || Array.isArray(inspection)) {
    throw new Error("Grok runtime isolation inspection returned an invalid result");
  }
  const projectInstructions = (inspection as Record<string, unknown>).projectInstructions;
  if (Array.isArray(projectInstructions) && projectInstructions.length > 0) {
    throw new Error("Grok runtime inherited project instructions");
  }
  return "isolated";
}

export function assertSafeAiRuntimePath(workingDirectory: string): void {
  if (!isAbsolute(workingDirectory)) {
    throw new Error("AI runtime directory must be absolute");
  }
  const target = resolve(workingDirectory);
  const root = parse(target).root;
  if (target === root || target === resolve(homedir())) {
    throw new Error("AI runtime directory is too broad");
  }

  for (let current = target; ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) {
      throw new Error("AI runtime directory must not be inside a Git project");
    }
    if (hasProjectInstructions(current)) {
      throw new Error("AI runtime directory must not inherit AGENTS.md instructions");
    }
    const parent = dirname(current);
    if (parent === current) break;
  }
}

function runtimeEnvironment(env: NodeJS.ProcessEnv): AiRuntimeEnvironment {
  const value = (env.OPS_RUNTIME_ENV ?? env.NODE_ENV ?? "development").trim().toLowerCase();
  if (value === "production" || value === "test" || value === "development") return value;
  throw new Error("OPS_RUNTIME_ENV must be development, production, or test");
}

function managedBaseDirectory(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homeDirectory: string,
): string {
  if (platform === "win32") {
    return resolve(env.LOCALAPPDATA?.trim() || join(homeDirectory, "AppData", "Local"));
  }
  if (platform === "darwin") {
    return resolve(join(homeDirectory, "Library", "Application Support"));
  }
  return resolve(
    env.XDG_STATE_HOME?.trim()
      || env.XDG_DATA_HOME?.trim()
      || join(homeDirectory, ".local", "state"),
  );
}

function hasProjectInstructions(directory: string): boolean {
  if (!existsSync(directory)) return false;
  try {
    return readdirSync(directory).some((name) => PROJECT_INSTRUCTION_NAMES.has(name.toLowerCase()));
  } catch {
    return false;
  }
}
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
