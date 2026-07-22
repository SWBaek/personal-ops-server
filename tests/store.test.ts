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

