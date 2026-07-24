import assert from "node:assert/strict";
import test from "node:test";

import { AI_PROVIDER_OPTIONS, validateAiSelection } from "../src/ai/chat-service.js";

test("publishes the concrete CLI model catalog without a generic default model", () => {
  const codex = AI_PROVIDER_OPTIONS.find((provider) => provider.id === "codex")!;
  const grok = AI_PROVIDER_OPTIONS.find((provider) => provider.id === "grok")!;

  assert.deepEqual(codex.models.map((model) => model.id), [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex-spark",
  ]);
  assert.deepEqual(grok.models.map((model) => model.id), ["grok-4.5"]);
  assert.ok(AI_PROVIDER_OPTIONS.every(
    (provider) => provider.models.every((model) => model.id !== "default"),
  ));
});

test("requires a concrete model and rejects provider/model mismatches", () => {
  assert.deepEqual(validateAiSelection({
    provider: "codex",
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
  }), {
    provider: "codex",
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
  });
  assert.throws(
    () => validateAiSelection({ provider: "codex", reasoningEffort: "high" }),
    /model is not supported/u,
  );
  assert.throws(
    () => validateAiSelection({ provider: "codex", model: "default", reasoningEffort: "high" }),
    /model is not supported/u,
  );
  assert.throws(
    () => validateAiSelection({ provider: "grok", model: "gpt-5.6-sol", reasoningEffort: "high" }),
    /model is not supported/u,
  );
});
