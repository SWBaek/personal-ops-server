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
  inspectFinalArtifact,
  parseDirectProviderOutcome,
  parseStructuredProviderOutcome,
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
  assert.ok(grok.args.includes("json"));
  assert.ok(!grok.args.includes("streaming-json"));
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

test("direct provider parsers require provider-owned final artifacts", () => {
  const grokAnswer = "직접 답변입니다.\n\n- 첫 번째";
  assert.deepEqual(parseDirectProviderOutcome("grok", JSON.stringify({
    text: grokAnswer,
    stopReason: "EndTurn",
    sessionId: "discard-me",
    metadata: { path: "private/path.md" },
  })), {
    kind: "completed",
    value: grokAnswer,
    evidence: {
      provider: "grok",
      protocol: "grok-json",
      terminalReason: "end_turn",
      artifact: "json-object",
    },
  });
  const codexAnswer = "Codex의 **최종 답변**";
  assert.equal(parseDirectProviderOutcome(
    "codex",
    `${JSON.stringify({ type: "turn.completed" })}\n`,
    codexAnswer,
  ).kind, "completed");
  assert.deepEqual(parseDirectProviderOutcome("grok", "not JSON"), {
    kind: "incomplete",
    reason: "malformed_final",
  });
});

test("Grok accepts only EndTurn and rejects cancellation and limits even with text", () => {
  const finalAnswer = "검토 결과, 운영 상태는 안정적입니다.";
  assert.equal(parseDirectProviderOutcome("grok", JSON.stringify({
    text: finalAnswer,
    stopReason: "EndTurn",
  })).kind, "completed");
  assert.deepEqual(parseDirectProviderOutcome("grok", JSON.stringify({
    text: finalAnswer,
    stopReason: "Cancelled",
  })), { kind: "cancelled", source: "provider" });
  assert.deepEqual(parseDirectProviderOutcome("grok", JSON.stringify({
    text: finalAnswer,
    stopReason: "MaxTurns",
  })), { kind: "incomplete", reason: "max_turns" });
  assert.deepEqual(parseDirectProviderOutcome("grok", JSON.stringify({
    text: finalAnswer,
    stopReason: "MaxTokens",
  })), { kind: "incomplete", reason: "max_tokens" });
  assert.deepEqual(parseDirectProviderOutcome("grok", JSON.stringify({
    text: finalAnswer,
    stopReason: "FutureReason",
  })), { kind: "incomplete", reason: "unknown_terminal" });
  assert.deepEqual(parseDirectProviderOutcome("grok", JSON.stringify({
    text: finalAnswer,
  })), { kind: "incomplete", reason: "missing_completion" });
  assert.deepEqual(parseDirectProviderOutcome("grok", JSON.stringify({
    text: "",
    stopReason: "EndTurn",
  })), { kind: "incomplete", reason: "missing_final" });
});

test("Codex requires both turn.completed and a non-empty final file value", () => {
  const completed = `${JSON.stringify({ type: "turn.completed", requestId: "discard" })}\n`;
  assert.equal(parseDirectProviderOutcome("codex", completed, "final answer").kind, "completed");
  assert.deepEqual(parseDirectProviderOutcome("codex", completed, ""), {
    kind: "incomplete",
    reason: "empty_final",
  });
  assert.deepEqual(parseDirectProviderOutcome("codex", JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: "not authoritative" },
  }), "final answer"), {
    kind: "incomplete",
    reason: "missing_completion",
  });
});

test("Codex final artifact inspection rejects missing, empty, and oversized files", () => {
  const temporary = mkdtempSync(join(tmpdir(), "ops-final-artifact-"));
  try {
    const artifact = join(temporary, "final.txt");
    assert.deepEqual(inspectFinalArtifact(artifact), { kind: "incomplete", reason: "missing_final" });
    writeFileSync(artifact, "", "utf8");
    assert.deepEqual(inspectFinalArtifact(artifact), { kind: "incomplete", reason: "empty_final" });
    writeFileSync(artifact, "x".repeat(1024 * 1024 + 1), "utf8");
    assert.deepEqual(inspectFinalArtifact(artifact), {
      kind: "incomplete",
      reason: "artifact_too_large",
    });
    writeFileSync(artifact, "authoritative final", "utf8");
    assert.equal(inspectFinalArtifact(artifact).kind, "completed");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
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
    parseStructuredProviderOutcome("grok", JSON.stringify({
      text: "This text is intentionally not JSON.",
      structuredOutput: { answer: "verified" },
      stopReason: "EndTurn",
    })).kind,
    "completed",
  );
  const stringStructured = parseStructuredProviderOutcome("grok", JSON.stringify({
      text: "ignored",
      structuredOutput: "{\"answer\":\"string representation\"}",
      stopReason: "EndTurn",
    }));
  assert.equal(stringStructured.kind, "completed");
  if (stringStructured.kind === "completed") {
    assert.deepEqual(stringStructured.value, { answer: "string representation" });
  }
  const fenced = parseStructuredProviderOutcome("grok", JSON.stringify({
      text: "```json\n{\"answer\":\"brace } inside a string\"}\n```",
      stopReason: "EndTurn",
    }));
  assert.equal(fenced.kind, "completed");
  const prose = parseStructuredProviderOutcome("grok", JSON.stringify({
      text: "{\"answer\":\"ok\"}\nAdditional provider commentary.",
      stopReason: "EndTurn",
    }));
  assert.equal(prose.kind, "completed");
});

test("provider parser rejects malformed or ambiguous structured output with a safe error", () => {
  assert.deepEqual(parseStructuredProviderOutcome("grok", JSON.stringify({
    text: "{\"answer\":",
    stopReason: "EndTurn",
  })), { kind: "incomplete", reason: "malformed_final" });
  assert.deepEqual(parseStructuredProviderOutcome("grok", JSON.stringify({
    text: "{\"answer\":1}{\"answer\":2}",
    stopReason: "EndTurn",
  })), { kind: "incomplete", reason: "malformed_final" });
  assert.deepEqual(parseStructuredProviderOutcome("grok", "not outer JSON"), {
    kind: "incomplete",
    reason: "malformed_final",
  });
});

test("progress parser handles split UTF-8 JSONL and emits only safe server phases", () => {
  const secret = "private/경로.md";
  const encoded = new TextEncoder().encode([
    JSON.stringify({ type: "thread.started", sessionId: secret }),
    JSON.stringify({ type: "item.completed", item: { text: `answer fragment ${secret}` } }),
    JSON.stringify({ type: "turn.completed", toolArgs: { path: secret }, requestId: secret }),
    "",
  ].join("\n"));
  const events: unknown[] = [];
  const parser = createProviderProgressParser("codex", (event) => events.push(event));
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
