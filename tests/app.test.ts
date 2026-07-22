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

test("browser UI places AI chat in a separate side panel", async () => {
  const store = new OpsStore(":memory:");
  const app = await buildApp({ store });

  try {
    const response = await app.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<aside class="ai-panel" aria-label="AI 채팅">/);
    assert.match(response.body, /id="ai-assistant-switcher"/);
    assert.doesNotMatch(response.body, /id="ai-conversation"/);
    assert.match(response.body, /id="ai-provider"/);
    assert.match(response.body, /id="ai-model"/);
    assert.match(response.body, /id="ai-reasoning"/);
  } finally {
    await app.close();
    store.close();
  }
});
