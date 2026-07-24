import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  DEFAULT_ASSISTANT_PROFILE,
  systemTimezone,
  type AssistantProfile,
  type AssistantProfileDraft,
} from "../domain/assistant-profile.js";
import { initialModelFor } from "../domain/ai-models.js";
import type {
  AiProviderId,
  WorkspaceConfiguration,
  WorkspaceTurnPlan,
  WorkspaceValidation,
} from "../domain/workspace.js";

export type AiJobStatus =
  | "queued"
  | "planning"
  | "approval_required"
  | "executing"
  | "needs_review"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export type AiMessageStatus = "pending" | "completed" | "failed" | "cancelled";

export interface AiConversation {
  id: string;
  provider: AiProviderId;
  title: string;
  defaultModel: string;
  defaultReasoningEffort: string;
  providerSegment: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  jobId: string | null;
  role: "user" | "assistant";
  content: string;
  status: AiMessageStatus;
  provider: AiProviderId;
  model: string;
  reasoningEffort: string;
  plan: WorkspaceTurnPlan | null;
  receiptId: string | null;
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
  plan: WorkspaceTurnPlan | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ActivityEvent {
  id: string;
  jobId: string;
  kind: "planning" | "reading" | "approval" | "editing" | "validation" | "git" | "warning";
  summary: string;
  createdAt: string;
}

export interface WorkspaceReceipt {
  id: string;
  jobId: string | null;
  provider: AiProviderId;
  requestSummary: string;
  plan: WorkspaceTurnPlan;
  beforeCommit: string;
  afterCommit: string;
  changedPaths: string[];
  semanticSummary: string;
  undoOfReceiptId: string | null;
  undoneByReceiptId: string | null;
  createdAt: string;
}

export interface WorkspaceConfigProposal {
  id: string;
  rootPath: string;
  codexGranted: boolean;
  grokGranted: boolean;
  validation: WorkspaceValidation;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
}

export class OpsStore {
  readonly #db: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.#db = new DatabaseSync(databasePath);
    this.#db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.#migrate();
    this.#ensureDefaultProfile();
  }

  close(): void {
    this.#db.close();
  }

  getAssistantProfile(): AssistantProfile {
    const row = this.#db.prepare(
      `SELECT id, version, name, owner_address, role_description, communication_style,
              working_principles, timezone, created_at, updated_at
       FROM assistant_profiles WHERE id = 'chief-assistant'`,
    ).get() as ProfileRow | undefined;
    if (!row) throw new Error("Assistant profile is unavailable");
    return mapProfile(row);
  }

  updateAssistantProfile(input: AssistantProfileDraft): AssistantProfile {
    const current = this.getAssistantProfile();
    const timestamp = now();
    const next: AssistantProfile = {
      id: "chief-assistant",
      version: current.version + 1,
      name: input.name,
      ownerAddress: input.ownerAddress,
      roleDescription: input.roleDescription,
      communicationStyle: input.communicationStyle,
      workingPrinciples: input.workingPrinciples,
      timezone: input.timezone ?? current.timezone,
      createdAt: current.createdAt,
      updatedAt: timestamp,
    };
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(
        `UPDATE assistant_profiles
         SET version = ?, name = ?, owner_address = ?, role_description = ?,
             communication_style = ?, working_principles = ?, timezone = ?, updated_at = ?
         WHERE id = 'chief-assistant'`,
      ).run(
        next.version,
        next.name,
        next.ownerAddress,
        next.roleDescription,
        next.communicationStyle,
        next.workingPrinciples,
        next.timezone,
        timestamp,
      );
      this.#db.prepare(
        `INSERT INTO assistant_profile_versions
          (profile_id, version, name, owner_address, role_description, communication_style,
           working_principles, timezone, created_at)
         VALUES ('chief-assistant', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        next.version,
        next.name,
        next.ownerAddress,
        next.roleDescription,
        next.communicationStyle,
        next.workingPrinciples,
        next.timezone,
        timestamp,
      );
      this.#db.exec("COMMIT");
      return next;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  getWorkspaceConfiguration(): WorkspaceConfiguration | null {
    const row = this.#db.prepare(
      `SELECT root_path, codex_granted, grok_granted, version, created_at, updated_at
       FROM workspace_configuration WHERE id = 'workos'`,
    ).get() as WorkspaceConfigurationRow | undefined;
    return row ? mapWorkspaceConfiguration(row) : null;
  }

  createWorkspaceConfigProposal(input: {
    rootPath: string;
    codexGranted: boolean;
    grokGranted: boolean;
    validation: WorkspaceValidation;
  }): WorkspaceConfigProposal {
    const proposal: WorkspaceConfigProposal = {
      id: randomUUID(),
      ...input,
      status: "pending",
      createdAt: now(),
      resolvedAt: null,
    };
    this.#db.prepare(
      `INSERT INTO workspace_config_proposals
        (id, root_path, codex_granted, grok_granted, validation_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(
      proposal.id,
      proposal.rootPath,
      Number(proposal.codexGranted),
      Number(proposal.grokGranted),
      JSON.stringify(proposal.validation),
      proposal.createdAt,
    );
    return proposal;
  }

  getWorkspaceConfigProposal(id: string): WorkspaceConfigProposal | null {
    const row = this.#db.prepare(
      `SELECT id, root_path, codex_granted, grok_granted, validation_json,
              status, created_at, resolved_at
       FROM workspace_config_proposals WHERE id = ?`,
    ).get(id) as WorkspaceConfigProposalRow | undefined;
    return row ? mapWorkspaceConfigProposal(row) : null;
  }

  confirmWorkspaceConfigProposal(id: string): WorkspaceConfiguration {
    const proposal = this.getWorkspaceConfigProposal(id);
    if (!proposal || proposal.status !== "pending") throw new Error("Workspace proposal is not pending");
    if (!proposal.validation.valid) throw new Error("Workspace proposal is invalid");
    const current = this.getWorkspaceConfiguration();
    const timestamp = now();
    const configuration: WorkspaceConfiguration = {
      rootPath: proposal.rootPath,
      codexGranted: proposal.codexGranted,
      grokGranted: proposal.grokGranted,
      version: (current?.version ?? 0) + 1,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(
        `INSERT INTO workspace_configuration
          (id, root_path, codex_granted, grok_granted, version, created_at, updated_at)
         VALUES ('workos', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           root_path = excluded.root_path,
           codex_granted = excluded.codex_granted,
           grok_granted = excluded.grok_granted,
           version = excluded.version,
           updated_at = excluded.updated_at`,
      ).run(
        configuration.rootPath,
        Number(configuration.codexGranted),
        Number(configuration.grokGranted),
        configuration.version,
        configuration.createdAt,
        configuration.updatedAt,
      );
      this.#db.prepare(
        `UPDATE workspace_config_proposals
         SET status = 'confirmed', resolved_at = ? WHERE id = ? AND status = 'pending'`,
      ).run(timestamp, id);
      this.#db.exec("COMMIT");
      return configuration;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  hasActiveAiJobs(): boolean {
    return Boolean(this.#db.prepare(
      `SELECT 1 FROM ai_jobs
       WHERE status IN ('queued', 'planning', 'approval_required', 'executing')
       LIMIT 1`,
    ).get());
  }

  createAiConversation(input: {
    provider: AiProviderId;
    model: string;
    reasoningEffort: string;
  }): AiConversation {
    const existing = this.listAiConversations()[0];
    if (existing) return existing;
    const timestamp = now();
    const conversation: AiConversation = {
      id: randomUUID(),
      provider: input.provider,
      title: "WorkOS 대화",
      defaultModel: input.model,
      defaultReasoningEffort: input.reasoningEffort,
      providerSegment: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#db.prepare(
      `INSERT INTO ai_conversations
        (id, provider, title, default_model, default_reasoning_effort,
         provider_segment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      conversation.id,
      conversation.provider,
      conversation.title,
      conversation.defaultModel,
      conversation.defaultReasoningEffort,
      conversation.providerSegment,
      timestamp,
      timestamp,
    );
    return conversation;
  }

  listAiConversations(): AiConversation[] {
    const rows = this.#db.prepare(
      `SELECT id, provider, title, default_model, default_reasoning_effort,
              provider_segment, created_at, updated_at
       FROM ai_conversations ORDER BY created_at`,
    ).all() as unknown as AiConversationRow[];
    return rows.map(mapConversation);
  }

  getAiConversation(id: string): AiConversation | null {
    const row = this.#db.prepare(
      `SELECT id, provider, title, default_model, default_reasoning_effort,
              provider_segment, created_at, updated_at
       FROM ai_conversations WHERE id = ?`,
    ).get(id) as AiConversationRow | undefined;
    return row ? mapConversation(row) : null;
  }

  switchConversationProvider(
    id: string,
    input: { provider: AiProviderId; model: string; reasoningEffort: string },
  ): AiConversation {
    const current = this.getAiConversation(id);
    if (!current) throw new Error("AI conversation not found");
    if (this.hasActiveAiJobs()) throw new Error("AI conversation has an active request");
    const timestamp = now();
    const segment = current.provider === input.provider
      ? current.providerSegment
      : current.providerSegment + 1;
    this.#db.prepare(
      `UPDATE ai_conversations
       SET provider = ?, default_model = ?, default_reasoning_effort = ?,
           provider_segment = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.provider, input.model, input.reasoningEffort, segment, timestamp, id);
    return this.getAiConversation(id)!;
  }

  listAiMessages(conversationId: string): AiMessage[] {
    const rows = this.#db.prepare(
      `SELECT id, conversation_id, job_id, role, content, status, provider, model,
              reasoning_effort, plan_json, receipt_id, created_at, updated_at
       FROM ai_messages WHERE conversation_id = ? ORDER BY created_at, rowid`,
    ).all(conversationId) as unknown as AiMessageRow[];
    return rows.map(mapMessage);
  }

  getAiMessage(id: string): AiMessage | null {
    const row = this.#db.prepare(
      `SELECT id, conversation_id, job_id, role, content, status, provider, model,
              reasoning_effort, plan_json, receipt_id, created_at, updated_at
       FROM ai_messages WHERE id = ?`,
    ).get(id) as AiMessageRow | undefined;
    return row ? mapMessage(row) : null;
  }

  createAiTurn(input: {
    conversationId: string;
    clientRequestId: string;
    message: string;
    model: string;
    reasoningEffort: string;
  }): { job: AiJob; userMessage: AiMessage; assistantMessage: AiMessage; duplicate: boolean } {
    const duplicate = this.#db.prepare(
      "SELECT id FROM ai_jobs WHERE client_request_id = ?",
    ).get(input.clientRequestId) as { id: string } | undefined;
    if (duplicate) {
      const job = this.getAiJob(duplicate.id)!;
      return {
        job,
        userMessage: this.getAiMessage(job.userMessageId)!,
        assistantMessage: this.getAiMessage(job.assistantMessageId)!,
        duplicate: true,
      };
    }
    const conversation = this.getAiConversation(input.conversationId);
    if (!conversation) throw new Error("AI conversation not found");
    if (this.hasActiveAiJobs()) throw new Error("AI conversation has an active request");
    const timestamp = now();
    const jobId = randomUUID();
    const userMessage = newMessage({
      conversation,
      id: randomUUID(),
      jobId,
      role: "user",
      content: input.message,
      status: "completed",
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      timestamp,
    });
    const assistantMessage = newMessage({
      conversation,
      id: randomUUID(),
      jobId,
      role: "assistant",
      content: "",
      status: "pending",
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
      plan: null,
      error: null,
      createdAt: timestamp,
      startedAt: null,
      finishedAt: null,
    };
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      insertMessage(this.#db, userMessage);
      insertMessage(this.#db, assistantMessage);
      this.#db.prepare(
        `INSERT INTO ai_jobs
          (id, conversation_id, user_message_id, assistant_message_id, client_request_id,
           provider, model, reasoning_effort, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
      ).run(
        job.id,
        job.conversationId,
        job.userMessageId,
        job.assistantMessageId,
        job.clientRequestId,
        job.provider,
        job.model,
        job.reasoningEffort,
        timestamp,
      );
      this.#db.prepare(
        `UPDATE ai_conversations SET default_model = ?, default_reasoning_effort = ?, updated_at = ?
         WHERE id = ?`,
      ).run(input.model, input.reasoningEffort, timestamp, conversation.id);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return { job, userMessage, assistantMessage, duplicate: false };
  }

  getAiJob(id: string): AiJob | null {
    const row = this.#db.prepare(
      `SELECT id, conversation_id, user_message_id, assistant_message_id, client_request_id,
              provider, model, reasoning_effort, status, plan_json, error,
              created_at, started_at, finished_at
       FROM ai_jobs WHERE id = ?`,
    ).get(id) as AiJobRow | undefined;
    return row ? mapJob(row) : null;
  }

  transitionJob(id: string, status: AiJobStatus, options: {
    plan?: WorkspaceTurnPlan | null;
    content?: string;
    error?: string | null;
    receiptId?: string | null;
  } = {}): AiJob {
    const current = this.getAiJob(id);
    if (!current) throw new Error("AI job not found");
    const timestamp = now();
    const terminal = ["succeeded", "failed", "cancelled", "interrupted"].includes(status);
    const startedAt = current.startedAt ?? (
      ["planning", "executing"].includes(status) ? timestamp : null
    );
    const plan = options.plan === undefined ? current.plan : options.plan;
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(
        `UPDATE ai_jobs
         SET status = ?, plan_json = ?, error = ?, started_at = ?, finished_at = ?
         WHERE id = ?`,
      ).run(
        status,
        plan ? JSON.stringify(plan) : null,
        options.error === undefined ? current.error : options.error,
        startedAt,
        terminal ? timestamp : null,
        id,
      );
      const messageStatus: AiMessageStatus =
        status === "succeeded" ? "completed"
          : status === "cancelled" ? "cancelled"
            : ["failed", "interrupted"].includes(status) ? "failed"
              : "pending";
      this.#db.prepare(
        `UPDATE ai_messages
         SET content = COALESCE(?, content), status = ?, plan_json = ?,
             receipt_id = COALESCE(?, receipt_id), updated_at = ?
         WHERE id = ?`,
      ).run(
        options.content ?? null,
        messageStatus,
        plan ? JSON.stringify(plan) : null,
        options.receiptId ?? null,
        timestamp,
        current.assistantMessageId,
      );
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return this.getAiJob(id)!;
  }

  addActivity(jobId: string, kind: ActivityEvent["kind"], summary: string): ActivityEvent {
    const event: ActivityEvent = { id: randomUUID(), jobId, kind, summary, createdAt: now() };
    this.#db.prepare(
      "INSERT INTO activity_events (id, job_id, kind, summary, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(event.id, event.jobId, event.kind, event.summary, event.createdAt);
    return event;
  }

  listActivity(jobId: string): ActivityEvent[] {
    const rows = this.#db.prepare(
      `SELECT id, job_id, kind, summary, created_at
       FROM activity_events WHERE job_id = ? ORDER BY created_at, rowid`,
    ).all(jobId) as unknown as ActivityRow[];
    return rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      kind: row.kind,
      summary: row.summary,
      createdAt: row.created_at,
    }));
  }

  createReceipt(
    input: Omit<WorkspaceReceipt, "id" | "createdAt" | "undoneByReceiptId"> & { id?: string },
  ): WorkspaceReceipt {
    const { id, ...values } = input;
    const receipt: WorkspaceReceipt = {
      ...values,
      id: id ?? randomUUID(),
      undoneByReceiptId: null,
      createdAt: now(),
    };
    this.#db.prepare(
      `INSERT INTO workspace_receipts
        (id, job_id, provider, request_summary, plan_json, before_commit, after_commit,
         changed_paths_json, semantic_summary, undo_of_receipt_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      receipt.id,
      receipt.jobId,
      receipt.provider,
      receipt.requestSummary,
      JSON.stringify(receipt.plan),
      receipt.beforeCommit,
      receipt.afterCommit,
      JSON.stringify(receipt.changedPaths),
      receipt.semanticSummary,
      receipt.undoOfReceiptId,
      receipt.createdAt,
    );
    return receipt;
  }

  listReceipts(limit = 30): WorkspaceReceipt[] {
    const rows = this.#db.prepare(
      `SELECT id, job_id, provider, request_summary, plan_json, before_commit, after_commit,
              changed_paths_json, semantic_summary, undo_of_receipt_id, undone_by_receipt_id,
              created_at
       FROM workspace_receipts ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    ).all(limit) as unknown as ReceiptRow[];
    return rows.map(mapReceipt);
  }

  getReceipt(id: string): WorkspaceReceipt | null {
    const row = this.#db.prepare(
      `SELECT id, job_id, provider, request_summary, plan_json, before_commit, after_commit,
              changed_paths_json, semantic_summary, undo_of_receipt_id, undone_by_receipt_id,
              created_at
       FROM workspace_receipts WHERE id = ?`,
    ).get(id) as ReceiptRow | undefined;
    return row ? mapReceipt(row) : null;
  }

  markReceiptUndone(id: string, undoReceiptId: string): void {
    this.#db.prepare(
      "UPDATE workspace_receipts SET undone_by_receipt_id = ? WHERE id = ? AND undone_by_receipt_id IS NULL",
    ).run(undoReceiptId, id);
  }

  recoverInterruptedJobs(): number {
    const timestamp = now();
    const result = this.#db.prepare(
      `UPDATE ai_jobs SET status = 'interrupted', error = 'Server restarted during AI work',
         finished_at = ?
       WHERE status IN ('queued', 'planning', 'executing')`,
    ).run(timestamp);
    this.#db.prepare(
      `UPDATE ai_messages SET status = 'failed', updated_at = ?
       WHERE job_id IN (SELECT id FROM ai_jobs WHERE status = 'interrupted')`,
    ).run(timestamp);
    return Number(result.changes);
  }

  #migrate(): void {
    const currentVersion = Number(
      (this.#db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
    );
    if (currentVersion === 0) {
      this.#db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS assistant_profiles (
        id TEXT PRIMARY KEY CHECK (id = 'chief-assistant'),
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        role_description TEXT NOT NULL,
        communication_style TEXT NOT NULL,
        working_principles TEXT NOT NULL,
        timezone TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS assistant_profile_versions (
        profile_id TEXT NOT NULL REFERENCES assistant_profiles(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        role_description TEXT NOT NULL,
        communication_style TEXT NOT NULL,
        working_principles TEXT NOT NULL,
        timezone TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (profile_id, version)
      );
      CREATE TABLE IF NOT EXISTS workspace_configuration (
        id TEXT PRIMARY KEY CHECK (id = 'workos'),
        root_path TEXT NOT NULL,
        codex_granted INTEGER NOT NULL CHECK (codex_granted IN (0, 1)),
        grok_granted INTEGER NOT NULL CHECK (grok_granted IN (0, 1)),
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_config_proposals (
        id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL,
        codex_granted INTEGER NOT NULL,
        grok_granted INTEGER NOT NULL,
        validation_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected')),
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK (provider IN ('codex', 'grok')),
        title TEXT NOT NULL,
        default_model TEXT NOT NULL,
        default_reasoning_effort TEXT NOT NULL,
        provider_segment INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        job_id TEXT,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
        provider TEXT NOT NULL CHECK (provider IN ('codex', 'grok')),
        model TEXT NOT NULL,
        reasoning_effort TEXT NOT NULL,
        plan_json TEXT,
        receipt_id TEXT,
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
        status TEXT NOT NULL,
        plan_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );
      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_receipts (
        id TEXT PRIMARY KEY,
        job_id TEXT UNIQUE REFERENCES ai_jobs(id) ON DELETE SET NULL,
        provider TEXT NOT NULL CHECK (provider IN ('codex', 'grok')),
        request_summary TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        before_commit TEXT NOT NULL,
        after_commit TEXT NOT NULL,
        changed_paths_json TEXT NOT NULL,
        semantic_summary TEXT NOT NULL,
        undo_of_receipt_id TEXT REFERENCES workspace_receipts(id),
        undone_by_receipt_id TEXT REFERENCES workspace_receipts(id),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
        ON ai_messages (conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_ai_jobs_status
        ON ai_jobs (status, created_at);
      PRAGMA user_version = 1;
      COMMIT;
    `);
    }

    const schemaVersion = Number(
      (this.#db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
    );
    if (schemaVersion < 2) {
      this.#db.exec(`
        BEGIN IMMEDIATE;
        UPDATE ai_conversations
           SET default_model = CASE provider
             WHEN 'codex' THEN '${initialModelFor("codex")}'
             WHEN 'grok' THEN '${initialModelFor("grok")}'
           END
         WHERE default_model = 'default';
        UPDATE ai_messages
           SET model = CASE provider
             WHEN 'codex' THEN '${initialModelFor("codex")}'
             WHEN 'grok' THEN '${initialModelFor("grok")}'
           END
         WHERE model = 'default';
        UPDATE ai_jobs
           SET model = CASE provider
             WHEN 'codex' THEN '${initialModelFor("codex")}'
             WHEN 'grok' THEN '${initialModelFor("grok")}'
           END
         WHERE model = 'default';
        PRAGMA user_version = 2;
        COMMIT;
      `);
    }
  }

  #ensureDefaultProfile(): void {
    const existing = this.#db.prepare(
      "SELECT 1 FROM assistant_profiles WHERE id = 'chief-assistant'",
    ).get();
    if (existing) return;
    const timestamp = now();
    const timezone = DEFAULT_ASSISTANT_PROFILE.timezone ?? systemTimezone();
    this.#db.prepare(
      `INSERT INTO assistant_profiles
        (id, version, name, owner_address, role_description, communication_style,
         working_principles, timezone, created_at, updated_at)
       VALUES ('chief-assistant', 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      DEFAULT_ASSISTANT_PROFILE.name,
      DEFAULT_ASSISTANT_PROFILE.ownerAddress,
      DEFAULT_ASSISTANT_PROFILE.roleDescription,
      DEFAULT_ASSISTANT_PROFILE.communicationStyle,
      DEFAULT_ASSISTANT_PROFILE.workingPrinciples,
      timezone,
      timestamp,
      timestamp,
    );
    this.#db.prepare(
      `INSERT INTO assistant_profile_versions
        (profile_id, version, name, owner_address, role_description, communication_style,
         working_principles, timezone, created_at)
       VALUES ('chief-assistant', 1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      DEFAULT_ASSISTANT_PROFILE.name,
      DEFAULT_ASSISTANT_PROFILE.ownerAddress,
      DEFAULT_ASSISTANT_PROFILE.roleDescription,
      DEFAULT_ASSISTANT_PROFILE.communicationStyle,
      DEFAULT_ASSISTANT_PROFILE.workingPrinciples,
      timezone,
      timestamp,
    );
  }
}

function now(): string {
  return new Date().toISOString();
}

function newMessage(input: {
  conversation: AiConversation;
  id: string;
  jobId: string;
  role: AiMessage["role"];
  content: string;
  status: AiMessageStatus;
  model: string;
  reasoningEffort: string;
  timestamp: string;
}): AiMessage {
  return {
    id: input.id,
    conversationId: input.conversation.id,
    jobId: input.jobId,
    role: input.role,
    content: input.content,
    status: input.status,
    provider: input.conversation.provider,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    plan: null,
    receiptId: null,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

function insertMessage(db: DatabaseSync, message: AiMessage): void {
  db.prepare(
    `INSERT INTO ai_messages
      (id, conversation_id, job_id, role, content, status, provider, model,
       reasoning_effort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    message.createdAt,
    message.updatedAt,
  );
}

function mapProfile(row: ProfileRow): AssistantProfile {
  return {
    id: "chief-assistant",
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

function mapWorkspaceConfiguration(row: WorkspaceConfigurationRow): WorkspaceConfiguration {
  return {
    rootPath: row.root_path,
    codexGranted: Boolean(row.codex_granted),
    grokGranted: Boolean(row.grok_granted),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkspaceConfigProposal(row: WorkspaceConfigProposalRow): WorkspaceConfigProposal {
  return {
    id: row.id,
    rootPath: row.root_path,
    codexGranted: Boolean(row.codex_granted),
    grokGranted: Boolean(row.grok_granted),
    validation: JSON.parse(row.validation_json) as WorkspaceValidation,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function mapConversation(row: AiConversationRow): AiConversation {
  return {
    id: row.id,
    provider: row.provider,
    title: row.title,
    defaultModel: row.default_model,
    defaultReasoningEffort: row.default_reasoning_effort,
    providerSegment: row.provider_segment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: AiMessageRow): AiMessage {
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
    plan: row.plan_json ? JSON.parse(row.plan_json) as WorkspaceTurnPlan : null,
    receiptId: row.receipt_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJob(row: AiJobRow): AiJob {
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
    plan: row.plan_json ? JSON.parse(row.plan_json) as WorkspaceTurnPlan : null,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapReceipt(row: ReceiptRow): WorkspaceReceipt {
  return {
    id: row.id,
    jobId: row.job_id,
    provider: row.provider,
    requestSummary: row.request_summary,
    plan: JSON.parse(row.plan_json) as WorkspaceTurnPlan,
    beforeCommit: row.before_commit,
    afterCommit: row.after_commit,
    changedPaths: JSON.parse(row.changed_paths_json) as string[],
    semanticSummary: row.semantic_summary,
    undoOfReceiptId: row.undo_of_receipt_id,
    undoneByReceiptId: row.undone_by_receipt_id,
    createdAt: row.created_at,
  };
}

interface ProfileRow {
  id: string;
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

interface WorkspaceConfigurationRow {
  root_path: string;
  codex_granted: number;
  grok_granted: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface WorkspaceConfigProposalRow {
  id: string;
  root_path: string;
  codex_granted: number;
  grok_granted: number;
  validation_json: string;
  status: WorkspaceConfigProposal["status"];
  created_at: string;
  resolved_at: string | null;
}

interface AiConversationRow {
  id: string;
  provider: AiProviderId;
  title: string;
  default_model: string;
  default_reasoning_effort: string;
  provider_segment: number;
  created_at: string;
  updated_at: string;
}

interface AiMessageRow {
  id: string;
  conversation_id: string;
  job_id: string | null;
  role: AiMessage["role"];
  content: string;
  status: AiMessageStatus;
  provider: AiProviderId;
  model: string;
  reasoning_effort: string;
  plan_json: string | null;
  receipt_id: string | null;
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
  plan_json: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface ActivityRow {
  id: string;
  job_id: string;
  kind: ActivityEvent["kind"];
  summary: string;
  created_at: string;
}

interface ReceiptRow {
  id: string;
  job_id: string | null;
  provider: AiProviderId;
  request_summary: string;
  plan_json: string;
  before_commit: string;
  after_commit: string;
  changed_paths_json: string;
  semantic_summary: string;
  undo_of_receipt_id: string | null;
  undone_by_receipt_id: string | null;
  created_at: string;
}
