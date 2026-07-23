import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AssistantMemoDraft,
  AssistantTurnEnvelope,
  MemoProposalDraft,
} from "../domain/intake.js";
import {
  DEFAULT_ASSISTANT_PROFILE,
  type AssistantProfile,
  type AssistantProfileDraft,
} from "../domain/assistant-profile.js";

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

export type AiProviderId = "codex" | "grok";
export type AiMessageRole = "user" | "assistant";
export type AiMessageStatus = "pending" | "streaming" | "completed" | "failed" | "cancelled";
export type AiJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface AiConversation {
  id: string;
  assistantSlot: 1 | 2;
  provider: AiProviderId;
  title: string;
  defaultModel: string;
  defaultReasoningEffort: string;
  providerThreadId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  jobId: string | null;
  role: AiMessageRole;
  content: string;
  status: AiMessageStatus;
  provider: AiProviderId;
  model: string;
  reasoningEffort: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiJob {
  id: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  clientRequestId: string;
  provider: AiProviderId;
  model: string;
  reasoningEffort: string;
  status: AiJobStatus;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type IntakeProposalStatus = "pending" | "confirmed" | "rejected" | "superseded";

export interface IntakeProposal {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  operation: "create" | "revise";
  targetMemoId: string | null;
  status: IntakeProposalStatus;
  memo: AssistantMemoDraft;
  rawText: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AssistantMemoVersion {
  memoId: string;
  version: number;
  rawText: string;
  memo: AssistantMemoDraft;
  createdAt: string;
}

export interface AssistantMemo {
  id: string;
  currentVersion: number;
  memo: AssistantMemoDraft;
  rawText: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeOutcome {
  createdProposalId: string | null;
  confirmedMemoIds: string[];
  resolvedProposalIds: string[];
}

export const DEBUG_DATASETS = [
  { id: "assistant_profiles", label: "비서 프로필" },
  { id: "assistant_profile_versions", label: "비서 프로필 버전" },
  { id: "ai_conversations", label: "AI 대화" },
  { id: "ai_messages", label: "AI 메시지" },
  { id: "ai_jobs", label: "AI 작업" },
  { id: "intake_proposals", label: "메모 제안" },
  { id: "assistant_memos", label: "확정 메모" },
  { id: "assistant_memo_versions", label: "메모 버전" },
  { id: "captures", label: "기존 Capture" },
  { id: "tasks", label: "기존 Task" },
] as const;

export type DebugDatasetId = (typeof DEBUG_DATASETS)[number]["id"];

export interface DebugSummary {
  generatedAt: string;
  activeAiJobs: boolean;
  datasets: Array<{ id: DebugDatasetId; label: string; count: number }>;
}

interface CaptureRow {
  id: string;
  body: string;
  created_at: string;
  processed_at: string | null;
}

interface AssistantProfileRow {
  id: "chief-assistant";
  version: number;
  name: string;
  owner_address: string;
  role_description: string;
  communication_style: string;
  working_principles: string;
  created_at: string;
  updated_at: string;
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

interface AiConversationRow {
  id: string;
  assistant_slot: 1 | 2;
  provider: AiProviderId;
  title: string;
  default_model: string;
  default_reasoning_effort: string;
  provider_thread_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AiMessageRow {
  id: string;
  conversation_id: string;
  job_id: string | null;
  role: AiMessageRole;
  content: string;
  status: AiMessageStatus;
  provider: AiProviderId;
  model: string;
  reasoning_effort: string;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

interface AiJobRow {
  id: string;
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  client_request_id: string;
  provider: AiProviderId;
  model: string;
  reasoning_effort: string;
  status: AiJobStatus;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface IntakeProposalRow {
  id: string;
  conversation_id: string;
  source_message_id: string;
  operation: "create" | "revise";
  target_memo_id: string | null;
  status: IntakeProposalStatus;
  draft_json: string;
  raw_text: string;
  created_at: string;
  resolved_at: string | null;
}

interface AssistantMemoRow {
  id: string;
  current_version: number;
  draft_json: string;
  raw_text: string;
  created_at: string;
  updated_at: string;
}

interface AssistantMemoVersionRow {
  memo_id: string;
  version: number;
  draft_json: string;
  raw_text: string;
  created_at: string;
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

export interface CreateAiConversationInput {
  assistantSlot?: 1 | 2;
  provider: AiProviderId;
  model: string;
  reasoningEffort: string;
}

export interface CreateAiTurnInput {
  conversationId: string;
  clientRequestId: string;
  message: string;
  model: string;
  reasoningEffort: string;
}

export interface CreatedAiTurn {
  job: AiJob;
  userMessage: AiMessage;
  assistantMessage: AiMessage;
  duplicate: boolean;
}

export interface CompleteAiJobInput {
  content: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  durationMs: number;
  providerThreadId?: string;
}

export interface AiHistoryClearResult {
  conversations: number;
  messages: number;
  jobs: number;
}

export interface DataResetResult extends AiHistoryClearResult {
  captures: number;
  tasks: number;
  assistantProfileVersions: number;
  intakeProposals: number;
  assistantMemos: number;
  assistantMemoVersions: number;
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

  hasActiveAiJobs(): boolean {
    return Boolean(this.#db.prepare(
      "SELECT 1 FROM ai_jobs WHERE status IN ('queued', 'running') LIMIT 1",
    ).get());
  }

  debugSummary(): DebugSummary {
    return {
      generatedAt: new Date().toISOString(),
      activeAiJobs: this.hasActiveAiJobs(),
      datasets: DEBUG_DATASETS.map((dataset) => ({
        ...dataset,
        count: this.#rowCount(dataset.id),
      })),
    };
  }

  debugDataset(dataset: DebugDatasetId, limit = 50): Array<Record<string, unknown>> {
    const queries: Record<DebugDatasetId, string> = {
      assistant_profiles: `
        SELECT id, version, name, owner_address, role_description, communication_style,
               working_principles, created_at, updated_at
        FROM assistant_profiles ORDER BY updated_at DESC LIMIT ?`,
      assistant_profile_versions: `
        SELECT profile_id, version, name, owner_address, role_description, communication_style,
               working_principles, created_at
        FROM assistant_profile_versions ORDER BY version DESC LIMIT ?`,
      ai_conversations: `
        SELECT id, assistant_slot, provider, title, default_model, default_reasoning_effort,
               archived_at, created_at, updated_at
        FROM ai_conversations ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      ai_messages: `
        SELECT id, conversation_id, job_id, role, content, status, provider, model,
               reasoning_effort, input_tokens, cached_input_tokens, output_tokens,
               reasoning_tokens, duration_ms, created_at, updated_at
        FROM ai_messages ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      ai_jobs: `
        SELECT id, conversation_id, user_message_id, assistant_message_id, provider, model,
               reasoning_effort, status, error, created_at, started_at, finished_at
        FROM ai_jobs ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      intake_proposals: `
        SELECT id, conversation_id, source_message_id, operation, target_memo_id, status,
               draft_json, raw_text, created_at, resolved_at
        FROM intake_proposals ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      assistant_memos: `
        SELECT id, current_version, created_at, updated_at
        FROM assistant_memos ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      assistant_memo_versions: `
        SELECT memo_id, version, raw_text, draft_json, created_at
        FROM assistant_memo_versions ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      captures: `
        SELECT id, body, created_at, processed_at
        FROM captures ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      tasks: `
        SELECT id, title, scheduled_on, due_on, completed_at, created_at, updated_at
        FROM tasks ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
    };
    return this.#db.prepare(queries[dataset]).all(limit) as Array<Record<string, unknown>>;
  }

  clearAiHistory(): AiHistoryClearResult {
    if (this.hasActiveAiJobs()) throw new Error("active AI jobs prevent data deletion");
    const result = this.#aiHistoryCounts();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.exec("DELETE FROM ai_jobs; DELETE FROM ai_messages; DELETE FROM ai_conversations;");
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  resetAllData(): DataResetResult {
    if (this.hasActiveAiJobs()) throw new Error("active AI jobs prevent data deletion");
    const result = {
      captures: this.#rowCount("captures"),
      tasks: this.#rowCount("tasks"),
      assistantProfileVersions: this.#rowCount("assistant_profile_versions"),
      intakeProposals: this.#rowCount("intake_proposals"),
      assistantMemos: this.#rowCount("assistant_memos"),
      assistantMemoVersions: this.#rowCount("assistant_memo_versions"),
      ...this.#aiHistoryCounts(),
    };
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.exec(`
        DELETE FROM intake_proposals;
        DELETE FROM assistant_memo_versions;
        DELETE FROM assistant_memos;
        DELETE FROM ai_jobs;
        DELETE FROM ai_messages;
        DELETE FROM ai_conversations;
        DELETE FROM tasks;
        DELETE FROM captures;
        DELETE FROM assistant_profile_versions;
        DELETE FROM assistant_profiles;
      `);
      this.#ensureDefaultAssistantProfile();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  getAssistantProfile(): AssistantProfile {
    const row = this.#db.prepare(
      `SELECT id, version, name, owner_address, role_description, communication_style,
              working_principles, created_at, updated_at
       FROM assistant_profiles WHERE id = 'chief-assistant'`,
    ).get() as AssistantProfileRow | undefined;
    if (!row) throw new Error("chief assistant profile is unavailable");
    return mapAssistantProfile(row);
  }

  updateAssistantProfile(draft: AssistantProfileDraft): AssistantProfile {
    const current = this.getAssistantProfile();
    const version = current.version + 1;
    const timestamp = new Date().toISOString();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(
        `UPDATE assistant_profiles
         SET version = ?, name = ?, owner_address = ?, role_description = ?,
             communication_style = ?, working_principles = ?, updated_at = ?
         WHERE id = 'chief-assistant'`,
      ).run(
        version,
        draft.name,
        draft.ownerAddress,
        draft.roleDescription,
        draft.communicationStyle,
        draft.workingPrinciples,
        timestamp,
      );
      this.#db.prepare(
        `INSERT INTO assistant_profile_versions
          (profile_id, version, name, owner_address, role_description,
           communication_style, working_principles, created_at)
         VALUES ('chief-assistant', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        version,
        draft.name,
        draft.ownerAddress,
        draft.roleDescription,
        draft.communicationStyle,
        draft.workingPrinciples,
        timestamp,
      );
      this.#db.exec("COMMIT");
      return this.getAssistantProfile();
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
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
        "SELECT id, body, created_at, processed_at FROM captures ORDER BY created_at DESC, rowid DESC LIMIT ?",
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

  createAiConversation(input: CreateAiConversationInput): AiConversation {
    const assistantSlot = input.assistantSlot ?? this.#nextAvailableAiAssistantSlot();
    if (!assistantSlot) throw new Error("AI assistant limit reached");
    const occupied = this.#db.prepare(
      "SELECT id FROM ai_conversations WHERE assistant_slot = ? AND archived_at IS NULL",
    ).get(assistantSlot);
    if (occupied) throw new Error("AI assistant slot is already occupied");
    const timestamp = new Date().toISOString();
    const conversation: AiConversation = {
      id: randomUUID(),
      assistantSlot,
      provider: input.provider,
      title: "새 대화",
      defaultModel: input.model,
      defaultReasoningEffort: input.reasoningEffort,
      providerThreadId: null,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#db.prepare(
      `INSERT INTO ai_conversations
        (id, assistant_slot, provider, title, default_model, default_reasoning_effort,
         provider_thread_id, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      conversation.id,
      conversation.assistantSlot,
      conversation.provider,
      conversation.title,
      conversation.defaultModel,
      conversation.defaultReasoningEffort,
      conversation.providerThreadId,
      conversation.archivedAt,
      conversation.createdAt,
      conversation.updatedAt,
    );
    return conversation;
  }

  listAiConversations(): AiConversation[] {
    const rows = this.#db.prepare(
      `SELECT id, assistant_slot, provider, title, default_model, default_reasoning_effort,
              provider_thread_id, archived_at, created_at, updated_at
       FROM ai_conversations
       WHERE archived_at IS NULL
       ORDER BY assistant_slot ASC`,
    ).all() as unknown as AiConversationRow[];
    return rows.map(mapAiConversation);
  }

  listArchivedAiConversations(limit = 20): AiConversation[] {
    const rows = this.#db.prepare(
      `SELECT id, assistant_slot, provider, title, default_model, default_reasoning_effort,
              provider_thread_id, archived_at, created_at, updated_at
       FROM ai_conversations
       WHERE archived_at IS NOT NULL
       ORDER BY archived_at DESC
       LIMIT ?`,
    ).all(limit) as unknown as AiConversationRow[];
    return rows.map(mapAiConversation);
  }

  getAiConversation(id: string): AiConversation | null {
    const row = this.#db.prepare(
      `SELECT id, assistant_slot, provider, title, default_model, default_reasoning_effort,
              provider_thread_id, archived_at, created_at, updated_at
       FROM ai_conversations WHERE id = ?`,
    ).get(id) as unknown as AiConversationRow | undefined;
    return row ? mapAiConversation(row) : null;
  }

  getActiveAiConversation(id: string): AiConversation | null {
    const conversation = this.getAiConversation(id);
    return conversation?.archivedAt === null ? conversation : null;
  }

  resetAiConversation(id: string): AiConversation {
    const conversation = this.getActiveAiConversation(id);
    if (!conversation) throw new Error("AI assistant not found");
    const activeJob = this.#db.prepare(
      `SELECT id FROM ai_jobs
       WHERE conversation_id = ? AND status IN ('queued', 'running') LIMIT 1`,
    ).get(id);
    if (activeJob) throw new Error("AI conversation already has an active request");

    const timestamp = new Date().toISOString();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(
        "UPDATE ai_conversations SET archived_at = ?, updated_at = ? WHERE id = ?",
      ).run(timestamp, timestamp, id);
      const replacement = this.createAiConversation({
        assistantSlot: conversation.assistantSlot,
        provider: conversation.provider,
        model: conversation.defaultModel,
        reasoningEffort: conversation.defaultReasoningEffort,
      });
      this.#db.exec("COMMIT");
      return replacement;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  listAiMessages(conversationId: string): AiMessage[] {
    const rows = this.#db.prepare(
      `SELECT id, conversation_id, job_id, role, content, status, provider, model,
              reasoning_effort, input_tokens, cached_input_tokens, output_tokens,
              reasoning_tokens, duration_ms, created_at, updated_at
       FROM ai_messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC, rowid ASC`,
    ).all(conversationId) as unknown as AiMessageRow[];
    return rows.map(mapAiMessage);
  }

  createAiTurn(input: CreateAiTurnInput): CreatedAiTurn {
    const duplicate = this.getAiJobByClientRequestId(input.clientRequestId);
    if (duplicate) {
      if (duplicate.conversationId !== input.conversationId) {
        throw new Error("AI client request id belongs to another conversation");
      }
      const userMessage = this.getAiMessage(duplicate.userMessageId);
      const assistantMessage = this.getAiMessage(duplicate.assistantMessageId);
      if (!userMessage || !assistantMessage) {
        throw new Error("Stored AI job references missing messages");
      }
      return { job: duplicate, userMessage, assistantMessage, duplicate: true };
    }

    const conversation = this.getActiveAiConversation(input.conversationId);
    if (!conversation) {
      throw new Error("AI conversation not found");
    }
    const active = this.#db.prepare(
      `SELECT id FROM ai_jobs
       WHERE conversation_id = ? AND status IN ('queued', 'running')
       LIMIT 1`,
    ).get(input.conversationId);
    if (active) {
      throw new Error("AI conversation already has an active request");
    }

    const timestamp = new Date().toISOString();
    const jobId = randomUUID();
    const userMessage = buildAiMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      jobId,
      role: "user",
      content: input.message,
      status: "completed",
      provider: conversation.provider,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      timestamp,
    });
    const assistantMessage = buildAiMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      jobId,
      role: "assistant",
      content: "",
      status: "pending",
      provider: conversation.provider,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      timestamp,
    });
    const job: AiJob = {
      id: jobId,
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      clientRequestId: input.clientRequestId,
      provider: conversation.provider,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      status: "queued",
      error: null,
      createdAt: timestamp,
      startedAt: null,
      finishedAt: null,
    };

    this.#db.exec("BEGIN IMMEDIATE");
    try {
      insertAiMessage(this.#db, userMessage);
      insertAiMessage(this.#db, assistantMessage);
      this.#db.prepare(
        `INSERT INTO ai_jobs
          (id, conversation_id, user_message_id, assistant_message_id,
           client_request_id, provider, model, reasoning_effort, status, error,
           created_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        job.id,
        job.conversationId,
        job.userMessageId,
        job.assistantMessageId,
        job.clientRequestId,
        job.provider,
        job.model,
        job.reasoningEffort,
        job.status,
        job.error,
        job.createdAt,
        job.startedAt,
        job.finishedAt,
      );
      const title = conversation.title === "새 대화" ? titleFromMessage(input.message) : conversation.title;
      this.#db.prepare(
        `UPDATE ai_conversations
         SET title = ?, default_model = ?, default_reasoning_effort = ?, updated_at = ?
         WHERE id = ?`,
      ).run(title, input.model, input.reasoningEffort, timestamp, conversation.id);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return { job, userMessage, assistantMessage, duplicate: false };
  }

  getAiJob(id: string): AiJob | null {
    const row = this.#db.prepare(
      `SELECT id, conversation_id, user_message_id, assistant_message_id,
              client_request_id, provider, model, reasoning_effort, status, error,
              created_at, started_at, finished_at
       FROM ai_jobs WHERE id = ?`,
    ).get(id) as unknown as AiJobRow | undefined;
    return row ? mapAiJob(row) : null;
  }

  getAiJobByClientRequestId(clientRequestId: string): AiJob | null {
    const row = this.#db.prepare(
      `SELECT id, conversation_id, user_message_id, assistant_message_id,
              client_request_id, provider, model, reasoning_effort, status, error,
              created_at, started_at, finished_at
       FROM ai_jobs WHERE client_request_id = ?`,
    ).get(clientRequestId) as unknown as AiJobRow | undefined;
    return row ? mapAiJob(row) : null;
  }

  listQueuedAiJobs(): AiJob[] {
    const rows = this.#db.prepare(
      `SELECT id, conversation_id, user_message_id, assistant_message_id,
              client_request_id, provider, model, reasoning_effort, status, error,
              created_at, started_at, finished_at
       FROM ai_jobs WHERE status = 'queued' ORDER BY created_at ASC`,
    ).all() as unknown as AiJobRow[];
    return rows.map(mapAiJob);
  }

  startAiJob(id: string): AiJob | null {
    const startedAt = new Date().toISOString();
    const result = this.#db.prepare(
      "UPDATE ai_jobs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'",
    ).run(startedAt, id);
    if (result.changes === 0) return null;
    this.#db.prepare(
      `UPDATE ai_messages SET status = 'streaming', updated_at = ?
       WHERE id = (SELECT assistant_message_id FROM ai_jobs WHERE id = ?)`,
    ).run(startedAt, id);
    return this.getAiJob(id);
  }

  updateAiJobPartial(id: string, content: string): void {
    const timestamp = new Date().toISOString();
    this.#db.prepare(
      `UPDATE ai_messages SET content = ?, status = 'streaming', updated_at = ?
       WHERE id = (SELECT assistant_message_id FROM ai_jobs WHERE id = ?)
         AND (SELECT status FROM ai_jobs WHERE id = ?) = 'running'`,
    ).run(content, timestamp, id, id);
  }

  completeAiJob(id: string, input: CompleteAiJobInput): AiJob | null {
    const job = this.getAiJob(id);
    if (!job || job.status !== "running") return null;
    const timestamp = new Date().toISOString();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(
        `UPDATE ai_messages
         SET content = ?, status = 'completed', input_tokens = ?, cached_input_tokens = ?,
             output_tokens = ?, reasoning_tokens = ?, duration_ms = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.content,
        input.inputTokens,
        input.cachedInputTokens,
        input.outputTokens,
        input.reasoningTokens,
        input.durationMs,
        timestamp,
        job.assistantMessageId,
      );
      this.#db.prepare(
        "UPDATE ai_jobs SET status = 'succeeded', finished_at = ? WHERE id = ? AND status = 'running'",
      ).run(timestamp, id);
      this.#db.prepare(
        `UPDATE ai_conversations
         SET provider_thread_id = COALESCE(?, provider_thread_id), updated_at = ?
         WHERE id = ?`,
      ).run(input.providerThreadId ?? null, timestamp, job.conversationId);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return this.getAiJob(id);
  }

  completeAssistantTurn(
    id: string,
    input: CompleteAiJobInput & { envelope: AssistantTurnEnvelope },
  ): { job: AiJob; outcome: IntakeOutcome } | null {
    const job = this.getAiJob(id);
    if (!job || job.status !== "running") return null;
    const timestamp = new Date().toISOString();
    const outcome: IntakeOutcome = {
      createdProposalId: null,
      confirmedMemoIds: [],
      resolvedProposalIds: [],
    };

    this.#db.exec("BEGIN IMMEDIATE");
    try {
      for (const resolution of input.envelope.resolutions) {
        const proposal = this.#getIntakeProposalRow(resolution.proposalId);
        if (!proposal || proposal.conversation_id !== job.conversationId || proposal.status !== "pending") {
          throw new Error("intake proposal is unavailable or already resolved");
        }
        if (resolution.action === "confirm") {
          outcome.confirmedMemoIds.push(this.#confirmProposal(proposal, timestamp));
        }
        this.#db.prepare(
          "UPDATE intake_proposals SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'",
        ).run(
          resolution.action === "confirm" ? "confirmed" : resolution.action === "reject" ? "rejected" : "superseded",
          timestamp,
          proposal.id,
        );
        outcome.resolvedProposalIds.push(proposal.id);
      }

      if (input.envelope.memoProposal) {
        outcome.createdProposalId = this.#insertProposal(job, input.envelope.memoProposal, timestamp);
      }

      this.#db.prepare(
        `UPDATE ai_messages
         SET content = ?, status = 'completed', input_tokens = ?, cached_input_tokens = ?,
             output_tokens = ?, reasoning_tokens = ?, duration_ms = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.content,
        input.inputTokens,
        input.cachedInputTokens,
        input.outputTokens,
        input.reasoningTokens,
        input.durationMs,
        timestamp,
        job.assistantMessageId,
      );
      this.#db.prepare(
        "UPDATE ai_jobs SET status = 'succeeded', finished_at = ? WHERE id = ? AND status = 'running'",
      ).run(timestamp, id);
      this.#db.prepare(
        `UPDATE ai_conversations
         SET provider_thread_id = COALESCE(?, provider_thread_id), updated_at = ?
         WHERE id = ?`,
      ).run(input.providerThreadId ?? null, timestamp, job.conversationId);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    const completed = this.getAiJob(id);
    return completed ? { job: completed, outcome } : null;
  }

  listIntakeProposals(
    conversationId?: string,
    status?: IntakeProposalStatus,
    limit = 30,
  ): IntakeProposal[] {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (conversationId) {
      conditions.push("conversation_id = ?");
      values.push(conversationId);
    }
    if (status) {
      conditions.push("status = ?");
      values.push(status);
    }
    values.push(limit);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.#db.prepare(
      `SELECT id, conversation_id, source_message_id, operation, target_memo_id,
              status, draft_json, raw_text, created_at, resolved_at
       FROM intake_proposals ${where}
       ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    ).all(...values) as unknown as IntakeProposalRow[];
    return rows.map(mapIntakeProposal);
  }

  listAssistantMemos(limit = 50): AssistantMemo[] {
    const rows = this.#db.prepare(
      `SELECT m.id, m.current_version, v.draft_json, v.raw_text, m.created_at, m.updated_at
       FROM assistant_memos m
       JOIN assistant_memo_versions v
         ON v.memo_id = m.id AND v.version = m.current_version
       ORDER BY m.updated_at DESC, m.rowid DESC LIMIT ?`,
    ).all(limit) as unknown as AssistantMemoRow[];
    return rows.map(mapAssistantMemo);
  }

  getAssistantMemo(id: string): AssistantMemo | null {
    const row = this.#db.prepare(
      `SELECT m.id, m.current_version, v.draft_json, v.raw_text, m.created_at, m.updated_at
       FROM assistant_memos m
       JOIN assistant_memo_versions v
         ON v.memo_id = m.id AND v.version = m.current_version
       WHERE m.id = ?`,
    ).get(id) as unknown as AssistantMemoRow | undefined;
    return row ? mapAssistantMemo(row) : null;
  }

  listAssistantMemoVersions(id: string): AssistantMemoVersion[] {
    const rows = this.#db.prepare(
      `SELECT memo_id, version, draft_json, raw_text, created_at
       FROM assistant_memo_versions WHERE memo_id = ? ORDER BY version DESC`,
    ).all(id) as unknown as AssistantMemoVersionRow[];
    return rows.map(mapAssistantMemoVersion);
  }

  buildAssistantTurnContext(conversationId: string): string {
    const messages = this.listAiMessages(conversationId).slice(-12);
    const pending = this.listIntakeProposals(conversationId, "pending", 10);
    const memos = this.listAssistantMemos(10);
    return JSON.stringify({
      localDate: new Date().toLocaleDateString("en-CA"),
      recentConversation: messages.map((message) => ({ role: message.role, content: message.content.slice(0, 4_000) })),
      pendingProposals: pending.map((proposal) => ({ id: proposal.id, memo: proposal.memo })),
      recentMemos: memos.map((memo) => ({ id: memo.id, memo: memo.memo })),
    });
  }

  finishAiJob(id: string, status: "failed" | "cancelled" | "interrupted", error: string): AiJob | null {
    const current = this.getAiJob(id);
    if (!current || !["queued", "running"].includes(current.status)) return null;
    const timestamp = new Date().toISOString();
    const messageStatus: AiMessageStatus = status === "cancelled" ? "cancelled" : "failed";
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(
        `UPDATE ai_jobs SET status = ?, error = ?, finished_at = ?
         WHERE id = ? AND status IN ('queued', 'running')`,
      ).run(status, error, timestamp, id);
      this.#db.prepare(
        `UPDATE ai_messages SET status = ?, updated_at = ?
         WHERE id = ?`,
      ).run(messageStatus, timestamp, current.assistantMessageId);
      this.#db.exec("COMMIT");
    } catch (cause) {
      this.#db.exec("ROLLBACK");
      throw cause;
    }
    return this.getAiJob(id);
  }

  interruptRunningAiJobs(): number {
    const rows = this.#db.prepare("SELECT id FROM ai_jobs WHERE status = 'running'").all() as Array<{ id: string }>;
    for (const row of rows) {
      this.finishAiJob(row.id, "interrupted", "서버가 재시작되어 요청이 중단되었습니다.");
    }
    return rows.length;
  }

  getAiMessage(id: string): AiMessage | null {
    const row = this.#db.prepare(
      `SELECT id, conversation_id, job_id, role, content, status, provider, model,
              reasoning_effort, input_tokens, cached_input_tokens, output_tokens,
              reasoning_tokens, duration_ms, created_at, updated_at
       FROM ai_messages WHERE id = ?`,
    ).get(id) as unknown as AiMessageRow | undefined;
    return row ? mapAiMessage(row) : null;
  }

  #getIntakeProposalRow(id: string): IntakeProposalRow | null {
    const row = this.#db.prepare(
      `SELECT id, conversation_id, source_message_id, operation, target_memo_id,
              status, draft_json, raw_text, created_at, resolved_at
       FROM intake_proposals WHERE id = ?`,
    ).get(id) as unknown as IntakeProposalRow | undefined;
    return row ?? null;
  }

  #insertProposal(job: AiJob, proposal: MemoProposalDraft, timestamp: string): string {
    const source = this.getAiMessage(job.userMessageId);
    if (!source) throw new Error("intake source message is unavailable");
    if (proposal.targetMemoId && !this.getAssistantMemo(proposal.targetMemoId)) {
      throw new Error("target memo is unavailable");
    }
    if (proposal.supersedesProposalId) {
      const superseded = this.#getIntakeProposalRow(proposal.supersedesProposalId);
      if (!superseded || superseded.conversation_id !== job.conversationId || superseded.status !== "superseded") {
        throw new Error("superseded proposal is unavailable");
      }
    }
    const id = randomUUID();
    this.#db.prepare(
      `INSERT INTO intake_proposals
        (id, conversation_id, source_message_id, operation, target_memo_id,
         status, draft_json, raw_text, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)`,
    ).run(
      id,
      job.conversationId,
      job.userMessageId,
      proposal.operation,
      proposal.targetMemoId,
      JSON.stringify(proposal.memo),
      source.content,
      timestamp,
    );
    return id;
  }

  #confirmProposal(proposal: IntakeProposalRow, timestamp: string): string {
    const draft = parseStoredDraft(proposal.draft_json);
    if (proposal.operation === "create") {
      const memoId = randomUUID();
      this.#db.prepare(
        "INSERT INTO assistant_memos (id, current_version, created_at, updated_at) VALUES (?, 1, ?, ?)",
      ).run(memoId, timestamp, timestamp);
      this.#db.prepare(
        `INSERT INTO assistant_memo_versions
          (memo_id, version, raw_text, draft_json, created_at) VALUES (?, 1, ?, ?, ?)`,
      ).run(memoId, proposal.raw_text, JSON.stringify(draft), timestamp);
      return memoId;
    }

    if (!proposal.target_memo_id) throw new Error("revision proposal has no target memo");
    const current = this.getAssistantMemo(proposal.target_memo_id);
    if (!current) throw new Error("revision target memo is unavailable");
    const nextVersion = current.currentVersion + 1;
    this.#db.prepare(
      `INSERT INTO assistant_memo_versions
        (memo_id, version, raw_text, draft_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(current.id, nextVersion, proposal.raw_text, JSON.stringify(draft), timestamp);
    this.#db.prepare(
      "UPDATE assistant_memos SET current_version = ?, updated_at = ? WHERE id = ?",
    ).run(nextVersion, timestamp, current.id);
    return current.id;
  }

  #aiHistoryCounts(): AiHistoryClearResult {
    return {
      conversations: this.#rowCount("ai_conversations"),
      messages: this.#rowCount("ai_messages"),
      jobs: this.#rowCount("ai_jobs"),
    };
  }

  #rowCount(table:
    | "captures"
    | "tasks"
    | "assistant_profiles"
    | "assistant_profile_versions"
    | "intake_proposals"
    | "assistant_memos"
    | "assistant_memo_versions"
    | "ai_conversations"
    | "ai_messages"
    | "ai_jobs"): number {
    const row = this.#db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    return row.count;
  }

  #nextAvailableAiAssistantSlot(): 1 | 2 | null {
    const rows = this.#db.prepare(
      "SELECT assistant_slot FROM ai_conversations WHERE archived_at IS NULL",
    ).all() as Array<{ assistant_slot: 1 | 2 }>;
    const occupied = new Set(rows.map((row) => row.assistant_slot));
    if (!occupied.has(1)) return 1;
    if (!occupied.has(2)) return 2;
    return null;
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

      CREATE TABLE IF NOT EXISTS assistant_profiles (
        id TEXT PRIMARY KEY CHECK (id = 'chief-assistant'),
        version INTEGER NOT NULL CHECK (version >= 1),
        name TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        role_description TEXT NOT NULL,
        communication_style TEXT NOT NULL,
        working_principles TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assistant_profile_versions (
        profile_id TEXT NOT NULL REFERENCES assistant_profiles(id) ON DELETE CASCADE,
        version INTEGER NOT NULL CHECK (version >= 1),
        name TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        role_description TEXT NOT NULL,
        communication_style TEXT NOT NULL,
        working_principles TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (profile_id, version)
      );

      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        assistant_slot INTEGER NOT NULL CHECK (assistant_slot IN (1, 2)),
        provider TEXT NOT NULL CHECK (provider IN ('codex', 'grok')),
        title TEXT NOT NULL,
        default_model TEXT NOT NULL,
        default_reasoning_effort TEXT NOT NULL,
        provider_thread_id TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        job_id TEXT,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled')),
        provider TEXT NOT NULL CHECK (provider IN ('codex', 'grok')),
        model TEXT NOT NULL,
        reasoning_effort TEXT NOT NULL,
        input_tokens INTEGER,
        cached_input_tokens INTEGER,
        output_tokens INTEGER,
        reasoning_tokens INTEGER,
        duration_ms INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_jobs (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        user_message_id TEXT NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
        assistant_message_id TEXT NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
        client_request_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL CHECK (provider IN ('codex', 'grok')),
        model TEXT NOT NULL,
        reasoning_effort TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted')),
        error TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ai_jobs_provider_status
        ON ai_jobs (provider, status, created_at);

      CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
        ON ai_messages (conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS assistant_memos (
        id TEXT PRIMARY KEY,
        current_version INTEGER NOT NULL CHECK (current_version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assistant_memo_versions (
        memo_id TEXT NOT NULL REFERENCES assistant_memos(id) ON DELETE CASCADE,
        version INTEGER NOT NULL CHECK (version >= 1),
        raw_text TEXT NOT NULL,
        draft_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (memo_id, version)
      );

      CREATE TABLE IF NOT EXISTS intake_proposals (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        source_message_id TEXT NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
        operation TEXT NOT NULL CHECK (operation IN ('create', 'revise')),
        target_memo_id TEXT REFERENCES assistant_memos(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'superseded')),
        draft_json TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_intake_proposals_conversation_status
        ON intake_proposals (conversation_id, status, created_at);

      CREATE INDEX IF NOT EXISTS idx_assistant_memo_versions_created
        ON assistant_memo_versions (created_at);
    `);

    const conversationColumns = this.#db.prepare("PRAGMA table_info(ai_conversations)").all() as Array<{
      name: string;
    }>;
    if (!conversationColumns.some((column) => column.name === "assistant_slot")) {
      this.#db.exec("ALTER TABLE ai_conversations ADD COLUMN assistant_slot INTEGER");
    }
    if (!conversationColumns.some((column) => column.name === "archived_at")) {
      this.#db.exec("ALTER TABLE ai_conversations ADD COLUMN archived_at TEXT");
    }

    const assigned = this.#db.prepare(
      "SELECT COUNT(*) AS count FROM ai_conversations WHERE assistant_slot IS NOT NULL",
    ).get() as { count: number };
    if (assigned.count === 0) {
      const recent = this.#db.prepare(
        "SELECT id FROM ai_conversations ORDER BY updated_at DESC, rowid DESC LIMIT 2",
      ).all() as Array<{ id: string }>;
      recent.forEach((conversation, index) => {
        this.#db.prepare("UPDATE ai_conversations SET assistant_slot = ? WHERE id = ?")
          .run(index + 1, conversation.id);
      });
      this.#db.prepare(
        `UPDATE ai_conversations
         SET assistant_slot = 1, archived_at = COALESCE(archived_at, updated_at)
         WHERE assistant_slot IS NULL`,
      ).run();
    }
    this.#db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_conversations_active_slot
        ON ai_conversations (assistant_slot) WHERE archived_at IS NULL;
    `);
    this.#ensureDefaultAssistantProfile();
  }

  #ensureDefaultAssistantProfile(): void {
    const timestamp = new Date().toISOString();
    const inserted = this.#db.prepare(
      `INSERT OR IGNORE INTO assistant_profiles
        (id, version, name, owner_address, role_description, communication_style,
         working_principles, created_at, updated_at)
       VALUES ('chief-assistant', 1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      DEFAULT_ASSISTANT_PROFILE.name,
      DEFAULT_ASSISTANT_PROFILE.ownerAddress,
      DEFAULT_ASSISTANT_PROFILE.roleDescription,
      DEFAULT_ASSISTANT_PROFILE.communicationStyle,
      DEFAULT_ASSISTANT_PROFILE.workingPrinciples,
      timestamp,
      timestamp,
    );
    if (inserted.changes === 0) return;
    this.#db.prepare(
      `INSERT INTO assistant_profile_versions
        (profile_id, version, name, owner_address, role_description,
         communication_style, working_principles, created_at)
       VALUES ('chief-assistant', 1, ?, ?, ?, ?, ?, ?)`,
    ).run(
      DEFAULT_ASSISTANT_PROFILE.name,
      DEFAULT_ASSISTANT_PROFILE.ownerAddress,
      DEFAULT_ASSISTANT_PROFILE.roleDescription,
      DEFAULT_ASSISTANT_PROFILE.communicationStyle,
      DEFAULT_ASSISTANT_PROFILE.workingPrinciples,
      timestamp,
    );
  }
}

function mapAssistantProfile(row: AssistantProfileRow): AssistantProfile {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    ownerAddress: row.owner_address,
    roleDescription: row.role_description,
    communicationStyle: row.communication_style,
    workingPrinciples: row.working_principles,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

function mapAiConversation(row: AiConversationRow): AiConversation {
  return {
    id: row.id,
    assistantSlot: row.assistant_slot,
    provider: row.provider,
    title: row.title,
    defaultModel: row.default_model,
    defaultReasoningEffort: row.default_reasoning_effort,
    providerThreadId: row.provider_thread_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAiMessage(row: AiMessageRow): AiMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    jobId: row.job_id,
    role: row.role,
    content: row.content,
    status: row.status,
    provider: row.provider,
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    inputTokens: row.input_tokens,
    cachedInputTokens: row.cached_input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAiJob(row: AiJobRow): AiJob {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    clientRequestId: row.client_request_id,
    provider: row.provider,
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapIntakeProposal(row: IntakeProposalRow): IntakeProposal {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sourceMessageId: row.source_message_id,
    operation: row.operation,
    targetMemoId: row.target_memo_id,
    status: row.status,
    memo: parseStoredDraft(row.draft_json),
    rawText: row.raw_text,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function mapAssistantMemo(row: AssistantMemoRow): AssistantMemo {
  return {
    id: row.id,
    currentVersion: row.current_version,
    memo: parseStoredDraft(row.draft_json),
    rawText: row.raw_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssistantMemoVersion(row: AssistantMemoVersionRow): AssistantMemoVersion {
  return {
    memoId: row.memo_id,
    version: row.version,
    memo: parseStoredDraft(row.draft_json),
    rawText: row.raw_text,
    createdAt: row.created_at,
  };
}

function parseStoredDraft(value: string): AssistantMemoDraft {
  return JSON.parse(value) as AssistantMemoDraft;
}

function buildAiMessage(input: {
  id: string;
  conversationId: string;
  jobId: string;
  role: AiMessageRole;
  content: string;
  status: AiMessageStatus;
  provider: AiProviderId;
  model: string;
  reasoningEffort: string;
  timestamp: string;
}): AiMessage {
  return {
    id: input.id,
    conversationId: input.conversationId,
    jobId: input.jobId,
    role: input.role,
    content: input.content,
    status: input.status,
    provider: input.provider,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    durationMs: null,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

function insertAiMessage(db: DatabaseSync, message: AiMessage): void {
  db.prepare(
    `INSERT INTO ai_messages
      (id, conversation_id, job_id, role, content, status, provider, model,
       reasoning_effort, input_tokens, cached_input_tokens, output_tokens,
       reasoning_tokens, duration_ms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    message.id,
    message.conversationId,
    message.jobId,
    message.role,
    message.content,
    message.status,
    message.provider,
    message.model,
    message.reasoningEffort,
    message.inputTokens,
    message.cachedInputTokens,
    message.outputTokens,
    message.reasoningTokens,
    message.durationMs,
    message.createdAt,
    message.updatedAt,
  );
}

function titleFromMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length <= 60 ? normalized : `${normalized.slice(0, 57)}...`;
}
