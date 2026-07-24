import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildDirectInvocation,
  buildInvocation,
  parseDirectProviderText,
  parseProviderJson,
} from "../src/ai/workspace-provider.js";
import {
  enforceWorkspaceRisk,
  parseWorkspacePlan,
  requestsWorkspaceMutation,
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

test("direct provider invocations bypass structured planning and preserve the owner request", () => {
  const base = {
    provider: "codex" as const,
    model: "default",
    reasoningEffort: "high",
    rootPath: "C:\\synthetic\\WorkOs",
    message: "내 AI Task를 요약해줘",
    profile: {} as never,
    signal: new AbortController().signal,
  };
  const codex = buildDirectInvocation(base);
  assert.equal(codex.stdin, base.message);
  assert.ok(codex.args.includes("read-only"));
  assert.ok(!codex.args.includes("--output-schema"));

  const grok = buildDirectInvocation({ ...base, provider: "grok" });
  assert.ok(grok.args.includes("--no-plan"));
  assert.ok(grok.args.includes("--verbatim"));
  assert.ok(!grok.args.includes("--json-schema"));
  assert.equal(grok.args.at(-1), base.message);
});

test("direct provider parsers return final answer text without schema rewriting", () => {
  const grokAnswer = "직접 답변입니다.\n\n- 첫 번째";
  assert.equal(
    parseDirectProviderText("grok", JSON.stringify({ text: grokAnswer })),
    grokAnswer,
  );
  const codexAnswer = "Codex의 **최종 답변**";
  assert.equal(
    parseDirectProviderText("codex", [
      JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "hidden" } }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: codexAnswer } }),
    ].join("\n")),
    codexAnswer,
  );
  assert.throws(
    () => parseDirectProviderText("grok", "not JSON"),
    /AI provider returned no usable answer/u,
  );
});

test("only explicit change commands enter the mutation workflow", () => {
  assert.equal(requestsWorkspaceMutation("내 AI Task에 관해 요약해줘"), false);
  assert.equal(requestsWorkspaceMutation("수정된 파일을 보여줘"), false);
  assert.equal(requestsWorkspaceMutation("What did I update yesterday?"), false);
  assert.equal(requestsWorkspaceMutation("README를 업데이트해"), true);
  assert.equal(requestsWorkspaceMutation("이 노트를 삭제해주세요."), true);
  assert.equal(requestsWorkspaceMutation("Create a project note"), true);
  assert.equal(requestsWorkspaceMutation("Could you update README.md?"), true);
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
