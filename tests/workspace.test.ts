import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildInvocation, parseProviderJson } from "../src/ai/workspace-provider.js";
import {
  enforceWorkspaceRisk,
  parseWorkspacePlan,
  type WorkspaceTurnPlan,
} from "../src/domain/workspace.js";
import { GitWorkspace } from "../src/infra/git-workspace.js";
import { createGitWorkspace } from "./helpers.js";

test("validates a Git-root WorkOS without requiring a remote and reports dirty state", () => {
  const temporary = mkdtempSync(join(tmpdir(), "ops-workspace-"));
  try {
    createGitWorkspace(temporary);
    const workspace = new GitWorkspace();
    const clean = workspace.validate(temporary);
    assert.equal(clean.valid, true);
    assert.equal(clean.branch, "main");
    assert.equal(clean.dirty, false);
    assert.equal(execFileSync("git", ["remote"], { cwd: temporary, encoding: "utf8" }).trim(), "");

    writeFileSync(join(temporary, "README.md"), "# changed\n", "utf8");
    const dirty = workspace.validate(temporary);
    assert.equal(dirty.dirty, true);
    assert.deepEqual(dirty.dirtyPaths, ["README.md"]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("server upgrades governed paths and external capabilities to high risk", () => {
  const base: WorkspaceTurnPlan = {
    mode: "execute",
    summary: "Edit assistant rules",
    reply: "",
    risk: "low",
    expectedPaths: ["AGENTS.md"],
    operations: ["edit"],
    capabilities: ["local"],
    rationale: "Requested",
    requiresApproval: false,
  };
  assert.equal(enforceWorkspaceRisk(base).requiresApproval, true);
  assert.equal(enforceWorkspaceRisk({ ...base, expectedPaths: ["README.md"], capabilities: ["web"] }).risk, "high");
});

test("parses safe relative paths and rejects Git internals", () => {
  assert.deepEqual(parseWorkspacePlan({
    mode: "execute",
    summary: "Update note",
    reply: "",
    risk: "low",
    expectedPaths: ["10-Projects/Test.md"],
    operations: ["edit note"],
    capabilities: ["local"],
    rationale: "Owner requested it",
    requiresApproval: false,
  }).expectedPaths, ["10-Projects/Test.md"]);
  assert.throws(() => parseWorkspacePlan({
    mode: "execute",
    summary: "Bad",
    reply: "",
    risk: "low",
    expectedPaths: [".git/config"],
    operations: ["edit"],
    capabilities: ["local"],
    rationale: "Bad",
    requiresApproval: false,
  }), /Git internals/u);
});

test("provider invocations discover WorkOS instructions and separate plan from write", () => {
  const base = {
    provider: "codex" as const,
    model: "default",
    reasoningEffort: "high",
    rootPath: "C:\\synthetic\\WorkOs",
    message: "test",
    profile: {} as never,
    signal: new AbortController().signal,
    prompt: "prompt",
    schemaPath: "C:\\runtime\\schema.json",
    schema: {},
    capabilities: ["local"] as WorkspaceTurnPlan["capabilities"],
  };
  const plan = buildInvocation({ ...base, write: false, capabilities: ["local"] });
  assert.ok(plan.args.includes("read-only"));
  assert.ok(!plan.args.includes("--ignore-user-config"));
  assert.ok(!plan.args.some((value) => value.includes("project_root_markers")));

  const execute = buildInvocation({ ...base, write: true, capabilities: ["local"] });
  assert.ok(execute.args.includes("workspace-write"));
  assert.ok(execute.args.includes("-C"));
});

test("Grok parser accepts one structured object with provider framing or trailing prose", () => {
  assert.deepEqual(
    parseProviderJson("grok", JSON.stringify({
      text: "This text is intentionally not JSON.",
      structuredOutput: { answer: "verified" },
    })),
    { answer: "verified" },
  );
  assert.deepEqual(
    parseProviderJson("grok", JSON.stringify({
      text: "ignored",
      structuredOutput: "{\"answer\":\"string representation\"}",
    })),
    { answer: "string representation" },
  );
  assert.deepEqual(
    parseProviderJson("grok", JSON.stringify({
      text: "```json\n{\"answer\":\"brace } inside a string\"}\n```",
    })),
    { answer: "brace } inside a string" },
  );
  assert.deepEqual(
    parseProviderJson("grok", JSON.stringify({
      text: "{\"answer\":\"ok\"}\nAdditional provider commentary.",
    })),
    { answer: "ok" },
  );
});

test("provider parser rejects malformed or ambiguous structured output with a safe error", () => {
  assert.throws(
    () => parseProviderJson("grok", JSON.stringify({ text: "{\"answer\":" })),
    /AI provider returned an invalid structured result/u,
  );
  assert.throws(
    () => parseProviderJson("grok", JSON.stringify({ text: "{\"answer\":1}{\"answer\":2}" })),
    /AI provider returned an invalid structured result/u,
  );
  assert.throws(
    () => parseProviderJson("grok", "not outer JSON"),
    /AI provider returned an invalid structured result/u,
  );
});
