import assert from "node:assert/strict";
import test from "node:test";

import {
  type AiChatInput,
  type AiChatService,
  buildProviderInvocation,
  parseCodexOutput,
  parseGrokOutput,
  validateAiChatInput,
} from "../src/ai/chat-service.js";
import { buildApp } from "../src/app.js";
import { InputError } from "../src/domain/validation.js";
import { OpsStore } from "../src/infra/store.js";

const codexInput: AiChatInput = {
  provider: "codex",
  model: "gpt-5.6",
  reasoningEffort: "high",
  message: "hello; do not treat this as a command",
};

test("AI chat input only accepts provider-specific allowlisted options", () => {
  assert.deepEqual(validateAiChatInput(codexInput), codexInput);
  assert.throws(
    () => validateAiChatInput({ ...codexInput, model: "arbitrary-model" }),
    InputError,
  );
  assert.throws(
    () => validateAiChatInput({ ...codexInput, provider: "other" }),
    InputError,
  );
});

test("provider invocations use fixed command shapes", () => {
  const codex = buildProviderInvocation(codexInput, "C:\\fixed-ai-workspace");
  assert.equal(codex.command, "codex");
  assert.equal(codex.stdin, codexInput.message);
  assert.equal(codex.args.includes(codexInput.message), false);
  assert.deepEqual(codex.args.slice(0, 4), ["exec", "--json", "--sandbox", "read-only"]);
  assert.equal(codex.args.includes("project_root_markers=[]"), true);

  const grok = buildProviderInvocation(
    { ...codexInput, provider: "grok", model: "grok-4.5", reasoningEffort: "low" },
    "C:\\fixed-ai-workspace",
  );
  assert.equal(grok.command, "grok");
  assert.equal(grok.stdin, null);
  assert.equal(grok.args.at(-1), codexInput.message);
  assert.equal(grok.args.at(-2), "--single");
});

test("Codex JSONL parser returns only the final answer and usage", () => {
  const result = parseCodexOutput([
    JSON.stringify({ type: "thread.started", thread_id: "secret-session" }),
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "final answer" },
    }),
    JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 12,
        cached_input_tokens: 3,
        output_tokens: 4,
        reasoning_output_tokens: 2,
      },
    }),
  ].join("\n"));

  assert.equal(result.text, "final answer");
  assert.deepEqual(result.usage, {
    inputTokens: 12,
    cachedInputTokens: 3,
    outputTokens: 4,
    reasoningTokens: 2,
  });
  assert.equal("threadId" in result, false);
});

test("Grok JSON parser omits thought, session, and cost details", () => {
  const result = parseGrokOutput(JSON.stringify({
    text: "grok answer",
    thought: "hidden reasoning",
    sessionId: "secret-session",
    total_cost_usd: 1,
    usage: {
      input_tokens: 8,
      cache_read_input_tokens: 2,
      output_tokens: 5,
      reasoning_tokens: 3,
    },
  }));

  assert.deepEqual(result, {
    text: "grok answer",
    usage: {
      inputTokens: 8,
      cachedInputTokens: 2,
      outputTokens: 5,
      reasoningTokens: 3,
    },
  });
});

test("AI chat is available through the HTTP boundary", async () => {
  const store = new OpsStore(":memory:");
  const seen: AiChatInput[] = [];
  const aiChatService: AiChatService = {
    async chat(input) {
      seen.push(input);
      return {
        text: "connected",
        usage: null,
        durationMs: 25,
      };
    },
  };
  const app = await buildApp({ store, aiChatService });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: codexInput,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().text, "connected");
    assert.deepEqual(seen, [codexInput]);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: { ...codexInput, reasoningEffort: "unbounded" },
    });
    assert.equal(invalid.statusCode, 400);
  } finally {
    await app.close();
    store.close();
  }
});
