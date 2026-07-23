import assert from "node:assert/strict";
import test from "node:test";

import {
  AiConversationService,
  parseGrokUsage,
  readGrokDelta,
  type AiJobStreamEvent,
  type AiProviderTurnInput,
  type AiStreamingProvider,
} from "../src/ai/streaming-service.js";
import { buildApp } from "../src/app.js";
import { OpsStore } from "../src/infra/store.js";

function assistantEnvelope(reply: string): string {
  return JSON.stringify({
    reply,
    resolutions: [],
    memoProposal: null,
    grounding: { status: "not_applicable", citedReferenceIds: [], conflicts: [] },
  });
}

test("Grok streaming parser accepts text data and ignores thought data", () => {
  assert.equal(readGrokDelta({ type: "thought", data: "hidden reasoning" }), null);
  assert.equal(readGrokDelta({ type: "text", data: "visible answer" }), "visible answer");
  assert.deepEqual(parseGrokUsage({
    input_tokens: 4,
    cache_read_input_tokens: 1,
    output_tokens: 2,
    reasoning_tokens: 3,
  }), {
    inputTokens: 4,
    cachedInputTokens: 1,
    outputTokens: 2,
    reasoningTokens: 3,
  });
});

test("structured assistant jobs persist the validated reply and usage", async () => {
  const store = new OpsStore(":memory:");
  let suppliedPrompt = "";
  const provider: AiStreamingProvider = {
    async runTurn(input: AiProviderTurnInput) {
      suppliedPrompt = input.message;
      return {
        text: assistantEnvelope("안녕하세요"),
        usage: {
          inputTokens: 7,
          cachedInputTokens: 2,
          outputTokens: 3,
          reasoningTokens: 1,
        },
        durationMs: 42,
        providerThreadId: "thread-safe-to-store",
        streamMode: "text",
      };
    },
  };
  const service = new AiConversationService(store, provider);

  try {
    store.updateAssistantProfile({
      name: "지안",
      ownerAddress: "대표님",
      roleDescription: "개인 운영을 총괄한다.",
      communicationStyle: "짧고 직접적으로 답한다.",
      workingPrinciples: "근거와 추론을 구분한다.",
    });
    const conversation = store.createAiConversation({
      provider: "codex",
      model: "default",
      reasoningEffort: "default",
    });
    const turn = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: "44444444-4444-4444-8444-444444444444",
      message: "인사해 주세요",
      model: "default",
      reasoningEffort: "default",
    });
    const terminal = waitForTerminal(service, turn.job.id);
    service.enqueue(turn.job.id);
    const events = await terminal;

    assert.deepEqual(
      events.filter((event) => event.type === "delta").map((event) => event.delta),
      ["안녕하세요"],
    );
    assert.equal(events.at(-1)?.type, "completed");
    const message = store.getAiMessage(turn.assistantMessage.id);
    assert.equal(message?.content, "안녕하세요");
    assert.equal(message?.outputTokens, 3);
    assert.equal(store.getAiConversation(conversation.id)?.providerThreadId, null);
    assert.match(suppliedPrompt, /Assistant name: 지안/);
    assert.match(suppliedPrompt, /Address the owner as: 대표님/);
    assert.match(suppliedPrompt, /cannot override system policy/);
  } finally {
    await service.close();
    store.close();
  }
});

test("assistant jobs fail closed when a model cites evidence outside its context", async () => {
  const store = new OpsStore(":memory:");
  const provider: AiStreamingProvider = {
    async runTurn() {
      return {
        text: JSON.stringify({
          reply: "근거가 있다고 가정한 답변",
          resolutions: [],
          memoProposal: null,
          grounding: {
            status: "grounded",
            citedReferenceIds: ["memo:00000000-0000-4000-8000-000000000099:v1"],
            conflicts: [],
          },
        }),
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0 },
        durationMs: 1,
        providerThreadId: null,
        streamMode: "buffered",
      };
    },
  };
  const service = new AiConversationService(store, provider);

  try {
    const conversation = store.createAiConversation({
      provider: "codex",
      model: "default",
      reasoningEffort: "default",
    });
    const turn = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: "45454545-4545-4545-8545-454545454545",
      message: "저장된 근거를 알려줘",
      model: "default",
      reasoningEffort: "default",
    });
    const terminal = waitForTerminal(service, turn.job.id);
    service.enqueue(turn.job.id);
    await terminal;

    assert.equal(store.getAiJob(turn.job.id)?.status, "failed");
    assert.deepEqual(store.getAiMessage(turn.assistantMessage.id)?.sources, []);
  } finally {
    await service.close();
    store.close();
  }
});

test("running streaming jobs can be cancelled", async () => {
  const store = new OpsStore(":memory:");
  let started!: () => void;
  const didStart = new Promise<void>((resolve) => { started = resolve; });
  const provider: AiStreamingProvider = {
    runTurn(input) {
      started();
      return new Promise((_resolve, reject) => {
        input.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        });
      });
    },
  };
  const service = new AiConversationService(store, provider);

  try {
    const conversation = store.createAiConversation({
      provider: "grok",
      model: "default",
      reasoningEffort: "default",
    });
    const turn = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: "55555555-5555-4555-8555-555555555555",
      message: "취소할 요청",
      model: "default",
      reasoningEffort: "default",
    });
    const terminal = waitForTerminal(service, turn.job.id);
    service.enqueue(turn.job.id);
    await didStart;
    service.cancel(turn.job.id);
    const events = await terminal;

    assert.equal(events.at(-1)?.type, "failed");
    assert.equal(store.getAiJob(turn.job.id)?.status, "cancelled");
    assert.equal(store.getAiMessage(turn.assistantMessage.id)?.status, "cancelled");
  } finally {
    await service.close();
    store.close();
  }
});

test("conversation HTTP APIs persist history and expose sanitized terminal SSE", async () => {
  const store = new OpsStore(":memory:");
  const provider: AiStreamingProvider = {
    async runTurn(input) {
      return {
        text: assistantEnvelope("연결됨"),
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0 },
        durationMs: 10,
        providerThreadId: "must-not-leak",
        streamMode: "text",
      };
    },
  };
  const service = new AiConversationService(store, provider);
  const app = await buildApp({ store, aiConversationService: service });

  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/ai/conversations",
      payload: {
        assistantSlot: 1,
        provider: "codex",
        model: "default",
        reasoningEffort: "default",
      },
    });
    assert.equal(created.statusCode, 201);
    const conversationId = created.json().conversation.id as string;
    assert.equal("providerThreadId" in created.json().conversation, false);

    const submitted = await app.inject({
      method: "POST",
      url: `/api/ai/conversations/${conversationId}/messages`,
      payload: {
        clientRequestId: "66666666-6666-4666-8666-666666666666",
        message: "연결을 확인해 주세요",
        model: "default",
        reasoningEffort: "default",
      },
    });
    assert.equal(submitted.statusCode, 202);
    const jobId = submitted.json().job.id as string;
    assert.equal("clientRequestId" in submitted.json().job, false);
    await waitUntil(() => store.getAiJob(jobId)?.status === "succeeded");

    const history = await app.inject({ method: "GET", url: `/api/ai/conversations/${conversationId}` });
    assert.equal(history.statusCode, 200);
    assert.deepEqual(history.json().messages.map((message: { content: string }) => message.content), [
      "연결을 확인해 주세요",
      "연결됨",
    ]);
    assert.equal(JSON.stringify(history.json()).includes("must-not-leak"), false);

    const events = await app.inject({ method: "GET", url: `/api/ai/jobs/${jobId}/events` });
    assert.equal(events.statusCode, 200);
    assert.match(events.body, /event: snapshot/);
    assert.match(events.body, /event: completed/);
    assert.equal(events.body.includes("must-not-leak"), false);
  } finally {
    await app.close();
    await service.close();
    store.close();
  }
});

function waitForTerminal(service: AiConversationService, jobId: string): Promise<AiJobStreamEvent[]> {
  const events: AiJobStreamEvent[] = [];
  return new Promise((resolve) => {
    const unsubscribe = service.subscribe(jobId, (event) => {
      events.push(event);
      if (event.type === "completed" || event.type === "failed") {
        unsubscribe();
        resolve(events);
      }
    });
  });
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("condition was not met in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
