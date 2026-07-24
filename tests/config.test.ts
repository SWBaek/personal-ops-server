import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.js";

test("loads local defaults and optional WorkOS seed", () => {
  const config = loadConfig({
    OPS_PORT: "4310",
    OPS_DATA_DIR: "./synthetic-data",
    OPS_WORKOS_ROOT: "C:\\synthetic\\WorkOs",
    OPS_RUNTIME_ENV: "test",
  });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4310);
  assert.equal(config.dataDir, resolve("./synthetic-data"));
  assert.equal(config.workspaceSeed, "C:\\synthetic\\WorkOs");
  assert.match(config.runtimeDir, /runtime[\\/]test$/u);
});

test("rejects invalid ports and environments", () => {
  assert.throws(() => loadConfig({ OPS_PORT: "99999" }), /valid TCP port/u);
  assert.throws(() => loadConfig({ OPS_RUNTIME_ENV: "staging" }), /development, production, or test/u);
});
