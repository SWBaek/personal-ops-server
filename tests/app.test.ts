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
    assert.match(response.body, /<section class="conversation" aria-label="주 비서 대화">/);
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
