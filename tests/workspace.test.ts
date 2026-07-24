import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildDirectInvocation,
  buildInvocation,
  createProviderProgressParser,
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
    model: "gpt-5.6-sol",
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
  assert.deepEqual(plan.args.slice(plan.args.indexOf("--model"), plan.args.indexOf("--model") + 2), [
    "--model",
    "gpt-5.6-sol",
  ]);
  assert.ok(!plan.args.includes("--ignore-user-config"));
  assert.ok(!plan.args.some((value) => value.includes("project_root_markers")));

  const execute = buildInvocation({ ...base, write: true, capabilities: ["local"] });
  assert.ok(execute.args.includes("workspace-write"));
  assert.ok(execute.args.includes("-C"));
});

test("direct provider invocations bypass structured planning and preserve the owner request", () => {
  const base = {
    provider: "codex" as const,
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    rootPath: "C:\\synthetic\\WorkOs",
    message: "내 AI Task를 요약해줘",
    profile: {} as never,
    signal: new AbortController().signal,
  };
  const codex = buildDirectInvocation(base);
  assert.equal(codex.stdin, base.message);
  assert.ok(codex.args.includes("read-only"));
  assert.deepEqual(codex.args.slice(codex.args.indexOf("--model"), codex.args.indexOf("--model") + 2), [
    "--model",
    "gpt-5.6-sol",
  ]);
  assert.ok(!codex.args.includes("--output-schema"));

  const grok = buildDirectInvocation({ ...base, provider: "grok", model: "grok-4.5" });
  assert.ok(grok.args.includes("--no-plan"));
  assert.ok(grok.args.includes("--verbatim"));
  assert.ok(!grok.args.includes("--json-schema"));
  assert.ok(grok.args.includes("streaming-json"));
  assert.ok(grok.args.includes("dontAsk"));
  assert.ok(grok.args.includes("Bash(*)"));
  assert.deepEqual(grok.args.slice(grok.args.indexOf("--sandbox"), grok.args.indexOf("--sandbox") + 2), [
    "--sandbox",
    "read-only",
  ]);
  assert.deepEqual(grok.args.slice(grok.args.indexOf("--deny"), grok.args.indexOf("--deny") + 2), [
    "--deny",
    "Edit",
  ]);
  assert.deepEqual(grok.args.slice(grok.args.indexOf("--model"), grok.args.indexOf("--model") + 2), [
    "--model",
    "grok-4.5",
  ]);
  assert.equal(grok.args.at(-1), base.message);
});

test("direct provider parsers return final answer text without schema rewriting", () => {
  const grokAnswer = "직접 답변입니다.\n\n- 첫 번째";
  assert.equal(
    parseDirectProviderText("grok", [
      JSON.stringify({ type: "thought", data: "hidden" }),
      JSON.stringify({ type: "text", data: grokAnswer }),
      JSON.stringify({ type: "end", stopReason: "EndTurn", num_turns: 1 }),
    ].join("\n")),
    grokAnswer,
  );
  const codexAnswer = "Codex의 **최종 답변**";
  assert.equal(
    parseDirectProviderText("codex", [
      JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "hidden" } }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: codexAnswer } }),
      JSON.stringify({ type: "turn.completed" }),
    ].join("\n")),
    codexAnswer,
  );
  assert.throws(
    () => parseDirectProviderText("grok", "not JSON"),
    /AI provider returned no usable answer/u,
  );
});

test("direct provider parsers ignore progress messages and require terminal completion", () => {
  const progress = "관련 자료를 먼저 확인하겠습니다.";
  const finalAnswer = "검토 결과, 운영 상태는 안정적입니다.";
  assert.equal(
    parseDirectProviderText("grok", [
      JSON.stringify({ type: "thought", data: "first turn" }),
      JSON.stringify({ type: "text", data: progress }),
      JSON.stringify({ type: "thought", data: "second turn" }),
      JSON.stringify({ type: "text", data: "검토 결과, " }),
      JSON.stringify({ type: "text", data: "운영 상태는 안정적입니다." }),
      JSON.stringify({ type: "end", stopReason: "EndTurn", num_turns: 2 }),
    ].join("\n")),
    finalAnswer,
  );
  assert.throws(
    () => parseDirectProviderText("grok", [
      JSON.stringify({ type: "text", data: progress }),
      JSON.stringify({ type: "end", stopReason: "MaxTurns", num_turns: 20 }),
    ].join("\n")),
    /AI provider returned no usable answer/u,
  );
  assert.throws(
    () => parseDirectProviderText("grok", JSON.stringify({ type: "text", data: progress })),
    /AI provider returned no usable answer/u,
  );
  assert.throws(
    () => parseDirectProviderText("codex", JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: finalAnswer },
    })),
    /AI provider returned no usable answer/u,
  );
});

test("Grok parser accepts matching post-terminal envelopes and rejects later content", () => {
  const answer = "최종 답변";
  const base = [
    JSON.stringify({ type: "text", data: answer }),
    JSON.stringify({ type: "end", stopReason: "EndTurn", num_turns: 2 }),
  ];
  assert.equal(
    parseDirectProviderText("grok", [
      ...base,
      JSON.stringify({ type: "result", result: answer, duration_ms: 1200 }),
      JSON.stringify({ type: "usage", usage: { input_tokens: 10 } }),
    ].join("\n")),
    answer,
  );
  assert.throws(
    () => parseDirectProviderText("grok", [
      ...base,
      JSON.stringify({ type: "result", result: "different answer" }),
    ].join("\n")),
    /AI provider returned no usable answer/u,
  );
  assert.throws(
    () => parseDirectProviderText("grok", [
      ...base,
      JSON.stringify({ type: "text", data: "late content" }),
    ].join("\n")),
    /AI provider returned no usable answer/u,
  );
});

test("Grok parser preserves a complete answer when the CLI exits zero with Cancelled", () => {
  const answer = "완성된 최종 답변";
  assert.equal(
    parseDirectProviderText("grok", [
      JSON.stringify({ type: "thought", data: "intermediate" }),
      JSON.stringify({ type: "text", data: answer }),
      JSON.stringify({ type: "end", stopReason: "Cancelled", num_turns: 2 }),
    ].join("\n")),
    answer,
  );
  assert.throws(
    () => parseDirectProviderText("grok", JSON.stringify({
      type: "end",
      stopReason: "Cancelled",
      num_turns: 2,
    })),
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

test("progress parser handles split UTF-8 JSONL and emits only safe server phases", () => {
  const secret = "private/경로.md";
  const encoded = new TextEncoder().encode([
    JSON.stringify({ type: "thought", data: `hidden reasoning ${secret}` }),
    JSON.stringify({ type: "text", data: `answer fragment ${secret}` }),
    JSON.stringify({ type: "end", stopReason: "EndTurn", toolArgs: { path: secret } }),
    "",
  ].join("\n"));
  const events: unknown[] = [];
  const parser = createProviderProgressParser("grok", (event) => events.push(event));
  for (let index = 0; index < encoded.length; index += 3) {
    parser.push(encoded.slice(index, index + 3));
  }
  parser.finish();

  assert.deepEqual(
    events.map((event) => (event as { type: string; phase?: string }).phase),
    ["checking_workos", "composing", "validating"],
  );
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /private|경로|reasoning|fragment|toolArgs/u);
});
