import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertSafeAiRuntimePath,
  prepareAiRuntime,
  resolveAiRuntimeConfig,
  verifyGrokRuntimeIsolation,
} from "../src/runtime/ai-runtime.js";

test("managed AI runtime uses an environment-specific application-data directory", () => {
  const root = mkdtempSync(join(tmpdir(), "personal-ops-managed-"));
  try {
    const config = resolveAiRuntimeConfig(
      { LOCALAPPDATA: root, OPS_RUNTIME_ENV: "development" },
      { platform: "win32", homeDirectory: root },
    );
    prepareAiRuntime(config);

    assert.equal(config.mode, "managed");
    assert.equal(config.environment, "development");
    assert.equal(config.workingDirectory, join(root, "PersonalOpsServer", "development", "ai-runtime"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AI runtime rejects Git projects and inherited AGENTS instructions", () => {
  const root = mkdtempSync(join(tmpdir(), "personal-ops-unsafe-"));
  try {
    const gitProject = join(root, "repo");
    mkdirSync(join(gitProject, ".git"), { recursive: true });
    assert.throws(
      () => assertSafeAiRuntimePath(join(gitProject, "runtime")),
      /must not be inside a Git project/,
    );

    const instructed = join(root, "instructed");
    mkdirSync(instructed, { recursive: true });
    writeFileSync(join(instructed, "AGENTS.md"), "synthetic instructions", "utf8");
    assert.throws(
      () => assertSafeAiRuntimePath(join(instructed, "runtime")),
      /must not inherit AGENTS\.md/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Grok inspection fails closed when project instructions are discovered", () => {
  const config = {
    workingDirectory: join(tmpdir(), "synthetic-grok-runtime"),
    environment: "test" as const,
    mode: "managed" as const,
  };
  const isolatedRunner = () => ({
    pid: 1,
    output: [null, '{"projectInstructions":[]}', ""],
    stdout: '{"projectInstructions":[]}',
    stderr: "",
    status: 0,
    signal: null,
  });
  assert.equal(verifyGrokRuntimeIsolation(config, isolatedRunner), "isolated");

  const inheritedRunner = () => ({
    ...isolatedRunner(),
    output: [null, '{"projectInstructions":[{"path":"synthetic"}]}', ""],
    stdout: '{"projectInstructions":[{"path":"synthetic"}]}',
  });
  assert.throws(
    () => verifyGrokRuntimeIsolation(config, inheritedRunner),
    /inherited project instructions/,
  );
});
