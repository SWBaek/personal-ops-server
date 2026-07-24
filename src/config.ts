import { resolve } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  runtimeDir: string;
  workspaceSeed: string | null;
  environment: "development" | "production" | "test";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.OPS_PORT ?? "4310";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`OPS_PORT must be a valid TCP port, received: ${rawPort}`);
  }
  const environment = readEnvironment(env.OPS_RUNTIME_ENV ?? env.NODE_ENV ?? "development");
  const dataDir = resolve(env.OPS_DATA_DIR?.trim() || "./data");
  return {
    host: env.OPS_HOST?.trim() || "127.0.0.1",
    port,
    dataDir,
    runtimeDir: resolve(env.OPS_RUNTIME_DIR?.trim() || `${dataDir}/runtime/${environment}`),
    workspaceSeed: env.OPS_WORKOS_ROOT?.trim() || null,
    environment,
  };
}

function readEnvironment(value: string): AppConfig["environment"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "development" || normalized === "production" || normalized === "test") {
    return normalized;
  }
  throw new Error("OPS_RUNTIME_ENV must be development, production, or test");
}
