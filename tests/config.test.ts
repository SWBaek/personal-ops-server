import assert from "node:assert/strict";
import { resolve } from "node:path";
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
  });
});

test("configuration keeps safe local defaults", () => {
  const config = loadConfig({});
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4310);
  assert.equal(config.dataDir, resolve("./data"));
  assert.equal(config.aiWorkingDir, resolve("./var/ai-workspace"));
});
