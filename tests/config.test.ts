import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.js";

test("configuration accepts machine-specific paths from the environment", () => {
  const config = loadConfig({
    OPS_HOST: "127.0.0.1",
    OPS_PORT: "5432",
    OPS_DATA_DIR: "./runtime-data",
    OPS_AI_WORKING_DIR: "./runtime-ai",
  });

  assert.deepEqual(config, {
    host: "127.0.0.1",
    port: 5432,
    dataDir: resolve("./runtime-data"),
    aiWorkingDir: resolve("./runtime-ai"),
    aiRuntime: {
      workingDirectory: resolve("./runtime-ai"),
      environment: "development",
      mode: "custom",
    },
  });
});

test("configuration keeps safe local defaults", () => {
  const managedRoot = resolve("./synthetic-managed-root");
  const config = loadConfig(
    { LOCALAPPDATA: managedRoot, OPS_RUNTIME_ENV: "development" },
    { platform: "win32", homeDirectory: resolve("./synthetic-home") },
  );
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4310);
  assert.equal(config.dataDir, resolve("./data"));
  assert.equal(config.aiWorkingDir, join(managedRoot, "PersonalOpsServer", "development", "ai-runtime"));
  assert.equal(config.aiRuntime.mode, "managed");
  assert.equal(config.aiRuntime.environment, "development");
});
