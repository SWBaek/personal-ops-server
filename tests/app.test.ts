import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { OpsStore } from "../src/infra/store.js";

test("capture and task workflows are available through HTTP", async () => {
  const store = new OpsStore(":memory:");
  const app = await buildApp({ store });

  try {
    const captureResponse = await app.inject({
      method: "POST",
      url: "/api/captures",
      payload: { body: "remember this" },
    });
    assert.equal(captureResponse.statusCode, 201);

    const taskResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "do this", scheduledOn: "2026-07-22" },
    });
    assert.equal(taskResponse.statusCode, 201);
    const created = taskResponse.json().task;

    const completeResponse = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${created.id}`,
      payload: { completed: true },
    });
    assert.equal(completeResponse.statusCode, 200);

    const openResponse = await app.inject({ method: "GET", url: "/api/tasks" });
    assert.deepEqual(openResponse.json().tasks, []);
  } finally {
    await app.close();
    store.close();
  }
});

test("invalid task dates fail closed", async () => {
  const store = new OpsStore(":memory:");
  const app = await buildApp({ store });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "bad date", scheduledOn: "2026-02-30" },
    });
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
    store.close();
  }
});

test("data reset endpoints require confirmation and preserve configuration boundaries", async () => {
  const store = new OpsStore(":memory:");
  const app = await buildApp({ store });

  try {
    store.createCapture("temporary capture");
    store.createTask({ title: "temporary task", scheduledOn: null, dueOn: null });
    store.createAiConversation({
      provider: "codex",
      model: "default",
      reasoningEffort: "default",
    });

    const denied = await app.inject({
      method: "POST",
      url: "/api/system/reset-data",
      payload: { confirmation: "wrong" },
    });
    assert.equal(denied.statusCode, 400);
    assert.equal(store.listCaptures().length, 1);

    const chatClear = await app.inject({
      method: "POST",
      url: "/api/ai/history/clear",
      payload: { confirmation: "DELETE_AI_HISTORY" },
    });
    assert.equal(chatClear.statusCode, 200);
    assert.equal(chatClear.json().deleted.conversations, 1);
    assert.equal(store.listCaptures().length, 1);
    assert.equal(store.listOpenTasks().length, 1);

    const reset = await app.inject({
      method: "POST",
      url: "/api/system/reset-data",
      payload: { confirmation: "RESET_ALL_DATA" },
    });
    assert.equal(reset.statusCode, 200);
    assert.equal(reset.json().deleted.captures, 1);
    assert.equal(reset.json().deleted.tasks, 1);
    assert.equal(store.listCaptures().length, 0);
    assert.equal(store.listOpenTasks().length, 0);
  } finally {
    await app.close();
    store.close();
  }
});

test("browser UI centers one chief assistant with supporting operational context", async () => {
  const store = new OpsStore(":memory:");
  const app = await buildApp({ store });

  try {
    const response = await app.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /data-ui-version="assistant-shell-v1"/);
    assert.match(response.body, /<main class="workspace">/);
    assert.match(response.body, /<section id="assistant-view" class="conversation" aria-label="주 비서 대화">/);
    assert.match(response.body, /data-view="프로젝트 개요"/);
    assert.match(response.body, /id="project-overview"/);
    assert.match(response.body, /data-view="받은함"/);
    assert.match(response.body, /id="inbox-view"/);
    assert.match(response.body, /data-view="디버그"/);
    assert.match(response.body, /id="debug-view"/);
    assert.match(response.body, /id="assistant-profile-form"/);
    assert.match(response.body, /id="ai-runtime-status"/);
    assert.match(response.body, /id="overview-processing"/);
    assert.match(response.body, /src\/ai\/streaming-service\.ts/);
    assert.match(response.body, /src\/domain\/intake\.ts/);
    assert.match(response.body, /<aside id="context-panel" class="context-panel" aria-label="운영 상황">/);
    assert.doesNotMatch(response.body, /id="ai-assistant-switcher"/);
    assert.match(response.body, /id="ai-provider"/);
    assert.match(response.body, /id="ai-model"/);
    assert.match(response.body, /id="ai-reasoning"/);
  } finally {
    await app.close();
    store.close();
  }
});

test("assistant profile API requires explicit confirmation and exposes no runtime path", async () => {
  const store = new OpsStore(":memory:");
  const app = await buildApp({
    store,
    aiRuntime: { environment: "development", mode: "managed", isolated: true },
  });

  const draft = {
    name: "지안",
    ownerAddress: "대표님",
    roleDescription: "개인 운영을 총괄한다.",
    communicationStyle: "짧고 직접적으로 답한다.",
    workingPrinciples: "계획의 허점을 발견하면 지적한다.",
  };

  try {
    const initial = await app.inject({ method: "GET", url: "/api/assistant/profile" });
    assert.equal(initial.statusCode, 200);
    assert.equal(initial.json().profile.version, 1);

    const denied = await app.inject({
      method: "PUT",
      url: "/api/assistant/profile",
      payload: draft,
    });
    assert.equal(denied.statusCode, 400);

    const updated = await app.inject({
      method: "PUT",
      url: "/api/assistant/profile",
      payload: { ...draft, confirmation: "UPDATE_ASSISTANT_PROFILE" },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().profile.name, "지안");
    assert.equal(updated.json().profile.version, 2);

    const conversation = store.createAiConversation({
      provider: "grok",
      model: "default",
      reasoningEffort: "default",
    });
    store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: "88888888-8888-4888-8888-888888888888",
      message: "진행 중 요청",
      model: "default",
      reasoningEffort: "default",
    });
    const busy = await app.inject({
      method: "PUT",
      url: "/api/assistant/profile",
      payload: { ...draft, confirmation: "UPDATE_ASSISTANT_PROFILE" },
    });
    assert.equal(busy.statusCode, 409);

    const runtime = await app.inject({ method: "GET", url: "/api/system/runtime" });
    assert.deepEqual(runtime.json(), {
      runtime: { environment: "development", mode: "managed", isolated: true },
    });
    assert.equal(JSON.stringify(runtime.json()).includes("workingDirectory"), false);
  } finally {
    await app.close();
    store.close();
  }
});

test("debug APIs expose allowlisted SQLite rows without provider internals", async () => {
  const store = new OpsStore(":memory:");
  const conversation = store.createAiConversation({
    provider: "codex",
    model: "default",
    reasoningEffort: "default",
  });
  store.createAiTurn({
    conversationId: conversation.id,
    clientRequestId: "77777777-7777-4777-8777-777777777777",
    message: "디버그 확인",
    model: "default",
    reasoningEffort: "default",
  });
  const app = await buildApp({ store });

  try {
    const summary = await app.inject({ method: "GET", url: "/api/debug/summary" });
    assert.equal(summary.statusCode, 200);
    assert.equal(summary.json().summary.datasets.find(
      (item: { id: string }) => item.id === "ai_messages",
    ).count, 2);

    const conversations = await app.inject({
      method: "GET",
      url: "/api/debug/data/ai_conversations?limit=25",
    });
    assert.equal(conversations.statusCode, 200);
    assert.equal(conversations.json().rows.length, 1);
    assert.equal("provider_thread_id" in conversations.json().rows[0], false);

    const jobs = await app.inject({ method: "GET", url: "/api/debug/data/ai_jobs" });
    assert.equal(jobs.statusCode, 200);
    assert.equal("client_request_id" in jobs.json().rows[0], false);

    const rejected = await app.inject({ method: "GET", url: "/api/debug/data/sqlite_master" });
    assert.equal(rejected.statusCode, 400);
  } finally {
    await app.close();
    store.close();
  }
});
