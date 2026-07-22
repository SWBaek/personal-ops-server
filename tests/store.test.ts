import assert from "node:assert/strict";
import test from "node:test";

import { OpsStore } from "../src/infra/store.js";

test("captures are stored newest first", () => {
  const store = new OpsStore(":memory:");
  try {
    const first = store.createCapture("first");
    const second = store.createCapture("second");
    assert.deepEqual(
      store.listCaptures().map((capture) => capture.id),
      [second.id, first.id],
    );
  } finally {
    store.close();
  }
});

test("today includes overdue scheduled tasks but not unscheduled tasks", () => {
  const store = new OpsStore(":memory:");
  try {
    const overdue = store.createTask({
      title: "overdue",
      scheduledOn: "2026-07-20",
      dueOn: null,
    });
    const today = store.createTask({
      title: "today",
      scheduledOn: "2026-07-22",
      dueOn: null,
    });
    store.createTask({ title: "future", scheduledOn: "2026-07-23", dueOn: null });
    store.createTask({ title: "unscheduled", scheduledOn: null, dueOn: null });

    assert.deepEqual(
      store.listTodayTasks("2026-07-22").map((task) => task.id),
      [overdue.id, today.id],
    );
  } finally {
    store.close();
  }
});

test("completing and deferring a task changes canonical state", () => {
  const store = new OpsStore(":memory:");
  try {
    const task = store.createTask({ title: "check", scheduledOn: null, dueOn: null });
    const deferred = store.updateTask(task.id, { scheduledOn: "2026-07-24" });
    assert.equal(deferred?.scheduledOn, "2026-07-24");

    const completed = store.updateTask(task.id, { completed: true });
    assert.ok(completed?.completedAt);
    assert.equal(store.listOpenTasks().length, 0);
  } finally {
    store.close();
  }
});

test("AI conversations persist ordered messages and idempotent jobs", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversation = store.createAiConversation({
      provider: "codex",
      model: "gpt-5.6",
      reasoningEffort: "high",
    });
    const turn = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      message: "첫 질문입니다",
      model: "gpt-5.6",
      reasoningEffort: "high",
    });
    const duplicate = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      message: "무시되는 중복 요청",
      model: "gpt-5.6",
      reasoningEffort: "high",
    });

    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.job.id, turn.job.id);
    const otherConversation = store.createAiConversation({
      provider: "codex",
      model: "default",
      reasoningEffort: "default",
    });
    assert.throws(() => store.createAiTurn({
      conversationId: otherConversation.id,
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      message: "다른 대화의 중복 키",
      model: "default",
      reasoningEffort: "default",
    }), /another conversation/);
    assert.deepEqual(
      store.listAiMessages(conversation.id).map((message) => [message.role, message.content]),
      [["user", "첫 질문입니다"], ["assistant", ""]],
    );
    assert.equal(store.getAiConversation(conversation.id)?.title, "첫 질문입니다");
  } finally {
    store.close();
  }
});

test("AI jobs follow durable terminal transitions", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversation = store.createAiConversation({
      provider: "grok",
      model: "default",
      reasoningEffort: "default",
    });
    const turn = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: "22222222-2222-4222-8222-222222222222",
      message: "계속 이야기해 주세요",
      model: "default",
      reasoningEffort: "default",
    });

    assert.equal(store.startAiJob(turn.job.id)?.status, "running");
    store.updateAiJobPartial(turn.job.id, "부분 응답");
    store.completeAiJob(turn.job.id, {
      content: "완성 응답",
      inputTokens: 5,
      cachedInputTokens: 1,
      outputTokens: 3,
      reasoningTokens: 2,
      durationMs: 25,
      providerThreadId: "provider-thread",
    });

    assert.equal(store.getAiJob(turn.job.id)?.status, "succeeded");
    assert.deepEqual(store.listAiMessages(conversation.id).at(-1), {
      ...turn.assistantMessage,
      content: "완성 응답",
      status: "completed",
      inputTokens: 5,
      cachedInputTokens: 1,
      outputTokens: 3,
      reasoningTokens: 2,
      durationMs: 25,
      updatedAt: store.listAiMessages(conversation.id).at(-1)?.updatedAt,
    });
    assert.equal(store.getAiConversation(conversation.id)?.providerThreadId, "provider-thread");
    assert.equal(store.finishAiJob(turn.job.id, "failed", "late failure"), null);
  } finally {
    store.close();
  }
});

test("running AI jobs are marked interrupted after restart recovery", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversation = store.createAiConversation({
      provider: "codex",
      model: "default",
      reasoningEffort: "default",
    });
    const turn = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: "33333333-3333-4333-8333-333333333333",
      message: "중단될 요청",
      model: "default",
      reasoningEffort: "default",
    });
    store.startAiJob(turn.job.id);

    assert.equal(store.interruptRunningAiJobs(), 1);
    assert.equal(store.getAiJob(turn.job.id)?.status, "interrupted");
    assert.equal(store.getAiMessage(turn.assistantMessage.id)?.status, "failed");
  } finally {
    store.close();
  }
});
