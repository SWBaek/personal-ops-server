import { resolve } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  aiWorkingDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.OPS_PORT ?? "4310";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`OPS_PORT must be a valid TCP port, received: ${rawPort}`);
  }

  return {
    host: env.OPS_HOST?.trim() || "127.0.0.1",
    port,
    dataDir: resolve(env.OPS_DATA_DIR?.trim() || "./data"),
    aiWorkingDir: resolve(env.OPS_AI_WORKING_DIR?.trim() || "./var/ai-workspace"),
  };
}
