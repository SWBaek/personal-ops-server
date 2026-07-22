import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface Capture {
  id: string;
  body: string;
  createdAt: string;
  processedAt: string | null;
}

export interface Task {
  id: string;
  title: string;
  scheduledOn: string | null;
  dueOn: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CaptureRow {
  id: string;
  body: string;
  created_at: string;
  processed_at: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  scheduled_on: string | null;
  due_on: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  title: string;
  scheduledOn: string | null;
  dueOn: string | null;
}

export interface UpdateTaskInput {
  completed?: boolean;
  scheduledOn?: string | null;
}

export class OpsStore {
  readonly #db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(dirname(filename), { recursive: true });
    }
    this.#db = new DatabaseSync(filename);
    this.#db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.#migrate();
  }

  close(): void {
    this.#db.close();
  }

  createCapture(body: string): Capture {
    const capture: Capture = {
      id: randomUUID(),
      body,
      createdAt: new Date().toISOString(),
      processedAt: null,
    };

    this.#db
      .prepare("INSERT INTO captures (id, body, created_at, processed_at) VALUES (?, ?, ?, ?)")
      .run(capture.id, capture.body, capture.createdAt, capture.processedAt);
    return capture;
  }

  listCaptures(limit = 30): Capture[] {
    const rows = this.#db
      .prepare(
        "SELECT id, body, created_at, processed_at FROM captures ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as unknown as CaptureRow[];
    return rows.map(mapCapture);
  }

  createTask(input: CreateTaskInput): Task {
    const timestamp = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      title: input.title,
      scheduledOn: input.scheduledOn,
      dueOn: input.dueOn,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.#db
      .prepare(
        `INSERT INTO tasks
          (id, title, scheduled_on, due_on, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        task.id,
        task.title,
        task.scheduledOn,
        task.dueOn,
        task.completedAt,
        task.createdAt,
        task.updatedAt,
      );
    return task;
  }

  listOpenTasks(): Task[] {
    const rows = this.#db
      .prepare(
        `SELECT id, title, scheduled_on, due_on, completed_at, created_at, updated_at
         FROM tasks
         WHERE completed_at IS NULL
         ORDER BY
           CASE WHEN scheduled_on IS NULL THEN 1 ELSE 0 END,
           scheduled_on ASC,
           CASE WHEN due_on IS NULL THEN 1 ELSE 0 END,
           due_on ASC,
           created_at ASC`,
      )
      .all() as unknown as TaskRow[];
    return rows.map(mapTask);
  }

  listTodayTasks(today: string): Task[] {
    const rows = this.#db
      .prepare(
        `SELECT id, title, scheduled_on, due_on, completed_at, created_at, updated_at
         FROM tasks
         WHERE completed_at IS NULL
           AND scheduled_on IS NOT NULL
           AND scheduled_on <= ?
         ORDER BY scheduled_on ASC, due_on ASC, created_at ASC`,
      )
      .all(today) as unknown as TaskRow[];
    return rows.map(mapTask);
  }

  updateTask(id: string, patch: UpdateTaskInput): Task | null {
    const current = this.getTask(id);
    if (!current) {
      return null;
    }

    const completedAt =
      patch.completed === undefined
        ? current.completedAt
        : patch.completed
          ? new Date().toISOString()
          : null;
    const scheduledOn =
      patch.scheduledOn === undefined ? current.scheduledOn : patch.scheduledOn;
    const updatedAt = new Date().toISOString();

    this.#db
      .prepare(
        "UPDATE tasks SET scheduled_on = ?, completed_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(scheduledOn, completedAt, updatedAt, id);
    return this.getTask(id);
  }

  getTask(id: string): Task | null {
    const row = this.#db
      .prepare(
        `SELECT id, title, scheduled_on, due_on, completed_at, created_at, updated_at
         FROM tasks WHERE id = ?`,
      )
      .get(id) as unknown as TaskRow | undefined;
    return row ? mapTask(row) : null;
  }

  #migrate(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS captures (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        processed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        scheduled_on TEXT,
        due_on TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_open_schedule
        ON tasks (completed_at, scheduled_on, due_on);
    `);
  }
}

function mapCapture(row: CaptureRow): Capture {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    scheduledOn: row.scheduled_on,
    dueOn: row.due_on,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

