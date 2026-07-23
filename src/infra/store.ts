import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AssistantMemoDraft,
  AssistantTurnEnvelope,
  GroundingStatus,
  MemoProposalDraft,
} from "../domain/intake.js";
import {
  DEFAULT_ASSISTANT_PROFILE,
  systemTimezone,
  type AssistantProfile,
  type AssistantProfileDraft,
} from "../domain/assistant-profile.js";
import {
  buildRetrievalPlan,
  normalizeProjectAlias,
  type ProjectAliasCandidate,
  type ProjectBrief,
  type ProjectBriefItem,
  type ProjectProjectionDraft,
  type ProjectionStatus,
  type RetrievalCoverage,
  type RetrievalPlan,
} from "../domain/projects.js";

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
  groundingStatus: GroundingStatus | null;
  groundingConflicts: string[];
  sources: AiMessageSource[];
  retrievalRunId: string | null;
  coverage: RetrievalCoverage | null;
  projectBrief: ProjectBrief | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageSource {
  referenceId: string;
  memoId: string;
  version: number;
  summary: string;
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
  projectProjections: ProjectProjectionDraft[];
  rawText: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AssistantMemoVersion {
  memoId: string;
  version: number;
  rawText: string;
  memo: AssistantMemoDraft;
  projectProjections: ProjectProjectionDraft[] | null;
  projectionStatus: ProjectionStatus;
  projectionDetail: string | null;
  createdAt: string;
}

export interface AssistantMemo {
  id: string;
  currentVersion: number;
  memo: AssistantMemoDraft;
  projectProjections: ProjectProjectionDraft[] | null;
  projectionStatus: ProjectionStatus;
  projectionDetail: string | null;
  rawText: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMemoSearchHit {
  memoId: string;
  version: number;
  rank: number;
  rawExcerpt: string;
  memo: AssistantMemoDraft;
  updatedAt: string;
}

export interface AssistantTurnContextPackage {
  serialized: string;
  groundingSources: AssistantMemoSearchHit[];
  retrievalRunId: string;
  coverage: RetrievalCoverage;
  projectBrief: ProjectBrief | null;
  plan: RetrievalPlan;
}

export interface ProjectSummary {
  id: string;
  name: string;
  aliases: string[];
  coverage: RetrievalCoverage;
  coverageReasons: string[];
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
  { id: "ai_message_sources", label: "AI 답변 근거" },
  { id: "ai_jobs", label: "AI 작업" },
  { id: "intake_proposals", label: "메모 제안" },
  { id: "assistant_memos", label: "확정 메모" },
  { id: "assistant_memo_versions", label: "메모 버전" },
  { id: "memo_projection_statuses", label: "메모 projection 상태" },
  { id: "projects", label: "프로젝트" },
  { id: "project_aliases", label: "프로젝트 별칭" },
  { id: "project_snapshots", label: "프로젝트 snapshot" },
  { id: "action_snapshots", label: "Action snapshot" },
  { id: "decision_snapshots", label: "결정 snapshot" },
  { id: "dependency_snapshots", label: "의존성 snapshot" },
  { id: "risk_snapshots", label: "위험 snapshot" },
  { id: "meeting_snapshots", label: "회의 snapshot" },
  { id: "judgment_snapshots", label: "판단 snapshot" },
  { id: "retrieval_runs", label: "검색 실행" },
  { id: "retrieval_candidates", label: "검색 후보" },
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
  timezone: string;
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
  grounding_status: GroundingStatus | null;
  grounding_conflicts_json: string | null;
  retrieval_run_id: string | null;
  coverage: RetrievalCoverage | null;
  project_brief_json: string | null;
  created_at: string;
  updated_at: string;
}

interface AiMessageSourceRow {
  memo_id: string;
  memo_version: number;
  draft_json: string;
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
  projection_json: string | null;
  raw_text: string;
  created_at: string;
  resolved_at: string | null;
}

interface AssistantMemoRow {
  id: string;
  current_version: number;
  draft_json: string;
  projection_json: string | null;
  projection_status: ProjectionStatus;
  projection_detail: string | null;
  raw_text: string;
  created_at: string;
  updated_at: string;
}

interface AssistantMemoVersionRow {
  memo_id: string;
  version: number;
  draft_json: string;
  projection_json: string | null;
  projection_status: ProjectionStatus;
  projection_detail: string | null;
  raw_text: string;
  created_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface SnapshotRow {
  id: string;
  text: string;
  status: string | null;
  planned_on: string | null;
  due_on: string | null;
  occurred_at: string | null;
  source_memo_id: string;
  source_memo_version: number;
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

export type AiConversationSelection = Omit<CreateAiConversationInput, "assistantSlot">;

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
  messageSources: number;
  jobs: number;
  retrievalRuns: number;
  retrievalCandidates: number;
}

export interface DataResetResult extends AiHistoryClearResult {
  captures: number;
  tasks: number;
  assistantProfileVersions: number;
  intakeProposals: number;
  assistantMemos: number;
  assistantMemoVersions: number;
  projectionStatuses: number;
  projects: number;
  projectAliases: number;
  projectSnapshots: number;
  actionSnapshots: number;
  decisionSnapshots: number;
  dependencySnapshots: number;
  riskSnapshots: number;
  meetingSnapshots: number;
  judgmentSnapshots: number;
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
               working_principles, timezone, created_at, updated_at
        FROM assistant_profiles ORDER BY updated_at DESC LIMIT ?`,
      assistant_profile_versions: `
        SELECT profile_id, version, name, owner_address, role_description, communication_style,
               working_principles, timezone, created_at
        FROM assistant_profile_versions ORDER BY version DESC LIMIT ?`,
      ai_conversations: `
        SELECT id, assistant_slot, provider, title, default_model, default_reasoning_effort,
               archived_at, created_at, updated_at
        FROM ai_conversations ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      ai_messages: `
        SELECT id, conversation_id, job_id, role, content, status, provider, model,
               reasoning_effort, input_tokens, cached_input_tokens, output_tokens,
               reasoning_tokens, duration_ms, grounding_status, grounding_conflicts_json,
               retrieval_run_id, coverage, project_brief_json, created_at, updated_at
        FROM ai_messages ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      ai_message_sources: `
        SELECT assistant_message_id, memo_id, memo_version, created_at
        FROM ai_message_sources ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      ai_jobs: `
        SELECT id, conversation_id, user_message_id, assistant_message_id, provider, model,
               reasoning_effort, status, error, created_at, started_at, finished_at
        FROM ai_jobs ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      intake_proposals: `
        SELECT id, conversation_id, source_message_id, operation, target_memo_id, status,
               draft_json, projection_json, raw_text, created_at, resolved_at
        FROM intake_proposals ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      assistant_memos: `
        SELECT id, current_version, created_at, updated_at
        FROM assistant_memos ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      assistant_memo_versions: `
        SELECT v.memo_id, v.version, v.raw_text, v.draft_json, v.projection_json,
               s.status AS projection_status, s.detail AS projection_detail, v.created_at
        FROM assistant_memo_versions v
        JOIN memo_projection_statuses s
          ON s.memo_id = v.memo_id AND s.memo_version = v.version
        ORDER BY v.created_at DESC, v.rowid DESC LIMIT ?`,
      memo_projection_statuses: `
        SELECT memo_id, memo_version, status, detail, updated_at
        FROM memo_projection_statuses ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      projects: `
        SELECT id, name, created_at, updated_at
        FROM projects ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      project_aliases: `
        SELECT project_id, alias, normalized_alias, created_at
        FROM project_aliases ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      project_snapshots: `
        SELECT id, project_id, outcome, current_state, source_memo_id, source_memo_version,
               active, created_at
        FROM project_snapshots ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      action_snapshots: `
        SELECT id, project_id, title, status, planned_on, due_on, source_memo_id,
               source_memo_version, active, created_at
        FROM action_snapshots ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      decision_snapshots: `
        SELECT id, project_id, text, decided_on, source_memo_id, source_memo_version,
               active, created_at
        FROM decision_snapshots ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      dependency_snapshots: `
        SELECT id, project_id, text, status, source_memo_id, source_memo_version,
               active, created_at
        FROM dependency_snapshots ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      risk_snapshots: `
        SELECT id, project_id, text, status, source_memo_id, source_memo_version,
               active, created_at
        FROM risk_snapshots ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      meeting_snapshots: `
        SELECT id, project_id, title, scheduled_at, status, source_memo_id,
               source_memo_version, active, created_at
        FROM meeting_snapshots ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      judgment_snapshots: `
        SELECT id, project_id, question, status, source_memo_id, source_memo_version,
               active, created_at
        FROM judgment_snapshots ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      retrieval_runs: `
        SELECT id, assistant_message_id, query, as_of, timezone, plan_json, reader,
               coverage, unresolved_json, truncation_reason, created_at
        FROM retrieval_runs ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      retrieval_candidates: `
        SELECT id, retrieval_run_id, source_memo_id, source_memo_version, domain_table,
               domain_row_id, reader, rank, included, exclusion_reason, created_at
        FROM retrieval_candidates ORDER BY created_at DESC, rowid DESC LIMIT ?`,
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
      projectionStatuses: this.#rowCount("memo_projection_statuses"),
      projects: this.#rowCount("projects"),
      projectAliases: this.#rowCount("project_aliases"),
      projectSnapshots: this.#rowCount("project_snapshots"),
      actionSnapshots: this.#rowCount("action_snapshots"),
      decisionSnapshots: this.#rowCount("decision_snapshots"),
      dependencySnapshots: this.#rowCount("dependency_snapshots"),
      riskSnapshots: this.#rowCount("risk_snapshots"),
      meetingSnapshots: this.#rowCount("meeting_snapshots"),
      judgmentSnapshots: this.#rowCount("judgment_snapshots"),
      ...this.#aiHistoryCounts(),
    };
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.exec(`
        DELETE FROM assistant_memo_search;
        DELETE FROM retrieval_candidates;
        DELETE FROM retrieval_runs;
        DELETE FROM judgment_snapshots;
        DELETE FROM meeting_snapshots;
        DELETE FROM risk_snapshots;
        DELETE FROM dependency_snapshots;
        DELETE FROM decision_snapshots;
        DELETE FROM action_snapshots;
        DELETE FROM project_snapshots;
        DELETE FROM project_aliases;
        DELETE FROM projects;
        DELETE FROM memo_projection_statuses;
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
              working_principles, timezone, created_at, updated_at
       FROM assistant_profiles WHERE id = 'chief-assistant'`,
    ).get() as AssistantProfileRow | undefined;
    if (!row) throw new Error("chief assistant profile is unavailable");
    return mapAssistantProfile(row);
  }

  updateAssistantProfile(draft: AssistantProfileDraft): AssistantProfile {
    const current = this.getAssistantProfile();
    const version = current.version + 1;
    const timezone = draft.timezone ?? current.timezone;
    const timestamp = new Date().toISOString();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(
        `UPDATE assistant_profiles
         SET version = ?, name = ?, owner_address = ?, role_description = ?,
             communication_style = ?, working_principles = ?, timezone = ?, updated_at = ?
         WHERE id = 'chief-assistant'`,
      ).run(
        version,
        draft.name,
        draft.ownerAddress,
        draft.roleDescription,
        draft.communicationStyle,
        draft.workingPrinciples,
        timezone,
        timestamp,
      );
      this.#db.prepare(
        `INSERT INTO assistant_profile_versions
          (profile_id, version, name, owner_address, role_description,
           communication_style, working_principles, timezone, created_at)
         VALUES ('chief-assistant', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        version,
        draft.name,
        draft.ownerAddress,
        draft.roleDescription,
        draft.communicationStyle,
        draft.workingPrinciples,
        timezone,
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

  resetAiConversation(id: string, selection?: AiConversationSelection): AiConversation {
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
        provider: selection?.provider ?? conversation.provider,
        model: selection?.model ?? conversation.defaultModel,
        reasoningEffort: selection?.reasoningEffort ?? conversation.defaultReasoningEffort,
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
              reasoning_tokens, duration_ms, grounding_status, grounding_conflicts_json,
              retrieval_run_id, coverage, project_brief_json, created_at, updated_at
       FROM ai_messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC, rowid ASC`,
    ).all(conversationId) as unknown as AiMessageRow[];
    return rows.map((row) => ({
      ...mapAiMessage(row),
      sources: this.listAiMessageSources(row.id),
    }));
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
    input: CompleteAiJobInput & {
      envelope: AssistantTurnEnvelope;
      groundingSources: AssistantMemoSearchHit[];
      retrievalRunId: string;
      coverage: RetrievalCoverage;
      projectBrief: ProjectBrief | null;
    },
  ): { job: AiJob; outcome: IntakeOutcome } | null {
    const job = this.getAiJob(id);
    if (!job || job.status !== "running") return null;
    const availableSources = new Map(input.groundingSources.map((source) => [
      memoReferenceId(source.memoId, source.version),
      source,
    ]));
    const citedReferenceIds = input.projectBrief
      ? input.projectBrief.references.map((reference) => reference.referenceId)
      : input.envelope.grounding.citedReferenceIds;
    const citedSources = [...new Set(citedReferenceIds)].map((referenceId) => {
      const source = availableSources.get(referenceId);
      if (!source) throw new Error("grounding source is unavailable");
      return source;
    });
    const groundingStatus: GroundingStatus = input.projectBrief
      ? input.projectBrief.sections.conflictsAndUnknowns.length && citedSources.length
        ? "conflicting"
        : citedSources.length
          ? "grounded"
          : "insufficient"
      : input.envelope.grounding.status;
    const groundingConflicts = input.projectBrief
      ? input.projectBrief.sections.conflictsAndUnknowns.map((item) => item.text).slice(0, 5)
      : input.envelope.grounding.conflicts;
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
             output_tokens = ?, reasoning_tokens = ?, duration_ms = ?,
             grounding_status = ?, grounding_conflicts_json = ?, retrieval_run_id = ?,
             coverage = ?, project_brief_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.content,
        input.inputTokens,
        input.cachedInputTokens,
        input.outputTokens,
        input.reasoningTokens,
        input.durationMs,
        groundingStatus,
        JSON.stringify(groundingStatus === "conflicting" ? groundingConflicts : []),
        input.retrievalRunId,
        input.coverage,
        input.projectBrief ? JSON.stringify(input.projectBrief) : null,
        timestamp,
        job.assistantMessageId,
      );
      for (const source of citedSources) {
        this.#db.prepare(
          `INSERT INTO ai_message_sources
            (assistant_message_id, memo_id, memo_version, created_at)
           VALUES (?, ?, ?, ?)`,
        ).run(job.assistantMessageId, source.memoId, source.version, timestamp);
      }
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
              status, draft_json, projection_json, raw_text, created_at, resolved_at
       FROM intake_proposals ${where}
       ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    ).all(...values) as unknown as IntakeProposalRow[];
    return rows.map(mapIntakeProposal);
  }

  listAssistantMemos(limit = 50): AssistantMemo[] {
    const rows = this.#db.prepare(
      `SELECT m.id, m.current_version, v.draft_json, v.projection_json, v.raw_text,
              s.status AS projection_status, s.detail AS projection_detail,
              m.created_at, m.updated_at
       FROM assistant_memos m
       JOIN assistant_memo_versions v
         ON v.memo_id = m.id AND v.version = m.current_version
       JOIN memo_projection_statuses s
         ON s.memo_id = v.memo_id AND s.memo_version = v.version
       ORDER BY m.updated_at DESC, m.rowid DESC LIMIT ?`,
    ).all(limit) as unknown as AssistantMemoRow[];
    return rows.map(mapAssistantMemo);
  }

  getAssistantMemo(id: string): AssistantMemo | null {
    const row = this.#db.prepare(
      `SELECT m.id, m.current_version, v.draft_json, v.projection_json, v.raw_text,
              s.status AS projection_status, s.detail AS projection_detail,
              m.created_at, m.updated_at
       FROM assistant_memos m
       JOIN assistant_memo_versions v
         ON v.memo_id = m.id AND v.version = m.current_version
       JOIN memo_projection_statuses s
         ON s.memo_id = v.memo_id AND s.memo_version = v.version
       WHERE m.id = ?`,
    ).get(id) as unknown as AssistantMemoRow | undefined;
    return row ? mapAssistantMemo(row) : null;
  }

  listAssistantMemoVersions(id: string): AssistantMemoVersion[] {
    const rows = this.#db.prepare(
      `SELECT v.memo_id, v.version, v.draft_json, v.projection_json, v.raw_text,
              s.status AS projection_status, s.detail AS projection_detail, v.created_at
       FROM assistant_memo_versions v
       JOIN memo_projection_statuses s
         ON s.memo_id = v.memo_id AND s.memo_version = v.version
       WHERE v.memo_id = ? ORDER BY v.version DESC`,
    ).all(id) as unknown as AssistantMemoVersionRow[];
    return rows.map(mapAssistantMemoVersion);
  }

  searchAssistantMemos(query: string, limit = 5): AssistantMemoSearchHit[] {
    const ftsQuery = buildMemoFtsQuery(query);
    if (!ftsQuery) return [];
    const boundedLimit = Math.max(1, Math.min(limit, 10));
    const rows = this.#db.prepare(
      `SELECT s.memo_id, s.version, bm25(assistant_memo_search) AS rank,
              v.raw_text, v.draft_json, m.updated_at
       FROM assistant_memo_search s
       JOIN assistant_memos m ON m.id = s.memo_id AND m.current_version = s.version
       JOIN assistant_memo_versions v ON v.memo_id = s.memo_id AND v.version = s.version
       WHERE assistant_memo_search MATCH ?
       ORDER BY rank ASC, m.updated_at DESC
       LIMIT ?`,
    ).all(ftsQuery, boundedLimit) as unknown as Array<{
      memo_id: string;
      version: number;
      rank: number;
      raw_text: string;
      draft_json: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      memoId: row.memo_id,
      version: row.version,
      rank: row.rank,
      rawExcerpt: boundedExcerpt(row.raw_text, 2_000),
      memo: parseStoredDraft(row.draft_json),
      updatedAt: row.updated_at,
    }));
  }

  listProjects(): ProjectSummary[] {
    const rows = this.#db.prepare(
      "SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC, rowid DESC",
    ).all() as unknown as ProjectRow[];
    const coverage = this.#projectCoverage();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      aliases: this.#projectAliases(row.id),
      coverage: coverage.coverage,
      coverageReasons: coverage.reasons,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getProjectBrief(
    projectId: string,
    asOf = new Date().toISOString(),
    timezone = this.getAssistantProfile().timezone,
    supplementalQuery?: string,
  ): ProjectBrief | null {
    const project = this.#db.prepare(
      "SELECT id, name, created_at, updated_at FROM projects WHERE id = ?",
    ).get(projectId) as unknown as ProjectRow | undefined;
    if (!project) return null;

    const outcomes: ProjectBriefItem[] = [];
    const currentState: ProjectBriefItem[] = [];
    const projectRows = this.#db.prepare(
      `SELECT id, outcome, current_state, source_memo_id, source_memo_version
       FROM project_snapshots WHERE project_id = ? AND active = 1
       ORDER BY created_at ASC, rowid ASC`,
    ).all(projectId) as unknown as Array<{
      id: string;
      outcome: string | null;
      current_state: string | null;
      source_memo_id: string;
      source_memo_version: number;
    }>;
    for (const row of projectRows) {
      const referenceIds = [memoReferenceId(row.source_memo_id, row.source_memo_version)];
      if (row.outcome) outcomes.push(briefItem(`${row.id}:outcome`, row.outcome, referenceIds));
      if (row.current_state) currentState.push(briefItem(`${row.id}:state`, row.current_state, referenceIds));
    }

    const openActions = this.#snapshotItems(
      `SELECT id, title AS text, status, planned_on, due_on, NULL AS occurred_at,
              source_memo_id, source_memo_version
       FROM action_snapshots
       WHERE project_id = ? AND active = 1 AND status = 'open'
       ORDER BY COALESCE(due_on, planned_on, '9999-12-31'), created_at, rowid`,
      projectId,
    );
    const decisions = this.#snapshotItems(
      `SELECT id, text, NULL AS status, NULL AS planned_on, NULL AS due_on,
              decided_on AS occurred_at, source_memo_id, source_memo_version
       FROM decision_snapshots
       WHERE project_id = ? AND active = 1
       ORDER BY COALESCE(decided_on, '9999-12-31'), created_at, rowid`,
      projectId,
    );
    const dependencies = this.#snapshotItems(
      `SELECT id, text, status, NULL AS planned_on, NULL AS due_on, NULL AS occurred_at,
              source_memo_id, source_memo_version
       FROM dependency_snapshots
       WHERE project_id = ? AND active = 1 AND status = 'open'
       ORDER BY created_at, rowid`,
      projectId,
    );
    const risks = this.#snapshotItems(
      `SELECT id, text, status, NULL AS planned_on, NULL AS due_on, NULL AS occurred_at,
              source_memo_id, source_memo_version
       FROM risk_snapshots
       WHERE project_id = ? AND active = 1 AND status = 'open'
       ORDER BY created_at, rowid`,
      projectId,
    );
    const meetings = this.#snapshotItems(
      `SELECT id, title AS text, status, NULL AS planned_on, NULL AS due_on,
              scheduled_at AS occurred_at, source_memo_id, source_memo_version
       FROM meeting_snapshots
       WHERE project_id = ? AND active = 1 AND status != 'cancelled'
       ORDER BY COALESCE(scheduled_at, '9999-12-31'), created_at, rowid`,
      projectId,
    );
    const judgments = this.#snapshotItems(
      `SELECT id, question AS text, status, NULL AS planned_on, NULL AS due_on,
              NULL AS occurred_at, source_memo_id, source_memo_version
       FROM judgment_snapshots
       WHERE project_id = ? AND active = 1 AND status = 'open'
       ORDER BY created_at, rowid`,
      projectId,
    );
    const coverage = this.#projectCoverage();
    const aliases = this.#projectAliases(project.id);
    const conflictsAndUnknowns = this.#projectionIssueItems(
      supplementalQuery ?? [project.name, ...aliases].join(" "),
    );
    const sections = {
      outcomes,
      currentState,
      openActions,
      decisions,
      dependencies,
      risks,
      meetings,
      judgments,
      conflictsAndUnknowns,
    };
    const referenceIds = new Set(
      Object.values(sections).flatMap((items) => items.flatMap((item) => item.referenceIds)),
    );
    return {
      project: {
        id: project.id,
        name: project.name,
        aliases,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      },
      coverage: coverage.coverage,
      coverageReasons: coverage.reasons,
      asOf,
      timezone,
      sections,
      references: this.#projectReferences([...referenceIds]),
    };
  }

  getAssistantMemoVersion(id: string, version: number): AssistantMemoVersion | null {
    const row = this.#db.prepare(
      `SELECT v.memo_id, v.version, v.draft_json, v.projection_json, v.raw_text,
              s.status AS projection_status, s.detail AS projection_detail, v.created_at
       FROM assistant_memo_versions v
       JOIN memo_projection_statuses s
         ON s.memo_id = v.memo_id AND s.memo_version = v.version
       WHERE v.memo_id = ? AND v.version = ?`,
    ).get(id, version) as unknown as AssistantMemoVersionRow | undefined;
    return row ? mapAssistantMemoVersion(row) : null;
  }

  rebuildProjectSnapshots(): void {
    const currentRows = this.#db.prepare(
      `SELECT v.memo_id, v.version, v.projection_json
       FROM assistant_memos m
       JOIN assistant_memo_versions v
         ON v.memo_id = m.id AND v.version = m.current_version
       ORDER BY v.created_at, v.rowid`,
    ).all() as Array<{ memo_id: string; version: number; projection_json: string | null }>;
    const timestamp = new Date().toISOString();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.exec(`
        DELETE FROM judgment_snapshots;
        DELETE FROM meeting_snapshots;
        DELETE FROM risk_snapshots;
        DELETE FROM dependency_snapshots;
        DELETE FROM decision_snapshots;
        DELETE FROM action_snapshots;
        DELETE FROM project_snapshots;
      `);
      for (const row of currentRows) {
        this.#db.prepare(
          "DELETE FROM memo_projection_statuses WHERE memo_id = ? AND memo_version = ?",
        ).run(row.memo_id, row.version);
        const projections = parseStoredProjectProjections(row.projection_json);
        if (projections === null) {
          this.#recordProjectionStatus(
            row.memo_id,
            row.version,
            "unprojected",
            "기존 메모는 자동 재분석하지 않았습니다.",
            timestamp,
          );
        } else {
          this.#projectMemoVersion(row.memo_id, row.version, projections, timestamp);
        }
      }
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  buildAssistantTurnContext(
    conversationId: string,
    query: string,
    assistantMessageId?: string,
  ): AssistantTurnContextPackage {
    const messages = this.listAiMessages(conversationId).slice(-12);
    const pending = this.listIntakeProposals(conversationId, "pending", 10);
    const profile = this.getAssistantProfile();
    const asOf = new Date().toISOString();
    const plan = buildRetrievalPlan({
      query,
      aliases: this.#projectAliasCandidates(),
      asOf,
      timezone: profile.timezone,
    });
    const retrievalRunId = randomUUID();
    let groundingSources: AssistantMemoSearchHit[];
    let projectBrief: ProjectBrief | null = null;
    let coverage: RetrievalCoverage = "unknown";
    let reader = "memo_fts_reader";
    let truncationReason: string | null = null;
    const candidateRows: Array<{
      sourceMemoId: string;
      sourceMemoVersion: number;
      domainTable: string;
      domainRowId: string;
      reader: string;
      rank: number | null;
      included: boolean;
      exclusionReason: string | null;
    }> = [];

    if (plan.projectId) {
      const fullBrief = this.getProjectBrief(plan.projectId, asOf, profile.timezone, query);
      if (!fullBrief) throw new Error("retrieval plan referenced a missing project");
      const bounded = boundProjectBrief(fullBrief, 60_000);
      projectBrief = bounded.brief;
      truncationReason = bounded.truncationReason;
      if (truncationReason) {
        projectBrief.coverage = "partial";
        projectBrief.coverageReasons = [...projectBrief.coverageReasons, truncationReason];
      }
      coverage = projectBrief.coverage;
      reader = "project_snapshot_reader";
      groundingSources = projectBrief.references.map((reference, index) => ({
        memoId: reference.memoId,
        version: reference.version,
        rank: index,
        rawExcerpt: reference.rawExcerpt,
        memo: this.getAssistantMemoVersion(reference.memoId, reference.version)?.memo
          ?? { summary: reference.summary, facets: [], subjects: [], timeReferences: [], uncertainties: [] },
        updatedAt: reference.createdAt,
      }));
      const referenceById = new Map(fullBrief.references.map((reference) => [reference.referenceId, reference]));
      for (const [section, items] of Object.entries(fullBrief.sections)) {
        for (const item of items) {
          const primaryReferenceId = item.referenceIds[0];
          if (!primaryReferenceId) continue;
          const reference = referenceById.get(primaryReferenceId);
          if (!reference) continue;
          const included = !bounded.omittedItemIds.has(item.id);
          candidateRows.push({
            sourceMemoId: reference.memoId,
            sourceMemoVersion: reference.version,
            domainTable: sectionToDomainTable(section),
            domainRowId: item.id,
            reader: section === "conflictsAndUnknowns"
              ? "memo_fts_reader"
              : "project_snapshot_reader",
            rank: null,
            included,
            exclusionReason: included ? null : "context_budget",
          });
        }
      }
      candidateRows.push(...this.#excludedProjectCandidates(plan.projectId));
    } else {
      groundingSources = this.searchAssistantMemos(query, 5);
      groundingSources.forEach((source) => candidateRows.push({
        sourceMemoId: source.memoId,
        sourceMemoVersion: source.version,
        domainTable: "assistant_memo_versions",
        domainRowId: `${source.memoId}:${source.version}`,
        reader: "memo_fts_reader",
        rank: source.rank,
        included: true,
        exclusionReason: null,
      }));
    }

    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(
        `INSERT INTO retrieval_runs
          (id, assistant_message_id, query, as_of, timezone, plan_json, reader,
           coverage, unresolved_json, truncation_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        retrievalRunId,
        assistantMessageId ?? null,
        query,
        asOf,
        profile.timezone,
        JSON.stringify(plan),
        reader,
        coverage,
        JSON.stringify(plan.unresolvedConditions),
        truncationReason,
        asOf,
      );
      for (const candidate of candidateRows) {
        this.#db.prepare(
          `INSERT INTO retrieval_candidates
            (id, retrieval_run_id, source_memo_id, source_memo_version, domain_table,
             domain_row_id, reader, rank, included, exclusion_reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          randomUUID(),
          retrievalRunId,
          candidate.sourceMemoId,
          candidate.sourceMemoVersion,
          candidate.domainTable,
          candidate.domainRowId,
          candidate.reader,
          candidate.rank,
          candidate.included ? 1 : 0,
          candidate.exclusionReason,
          asOf,
        );
      }
      if (assistantMessageId) {
        this.#db.prepare(
          "UPDATE ai_messages SET retrieval_run_id = ?, coverage = ? WHERE id = ?",
        ).run(retrievalRunId, coverage, assistantMessageId);
      }
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }

    return {
      groundingSources,
      retrievalRunId,
      coverage,
      projectBrief,
      plan,
      serialized: JSON.stringify({
        localDate: localDateInTimezone(asOf, profile.timezone),
        timezone: profile.timezone,
        recentConversation: messages.map((message) => ({
          role: message.role,
          content: message.content.slice(0, 4_000),
        })),
        pendingProposals: pending.map((proposal) => ({
          id: proposal.id,
          memo: proposal.memo,
          projectProjections: proposal.projectProjections,
        })),
        retrievalPlan: plan,
        serverCoverage: coverage,
        projectBrief,
        retrievedEvidence: {
          query,
          sources: groundingSources.map((source) => ({
            referenceId: memoReferenceId(source.memoId, source.version),
            memoId: source.memoId,
            version: source.version,
            provenance: {
              type: "confirmed_assistant_memo",
              trust: "owner_confirmed_application_data",
              updatedAt: source.updatedAt,
            },
            source: { rawExcerpt: source.rawExcerpt },
            interpretation: source.memo,
          })),
        },
      }),
    };
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
              reasoning_tokens, duration_ms, grounding_status, grounding_conflicts_json,
              retrieval_run_id, coverage, project_brief_json, created_at, updated_at
       FROM ai_messages WHERE id = ?`,
    ).get(id) as unknown as AiMessageRow | undefined;
    return row
      ? { ...mapAiMessage(row), sources: this.listAiMessageSources(row.id) }
      : null;
  }

  listAiMessageSources(messageId: string): AiMessageSource[] {
    const rows = this.#db.prepare(
      `SELECT s.memo_id, s.memo_version, v.draft_json
       FROM ai_message_sources s
       JOIN assistant_memo_versions v
         ON v.memo_id = s.memo_id AND v.version = s.memo_version
       WHERE s.assistant_message_id = ?
       ORDER BY s.rowid ASC`,
    ).all(messageId) as unknown as AiMessageSourceRow[];
    return rows.map((row) => ({
      referenceId: memoReferenceId(row.memo_id, row.memo_version),
      memoId: row.memo_id,
      version: row.memo_version,
      summary: parseStoredDraft(row.draft_json).summary,
    }));
  }

  #projectAliasCandidates(): ProjectAliasCandidate[] {
    return this.#db.prepare(
      `SELECT p.id AS projectId, p.name AS projectName, a.alias,
              a.normalized_alias AS normalizedAlias
       FROM project_aliases a
       JOIN projects p ON p.id = a.project_id
       ORDER BY length(a.normalized_alias) DESC, a.rowid ASC`,
    ).all() as unknown as ProjectAliasCandidate[];
  }

  #projectAliases(projectId: string): string[] {
    const rows = this.#db.prepare(
      `SELECT alias FROM project_aliases
       WHERE project_id = ? ORDER BY created_at, rowid`,
    ).all(projectId) as Array<{ alias: string }>;
    return rows.map((row) => row.alias);
  }

  #projectCoverage(): { coverage: RetrievalCoverage; reasons: string[] } {
    const rows = this.#db.prepare(
      `SELECT s.status, COUNT(*) AS count
       FROM assistant_memos m
       JOIN memo_projection_statuses s
         ON s.memo_id = m.id AND s.memo_version = m.current_version
       WHERE s.status NOT IN ('projected', 'not_applicable')
       GROUP BY s.status ORDER BY s.status`,
    ).all() as Array<{ status: ProjectionStatus; count: number }>;
    if (rows.length === 0) return { coverage: "complete", reasons: [] };
    const labels: Record<ProjectionStatus, string> = {
      projected: "projected",
      not_applicable: "not applicable",
      unprojected: "미분류 메모",
      failed: "projection 실패",
      unresolved: "대상 미확정 메모",
    };
    return {
      coverage: "partial",
      reasons: rows.map((row) => `${labels[row.status]} ${row.count}건`),
    };
  }

  #snapshotItems(sql: string, projectId: string): ProjectBriefItem[] {
    const rows = this.#db.prepare(sql).all(projectId) as unknown as SnapshotRow[];
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      status: row.status,
      plannedOn: row.planned_on,
      dueOn: row.due_on,
      occurredAt: row.occurred_at,
      referenceIds: [memoReferenceId(row.source_memo_id, row.source_memo_version)],
    }));
  }

  #excludedProjectCandidates(projectId: string): Array<{
    sourceMemoId: string;
    sourceMemoVersion: number;
    domainTable: string;
    domainRowId: string;
    reader: "project_snapshot_reader";
    rank: null;
    included: false;
    exclusionReason: string;
  }> {
    const rows = this.#db.prepare(
      `SELECT id, source_memo_id, source_memo_version, domain_table, exclusion_reason
       FROM (
         SELECT id, source_memo_id, source_memo_version, 'action_snapshots' AS domain_table,
                CASE WHEN active = 0 THEN 'superseded_version' ELSE 'status_filter' END AS exclusion_reason
         FROM action_snapshots
         WHERE project_id = ? AND (active = 0 OR status != 'open')
         UNION ALL
         SELECT id, source_memo_id, source_memo_version, 'dependency_snapshots',
                CASE WHEN active = 0 THEN 'superseded_version' ELSE 'status_filter' END
         FROM dependency_snapshots
         WHERE project_id = ? AND (active = 0 OR status != 'open')
         UNION ALL
         SELECT id, source_memo_id, source_memo_version, 'risk_snapshots',
                CASE WHEN active = 0 THEN 'superseded_version' ELSE 'status_filter' END
         FROM risk_snapshots
         WHERE project_id = ? AND (active = 0 OR status != 'open')
         UNION ALL
         SELECT id, source_memo_id, source_memo_version, 'meeting_snapshots',
                CASE WHEN active = 0 THEN 'superseded_version' ELSE 'status_filter' END
         FROM meeting_snapshots
         WHERE project_id = ? AND (active = 0 OR status = 'cancelled')
         UNION ALL
         SELECT id, source_memo_id, source_memo_version, 'judgment_snapshots',
                CASE WHEN active = 0 THEN 'superseded_version' ELSE 'status_filter' END
         FROM judgment_snapshots
         WHERE project_id = ? AND (active = 0 OR status != 'open')
         UNION ALL
         SELECT id, source_memo_id, source_memo_version, 'project_snapshots',
                'superseded_version'
         FROM project_snapshots
         WHERE project_id = ? AND active = 0
         UNION ALL
         SELECT id, source_memo_id, source_memo_version, 'decision_snapshots',
                'superseded_version'
         FROM decision_snapshots
         WHERE project_id = ? AND active = 0
       )
       ORDER BY domain_table, id`,
    ).all(projectId, projectId, projectId, projectId, projectId, projectId, projectId) as Array<{
      id: string;
      source_memo_id: string;
      source_memo_version: number;
      domain_table: string;
      exclusion_reason: string;
    }>;
    return rows.map((row) => ({
      sourceMemoId: row.source_memo_id,
      sourceMemoVersion: row.source_memo_version,
      domainTable: row.domain_table,
      domainRowId: row.id,
      reader: "project_snapshot_reader",
      rank: null,
      included: false,
      exclusionReason: row.exclusion_reason,
    }));
  }

  #projectionIssueItems(query: string): ProjectBriefItem[] {
    return this.searchAssistantMemos(query, 5).flatMap((hit) => {
      const memo = this.getAssistantMemo(hit.memoId);
      if (!memo || !["unprojected", "failed", "unresolved"].includes(memo.projectionStatus)) {
        return [];
      }
      return [briefItem(
        `${hit.memoId}:v${hit.version}:projection`,
        memo.projectionDetail ?? `메모 projection 상태: ${memo.projectionStatus}`,
        [memoReferenceId(hit.memoId, hit.version)],
        memo.projectionStatus,
      )];
    });
  }

  #projectReferences(referenceIds: string[]): ProjectBrief["references"] {
    const references: ProjectBrief["references"] = [];
    for (const referenceId of [...new Set(referenceIds)]) {
      const parsed = parseMemoReferenceId(referenceId);
      if (!parsed) continue;
      const row = this.#db.prepare(
        `SELECT v.memo_id, v.version, v.raw_text, v.draft_json, v.created_at
         FROM assistant_memo_versions v
         WHERE v.memo_id = ? AND v.version = ?`,
      ).get(parsed.memoId, parsed.version) as {
        memo_id: string;
        version: number;
        raw_text: string;
        draft_json: string;
        created_at: string;
      } | undefined;
      if (!row) continue;
      references.push({
        referenceId,
        memoId: row.memo_id,
        version: row.version,
        summary: parseStoredDraft(row.draft_json).summary,
        rawExcerpt: boundedExcerpt(row.raw_text, 2_000),
        createdAt: row.created_at,
      });
    }
    return references;
  }

  #projectMemoVersion(
    memoId: string,
    version: number,
    projections: ProjectProjectionDraft[],
    timestamp: string,
  ): void {
    if (projections.length === 0) {
      this.#recordProjectionStatus(memoId, version, "not_applicable", null, timestamp);
      return;
    }
    let status: ProjectionStatus = "projected";
    const details: string[] = [];
    for (const projection of projections) {
      this.#db.exec("SAVEPOINT apply_project_projection");
      try {
        const unresolved = this.#applyProjectProjection(memoId, version, projection, timestamp);
        if (unresolved) {
          status = "unresolved";
          details.push(unresolved);
        }
        this.#db.exec("RELEASE SAVEPOINT apply_project_projection");
      } catch {
        this.#db.exec("ROLLBACK TO SAVEPOINT apply_project_projection");
        this.#db.exec("RELEASE SAVEPOINT apply_project_projection");
        status = "failed";
        details.push(`${projection.projectName} projection을 적용하지 못했습니다.`);
      }
    }
    this.#recordProjectionStatus(
      memoId,
      version,
      status,
      details.length ? details.join(" ") : null,
      timestamp,
    );
  }

  #applyProjectProjection(
    memoId: string,
    version: number,
    projection: ProjectProjectionDraft,
    timestamp: string,
  ): string | null {
    const aliasPairs = [...new Map(
      [projection.projectName, ...projection.aliases]
        .map((alias) => [normalizeProjectAlias(alias), alias.trim()] as const)
        .filter(([normalized]) => normalized),
    ).entries()];
    const placeholders = aliasPairs.map(() => "?").join(", ");
    const matches = aliasPairs.length
      ? this.#db.prepare(
        `SELECT DISTINCT p.id, p.name
         FROM project_aliases a
         JOIN projects p ON p.id = a.project_id
         WHERE a.normalized_alias IN (${placeholders})`,
      ).all(...aliasPairs.map(([normalized]) => normalized)) as unknown as ProjectRow[]
      : [];
    const projectIds = [...new Set(matches.map((row) => row.id))];
    if (projectIds.length > 1) {
      return `${projection.projectName}의 이름·별칭이 여러 프로젝트와 충돌합니다.`;
    }

    const normalizedName = normalizeProjectAlias(projection.projectName);
    const nameMatches = matches.filter((row) => this.#db.prepare(
      `SELECT 1 FROM project_aliases
       WHERE project_id = ? AND normalized_alias = ? LIMIT 1`,
    ).get(row.id, normalizedName));
    if (nameMatches.length === 0 && projectIds.length > 0) {
      return `${projection.projectName}의 별칭이 기존 프로젝트와 충돌합니다.`;
    }

    const projectId = nameMatches[0]?.id ?? randomUUID();
    if (nameMatches.length === 0) {
      this.#db.prepare(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      ).run(projectId, projection.projectName, timestamp, timestamp);
    }
    for (const [normalized, alias] of aliasPairs) {
      this.#db.prepare(
        `INSERT OR IGNORE INTO project_aliases
          (project_id, alias, normalized_alias, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(projectId, alias, normalized, timestamp);
    }

    this.#db.prepare(
      `INSERT INTO project_snapshots
        (id, project_id, outcome, current_state, source_memo_id, source_memo_version,
         active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(
      randomUUID(),
      projectId,
      projection.outcome,
      projection.currentState,
      memoId,
      version,
      timestamp,
    );
    for (const action of projection.actions) {
      this.#db.prepare(
        `INSERT INTO action_snapshots
          (id, project_id, title, status, planned_on, due_on, source_memo_id,
           source_memo_version, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(
        randomUUID(),
        projectId,
        action.title,
        action.status,
        action.plannedOn,
        action.dueOn,
        memoId,
        version,
        timestamp,
      );
    }
    for (const decision of projection.decisions) {
      this.#db.prepare(
        `INSERT INTO decision_snapshots
          (id, project_id, text, decided_on, source_memo_id, source_memo_version,
           active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(randomUUID(), projectId, decision.text, decision.decidedOn, memoId, version, timestamp);
    }
    for (const dependency of projection.dependencies) {
      this.#db.prepare(
        `INSERT INTO dependency_snapshots
          (id, project_id, text, status, source_memo_id, source_memo_version, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(randomUUID(), projectId, dependency.text, dependency.status, memoId, version, timestamp);
    }
    for (const risk of projection.risks) {
      this.#db.prepare(
        `INSERT INTO risk_snapshots
          (id, project_id, text, status, source_memo_id, source_memo_version, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(randomUUID(), projectId, risk.text, risk.status, memoId, version, timestamp);
    }
    for (const meeting of projection.meetings) {
      this.#db.prepare(
        `INSERT INTO meeting_snapshots
          (id, project_id, title, scheduled_at, status, source_memo_id,
           source_memo_version, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(
        randomUUID(),
        projectId,
        meeting.title,
        meeting.scheduledAt,
        meeting.status,
        memoId,
        version,
        timestamp,
      );
    }
    for (const judgment of projection.judgments) {
      this.#db.prepare(
        `INSERT INTO judgment_snapshots
          (id, project_id, question, status, source_memo_id, source_memo_version,
           active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(randomUUID(), projectId, judgment.question, judgment.status, memoId, version, timestamp);
    }
    this.#db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, projectId);
    return null;
  }

  #recordProjectionStatus(
    memoId: string,
    version: number,
    status: ProjectionStatus,
    detail: string | null,
    timestamp: string,
  ): void {
    this.#db.prepare(
      `INSERT INTO memo_projection_statuses
        (memo_id, memo_version, status, detail, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(memo_id, memo_version) DO UPDATE SET
         status = excluded.status, detail = excluded.detail, updated_at = excluded.updated_at`,
    ).run(memoId, version, status, detail, timestamp);
  }

  #deactivateMemoSnapshots(memoId: string): void {
    for (const table of [
      "project_snapshots",
      "action_snapshots",
      "decision_snapshots",
      "dependency_snapshots",
      "risk_snapshots",
      "meeting_snapshots",
      "judgment_snapshots",
    ]) {
      this.#db.prepare(`UPDATE ${table} SET active = 0 WHERE source_memo_id = ?`).run(memoId);
    }
  }

  #getIntakeProposalRow(id: string): IntakeProposalRow | null {
    const row = this.#db.prepare(
      `SELECT id, conversation_id, source_message_id, operation, target_memo_id,
              status, draft_json, projection_json, raw_text, created_at, resolved_at
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
         status, draft_json, projection_json, raw_text, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL)`,
    ).run(
      id,
      job.conversationId,
      job.userMessageId,
      proposal.operation,
      proposal.targetMemoId,
      JSON.stringify(proposal.memo),
      JSON.stringify(proposal.projectProjections),
      source.content,
      timestamp,
    );
    return id;
  }

  #confirmProposal(proposal: IntakeProposalRow, timestamp: string): string {
    const draft = parseStoredDraft(proposal.draft_json);
    const projections = parseStoredProjectProjections(proposal.projection_json);
    if (proposal.operation === "create") {
      const memoId = randomUUID();
      this.#db.prepare(
        "INSERT INTO assistant_memos (id, current_version, created_at, updated_at) VALUES (?, 1, ?, ?)",
      ).run(memoId, timestamp, timestamp);
      this.#db.prepare(
        `INSERT INTO assistant_memo_versions
          (memo_id, version, raw_text, draft_json, projection_json, created_at)
         VALUES (?, 1, ?, ?, ?, ?)`,
      ).run(
        memoId,
        proposal.raw_text,
        JSON.stringify(draft),
        projections === null ? null : JSON.stringify(projections),
        timestamp,
      );
      this.#replaceMemoSearchEntry(memoId, 1, proposal.raw_text, draft);
      if (projections === null) {
        this.#recordProjectionStatus(memoId, 1, "unprojected", "이전 형식의 메모 제안입니다.", timestamp);
      } else {
        this.#projectMemoVersion(memoId, 1, projections, timestamp);
      }
      return memoId;
    }

    if (!proposal.target_memo_id) throw new Error("revision proposal has no target memo");
    const current = this.getAssistantMemo(proposal.target_memo_id);
    if (!current) throw new Error("revision target memo is unavailable");
    const nextVersion = current.currentVersion + 1;
    this.#deactivateMemoSnapshots(current.id);
    this.#db.prepare(
      `INSERT INTO assistant_memo_versions
        (memo_id, version, raw_text, draft_json, projection_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      current.id,
      nextVersion,
      proposal.raw_text,
      JSON.stringify(draft),
      projections === null ? null : JSON.stringify(projections),
      timestamp,
    );
    this.#db.prepare(
      "UPDATE assistant_memos SET current_version = ?, updated_at = ? WHERE id = ?",
    ).run(nextVersion, timestamp, current.id);
    this.#replaceMemoSearchEntry(current.id, nextVersion, proposal.raw_text, draft);
    if (projections === null) {
      this.#recordProjectionStatus(current.id, nextVersion, "unprojected", "이전 형식의 메모 제안입니다.", timestamp);
    } else {
      this.#projectMemoVersion(current.id, nextVersion, projections, timestamp);
    }
    return current.id;
  }

  #replaceMemoSearchEntry(
    memoId: string,
    version: number,
    rawText: string,
    draft: AssistantMemoDraft,
  ): void {
    this.#db.prepare("DELETE FROM assistant_memo_search WHERE memo_id = ?").run(memoId);
    this.#db.prepare(
      `INSERT INTO assistant_memo_search (memo_id, version, searchable_text)
       VALUES (?, ?, ?)`,
    ).run(memoId, version, buildMemoSearchText(rawText, draft));
  }

  #rebuildMemoSearchIndex(): void {
    this.#db.exec("DELETE FROM assistant_memo_search");
    const rows = this.#db.prepare(
      `SELECT m.id, m.current_version, v.draft_json, v.projection_json, v.raw_text,
              s.status AS projection_status, s.detail AS projection_detail,
              m.created_at, m.updated_at
       FROM assistant_memos m
       JOIN assistant_memo_versions v
         ON v.memo_id = m.id AND v.version = m.current_version
       JOIN memo_projection_statuses s
         ON s.memo_id = v.memo_id AND s.memo_version = v.version
       ORDER BY m.updated_at DESC, m.rowid DESC`,
    ).all() as unknown as AssistantMemoRow[];
    for (const row of rows) {
      const memo = mapAssistantMemo(row);
      this.#replaceMemoSearchEntry(
        memo.id,
        memo.currentVersion,
        memo.rawText,
        memo.memo,
      );
    }
  }

  #aiHistoryCounts(): AiHistoryClearResult {
    return {
      conversations: this.#rowCount("ai_conversations"),
      messages: this.#rowCount("ai_messages"),
      messageSources: this.#rowCount("ai_message_sources"),
      jobs: this.#rowCount("ai_jobs"),
      retrievalRuns: this.#rowCount("retrieval_runs"),
      retrievalCandidates: this.#rowCount("retrieval_candidates"),
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
    | "memo_projection_statuses"
    | "projects"
    | "project_aliases"
    | "project_snapshots"
    | "action_snapshots"
    | "decision_snapshots"
    | "dependency_snapshots"
    | "risk_snapshots"
    | "meeting_snapshots"
    | "judgment_snapshots"
    | "retrieval_runs"
    | "retrieval_candidates"
    | "ai_conversations"
    | "ai_messages"
    | "ai_message_sources"
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
    const current = this.#db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (current.user_version > 2) {
      throw new Error(`database schema version ${current.user_version} is newer than supported version 2`);
    }
    if (current.user_version < 1) {
      this.#db.exec("BEGIN IMMEDIATE");
      try {
        this.#migrateV1();
        this.#db.exec("PRAGMA user_version = 1");
        this.#db.exec("COMMIT");
      } catch (error) {
        this.#db.exec("ROLLBACK");
        throw error;
      }
    }
    const afterV1 = this.#db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (afterV1.user_version < 2) {
      this.#db.exec("BEGIN IMMEDIATE");
      try {
        this.#migrateV2();
        this.#db.exec("PRAGMA user_version = 2");
        this.#db.exec("COMMIT");
      } catch (error) {
        this.#db.exec("ROLLBACK");
        throw error;
      }
    }
    this.#ensureDefaultAssistantProfile();
    this.#rebuildMemoSearchIndex();
  }

  #migrateV1(): void {
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
        grounding_status TEXT CHECK (
          grounding_status IS NULL
          OR grounding_status IN ('not_applicable', 'grounded', 'insufficient', 'conflicting')
        ),
        grounding_conflicts_json TEXT,
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

      CREATE TABLE IF NOT EXISTS ai_message_sources (
        assistant_message_id TEXT NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
        memo_id TEXT NOT NULL,
        memo_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (assistant_message_id, memo_id, memo_version),
        FOREIGN KEY (memo_id, memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS assistant_memo_search USING fts5(
        memo_id UNINDEXED,
        version UNINDEXED,
        searchable_text,
        tokenize = 'unicode61'
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
    const messageColumns = this.#db.prepare("PRAGMA table_info(ai_messages)").all() as Array<{
      name: string;
    }>;
    if (!messageColumns.some((column) => column.name === "grounding_status")) {
      this.#db.exec("ALTER TABLE ai_messages ADD COLUMN grounding_status TEXT");
    }
    if (!messageColumns.some((column) => column.name === "grounding_conflicts_json")) {
      this.#db.exec("ALTER TABLE ai_messages ADD COLUMN grounding_conflicts_json TEXT");
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
  }

  #migrateV2(): void {
    const profileTimezone = systemTimezone();
    const profileColumns = this.#db.prepare("PRAGMA table_info(assistant_profiles)").all() as Array<{
      name: string;
    }>;
    if (!profileColumns.some((column) => column.name === "timezone")) {
      this.#db.exec("ALTER TABLE assistant_profiles ADD COLUMN timezone TEXT");
    }
    const profileVersionColumns = this.#db.prepare(
      "PRAGMA table_info(assistant_profile_versions)",
    ).all() as Array<{ name: string }>;
    if (!profileVersionColumns.some((column) => column.name === "timezone")) {
      this.#db.exec("ALTER TABLE assistant_profile_versions ADD COLUMN timezone TEXT");
    }
    this.#db.prepare("UPDATE assistant_profiles SET timezone = ? WHERE timezone IS NULL").run(profileTimezone);
    this.#db.prepare(
      "UPDATE assistant_profile_versions SET timezone = ? WHERE timezone IS NULL",
    ).run(profileTimezone);

    const proposalColumns = this.#db.prepare("PRAGMA table_info(intake_proposals)").all() as Array<{
      name: string;
    }>;
    if (!proposalColumns.some((column) => column.name === "projection_json")) {
      this.#db.exec("ALTER TABLE intake_proposals ADD COLUMN projection_json TEXT");
    }
    const memoVersionColumns = this.#db.prepare(
      "PRAGMA table_info(assistant_memo_versions)",
    ).all() as Array<{ name: string }>;
    if (!memoVersionColumns.some((column) => column.name === "projection_json")) {
      this.#db.exec("ALTER TABLE assistant_memo_versions ADD COLUMN projection_json TEXT");
    }
    const messageColumns = this.#db.prepare("PRAGMA table_info(ai_messages)").all() as Array<{
      name: string;
    }>;
    if (!messageColumns.some((column) => column.name === "retrieval_run_id")) {
      this.#db.exec("ALTER TABLE ai_messages ADD COLUMN retrieval_run_id TEXT");
    }
    if (!messageColumns.some((column) => column.name === "coverage")) {
      this.#db.exec("ALTER TABLE ai_messages ADD COLUMN coverage TEXT");
    }
    if (!messageColumns.some((column) => column.name === "project_brief_json")) {
      this.#db.exec("ALTER TABLE ai_messages ADD COLUMN project_brief_json TEXT");
    }

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS memo_projection_statuses (
        memo_id TEXT NOT NULL,
        memo_version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN ('projected', 'not_applicable', 'unprojected', 'failed', 'unresolved')
        ),
        detail TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (memo_id, memo_version),
        FOREIGN KEY (memo_id, memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_aliases (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, normalized_alias)
      );

      CREATE INDEX IF NOT EXISTS idx_project_aliases_normalized
        ON project_aliases (normalized_alias);

      CREATE TABLE IF NOT EXISTS project_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        outcome TEXT,
        current_state TEXT,
        source_memo_id TEXT NOT NULL,
        source_memo_version INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_memo_id, source_memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS action_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'cancelled')),
        planned_on TEXT,
        due_on TEXT,
        source_memo_id TEXT NOT NULL,
        source_memo_version INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_memo_id, source_memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS decision_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        decided_on TEXT,
        source_memo_id TEXT NOT NULL,
        source_memo_version INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_memo_id, source_memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dependency_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
        source_memo_id TEXT NOT NULL,
        source_memo_version INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_memo_id, source_memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS risk_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'mitigated')),
        source_memo_id TEXT NOT NULL,
        source_memo_version INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_memo_id, source_memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS meeting_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        scheduled_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('planned', 'held', 'cancelled')),
        source_memo_id TEXT NOT NULL,
        source_memo_version INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_memo_id, source_memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS judgment_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
        source_memo_id TEXT NOT NULL,
        source_memo_version INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_memo_id, source_memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_project_snapshots_current
        ON project_snapshots (project_id, active, created_at);
      CREATE INDEX IF NOT EXISTS idx_action_snapshots_current
        ON action_snapshots (project_id, active, status, due_on, planned_on);
      CREATE INDEX IF NOT EXISTS idx_decision_snapshots_current
        ON decision_snapshots (project_id, active, decided_on);
      CREATE INDEX IF NOT EXISTS idx_dependency_snapshots_current
        ON dependency_snapshots (project_id, active, status);
      CREATE INDEX IF NOT EXISTS idx_risk_snapshots_current
        ON risk_snapshots (project_id, active, status);
      CREATE INDEX IF NOT EXISTS idx_meeting_snapshots_current
        ON meeting_snapshots (project_id, active, scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_judgment_snapshots_current
        ON judgment_snapshots (project_id, active, status);

      CREATE TABLE IF NOT EXISTS retrieval_runs (
        id TEXT PRIMARY KEY,
        assistant_message_id TEXT UNIQUE REFERENCES ai_messages(id) ON DELETE CASCADE,
        query TEXT NOT NULL,
        as_of TEXT NOT NULL,
        timezone TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        reader TEXT NOT NULL,
        coverage TEXT NOT NULL CHECK (coverage IN ('unknown', 'partial', 'complete')),
        unresolved_json TEXT NOT NULL,
        truncation_reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS retrieval_candidates (
        id TEXT PRIMARY KEY,
        retrieval_run_id TEXT NOT NULL REFERENCES retrieval_runs(id) ON DELETE CASCADE,
        source_memo_id TEXT NOT NULL,
        source_memo_version INTEGER NOT NULL,
        domain_table TEXT NOT NULL,
        domain_row_id TEXT NOT NULL,
        reader TEXT NOT NULL,
        rank REAL,
        included INTEGER NOT NULL CHECK (included IN (0, 1)),
        exclusion_reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_memo_id, source_memo_version)
          REFERENCES assistant_memo_versions(memo_id, version) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_retrieval_candidates_run
        ON retrieval_candidates (retrieval_run_id, included, created_at);
    `);
    const timestamp = new Date().toISOString();
    this.#db.prepare(
      `INSERT OR IGNORE INTO memo_projection_statuses
        (memo_id, memo_version, status, detail, updated_at)
       SELECT memo_id, version, 'unprojected', ?, ?
       FROM assistant_memo_versions`,
    ).run("기존 메모는 자동 재분석하지 않았습니다.", timestamp);
  }

  #ensureDefaultAssistantProfile(): void {
    const timestamp = new Date().toISOString();
    const inserted = this.#db.prepare(
      `INSERT OR IGNORE INTO assistant_profiles
        (id, version, name, owner_address, role_description, communication_style,
         working_principles, timezone, created_at, updated_at)
       VALUES ('chief-assistant', 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      DEFAULT_ASSISTANT_PROFILE.name,
      DEFAULT_ASSISTANT_PROFILE.ownerAddress,
      DEFAULT_ASSISTANT_PROFILE.roleDescription,
      DEFAULT_ASSISTANT_PROFILE.communicationStyle,
      DEFAULT_ASSISTANT_PROFILE.workingPrinciples,
      DEFAULT_ASSISTANT_PROFILE.timezone ?? systemTimezone(),
      timestamp,
      timestamp,
    );
    if (inserted.changes === 0) return;
    this.#db.prepare(
      `INSERT INTO assistant_profile_versions
        (profile_id, version, name, owner_address, role_description,
         communication_style, working_principles, timezone, created_at)
       VALUES ('chief-assistant', 1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      DEFAULT_ASSISTANT_PROFILE.name,
      DEFAULT_ASSISTANT_PROFILE.ownerAddress,
      DEFAULT_ASSISTANT_PROFILE.roleDescription,
      DEFAULT_ASSISTANT_PROFILE.communicationStyle,
      DEFAULT_ASSISTANT_PROFILE.workingPrinciples,
      DEFAULT_ASSISTANT_PROFILE.timezone ?? systemTimezone(),
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
    timezone: row.timezone,
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
    groundingStatus: row.grounding_status,
    groundingConflicts: parseStoredStringArray(row.grounding_conflicts_json),
    sources: [],
    retrievalRunId: row.retrieval_run_id,
    coverage: row.coverage,
    projectBrief: parseStoredProjectBrief(row.project_brief_json),
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
    projectProjections: parseStoredProjectProjections(row.projection_json) ?? [],
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
    projectProjections: parseStoredProjectProjections(row.projection_json),
    projectionStatus: row.projection_status,
    projectionDetail: row.projection_detail,
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
    projectProjections: parseStoredProjectProjections(row.projection_json),
    projectionStatus: row.projection_status,
    projectionDetail: row.projection_detail,
    rawText: row.raw_text,
    createdAt: row.created_at,
  };
}

function parseStoredDraft(value: string): AssistantMemoDraft {
  return JSON.parse(value) as AssistantMemoDraft;
}

function parseStoredProjectProjections(value: string | null): ProjectProjectionDraft[] | null {
  return value === null ? null : JSON.parse(value) as ProjectProjectionDraft[];
}

function parseStoredProjectBrief(value: string | null): ProjectBrief | null {
  return value === null ? null : JSON.parse(value) as ProjectBrief;
}

function parseStoredStringArray(value: string | null): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
    ? parsed
    : [];
}

function briefItem(
  id: string,
  text: string,
  referenceIds: string[],
  status: string | null = null,
): ProjectBriefItem {
  return {
    id,
    text,
    status,
    plannedOn: null,
    dueOn: null,
    occurredAt: null,
    referenceIds,
  };
}

function memoReferenceId(memoId: string, version: number): string {
  return `memo:${memoId}:v${version}`;
}

function parseMemoReferenceId(value: string): { memoId: string; version: number } | null {
  const match = /^memo:([0-9a-f-]+):v([1-9][0-9]*)$/iu.exec(value);
  return match
    ? { memoId: match[1]!, version: Number.parseInt(match[2]!, 10) }
    : null;
}

function localDateInTimezone(asOf: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(asOf));
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function boundProjectBrief(
  brief: ProjectBrief,
  maxCharacters: number,
): {
  brief: ProjectBrief;
  omittedItemIds: Set<string>;
  truncationReason: string | null;
} {
  if (JSON.stringify(brief).length <= maxCharacters) {
    return { brief, omittedItemIds: new Set(), truncationReason: null };
  }
  const bounded = JSON.parse(JSON.stringify(brief)) as ProjectBrief;
  const omittedItemIds = new Set<string>();
  const sectionOrder: Array<keyof ProjectBrief["sections"]> = [
    "meetings",
    "decisions",
    "dependencies",
    "risks",
    "openActions",
    "judgments",
    "currentState",
    "outcomes",
    "conflictsAndUnknowns",
  ];
  while (JSON.stringify(bounded).length > maxCharacters) {
    const section = sectionOrder.find((key) => bounded.sections[key].length > 0);
    if (!section) break;
    const removed = bounded.sections[section].pop();
    if (removed) omittedItemIds.add(removed.id);
  }
  const retainedReferenceIds = new Set(
    Object.values(bounded.sections).flatMap((items) => items.flatMap((item) => item.referenceIds)),
  );
  bounded.references = bounded.references.filter((reference) =>
    retainedReferenceIds.has(reference.referenceId));
  const truncationReason = `컨텍스트 예산으로 ${omittedItemIds.size}개 항목을 제외했습니다.`;
  return { brief: bounded, omittedItemIds, truncationReason };
}

function sectionToDomainTable(section: string): string {
  return ({
    outcomes: "project_snapshots",
    currentState: "project_snapshots",
    openActions: "action_snapshots",
    decisions: "decision_snapshots",
    dependencies: "dependency_snapshots",
    risks: "risk_snapshots",
    meetings: "meeting_snapshots",
    judgments: "judgment_snapshots",
    conflictsAndUnknowns: "memo_projection_statuses",
  } as Record<string, string>)[section] ?? "unknown";
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
    groundingStatus: null,
    groundingConflicts: [],
    sources: [],
    retrievalRunId: null,
    coverage: null,
    projectBrief: null,
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

const SEARCH_STOP_WORDS = new Set([
  "관련",
  "그것",
  "뭐",
  "무엇",
  "어떻게",
  "알려줘",
  "알려주세요",
  "보여줘",
  "보여주세요",
  "정리해줘",
  "정리해주세요",
  "저장된",
  "메모",
  "정보",
  "현재",
  "지금",
  "있어",
  "있나요",
  "됐지",
  "되었지",
  "please",
  "show",
  "tell",
  "what",
]);

const KOREAN_PARTICLE_SUFFIXES = [
  "에게서",
  "으로부터",
  "에서는",
  "으로",
  "에서",
  "에게",
  "까지",
  "부터",
  "처럼",
  "보다",
  "이나",
  "라도",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "와",
  "과",
  "도",
  "로",
];

function buildMemoFtsQuery(query: string): string {
  return extractSearchTerms(query)
    .slice(0, 12)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" OR ");
}

function buildMemoSearchText(rawText: string, draft: AssistantMemoDraft): string {
  const source = [
    rawText,
    draft.summary,
    ...draft.facets.map((facet) => `${facet.kind} ${facet.text}`),
    ...draft.subjects,
    ...draft.timeReferences.flatMap((reference) => [
      reference.original,
      reference.interpreted ?? "",
      reference.certainty,
    ]),
    ...draft.uncertainties,
  ].join("\n");
  return `${source}\n${extractSearchTerms(source, 200).join(" ")}`;
}

function extractSearchTerms(value: string, max = 40): string[] {
  const terms = new Set<string>();
  const tokens = value.normalize("NFKC").toLocaleLowerCase("ko-KR").match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const token of tokens) {
    if (token.length < 2 || SEARCH_STOP_WORDS.has(token)) continue;
    terms.add(token);
    const stemmed = stripKoreanParticle(token);
    if (stemmed !== token && stemmed.length >= 2 && !SEARCH_STOP_WORDS.has(stemmed)) {
      terms.add(stemmed);
    }
    if (terms.size >= max) break;
  }
  return [...terms];
}

function stripKoreanParticle(token: string): string {
  for (const suffix of KOREAN_PARTICLE_SUFFIXES) {
    if (token.endsWith(suffix) && token.length >= suffix.length + 2) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function boundedExcerpt(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
}

function titleFromMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length <= 60 ? normalized : `${normalized.slice(0, 57)}...`;
}
