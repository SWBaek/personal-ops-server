import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { GitWorkspace } from "../src/infra/git-workspace.js";
import { OpsStore } from "../src/infra/store.js";
import { createGitWorkspace } from "./helpers.js";

test("stores configuration, one conversation, idempotent turns, and provider segments", () => {
  const temporary = mkdtempSync(join(tmpdir(), "ops-store-"));
  const vault = join(temporary, "vault");
  createGitWorkspace(vault);
  const store = new OpsStore(join(temporary, "runtime.db"));
  try {
    const validation = new GitWorkspace().validate(vault);
    const proposal = store.createWorkspaceConfigProposal({
      rootPath: vault,
      codexGranted: true,
      grokGranted: true,
      validation,
    });
    const configuration = store.confirmWorkspaceConfigProposal(proposal.id);
    assert.equal(configuration.version, 1);
    assert.equal(configuration.rootPath, validation.rootPath);

    const conversation = store.createAiConversation({
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
    assert.equal(store.createAiConversation({
      provider: "grok",
      model: "grok-4.5",
      reasoningEffort: "default",
    }).id, conversation.id);

    const requestId = "edff3c61-d351-43f4-9015-7c586bc0fb98";
    const first = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: requestId,
      message: "오늘 일정은?",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
    const duplicate = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: requestId,
      message: "ignored",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.job.id, first.job.id);
    const signalAt = new Date().toISOString();
    store.updateProviderProgress(first.job.id, {
      providerStartedAt: signalAt,
      lastProviderSignalAt: signalAt,
      currentPhase: "checking_workos",
    });
    assert.equal(store.getAiJob(first.job.id)!.currentPhase, "checking_workos");
    assert.equal(store.listActivity(first.job.id).length, 0);
    store.transitionJob(first.job.id, "succeeded", { content: "답변", error: null });

    const switched = store.switchConversationProvider(conversation.id, {
      provider: "grok",
      model: "grok-4.5",
      reasoningEffort: "high",
    });
    assert.equal(switched.providerSegment, 2);
    assert.equal(switched.provider, "grok");
  } finally {
    store.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("migrates legacy default model rows to explicit provider models", () => {
  const temporary = mkdtempSync(join(tmpdir(), "ops-store-migration-"));
  const databasePath = join(temporary, "runtime.db");
  const initialStore = new OpsStore(databasePath);
  initialStore.close();

  const legacy = new DatabaseSync(databasePath);
  const timestamp = new Date().toISOString();
  legacy.exec("PRAGMA foreign_keys = OFF; PRAGMA user_version = 1;");
  legacy.prepare(
    `INSERT INTO ai_conversations
      (id, provider, title, default_model, default_reasoning_effort,
       provider_segment, created_at, updated_at)
     VALUES (?, ?, ?, 'default', 'high', 1, ?, ?)`,
  ).run("conversation", "codex", "Legacy", timestamp, timestamp);
  legacy.prepare(
    `INSERT INTO ai_messages
      (id, conversation_id, job_id, role, content, status, provider, model,
       reasoning_effort, plan_json, receipt_id, created_at, updated_at)
     VALUES (?, ?, NULL, 'user', 'Legacy', 'completed', 'grok', 'default',
       'high', NULL, NULL, ?, ?)`,
  ).run("message", "conversation", timestamp, timestamp);
  legacy.close();

  const migrated = new OpsStore(databasePath);
  try {
    assert.equal(migrated.getAiConversation("conversation")!.defaultModel, "gpt-5.6-sol");
    assert.equal(migrated.getAiMessage("message")!.model, "grok-4.5");
    const inspected = new DatabaseSync(databasePath);
    assert.equal(
      (inspected.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
      3,
    );
    inspected.close();
  } finally {
    migrated.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("profile changes are versioned and workspace proposals fail closed", () => {
  const temporary = mkdtempSync(join(tmpdir(), "ops-store-"));
  const store = new OpsStore(join(temporary, "runtime.db"));
  try {
    const initial = store.getAssistantProfile();
    const updated = store.updateAssistantProfile({
      name: "테스트 비서",
      ownerAddress: "사용자",
      roleDescription: "WorkOS 비서",
      communicationStyle: "간결하게",
      workingPrinciples: "안전하게",
      timezone: "Asia/Seoul",
    });
    assert.equal(updated.version, initial.version + 1);

    const invalid = store.createWorkspaceConfigProposal({
      rootPath: join(temporary, "missing"),
      codexGranted: true,
      grokGranted: false,
      validation: new GitWorkspace().validate(join(temporary, "missing")),
    });
    assert.throws(() => store.confirmWorkspaceConfigProposal(invalid.id), /invalid/u);
  } finally {
    store.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("restart recovery marks active liveness jobs interrupted", () => {
  const temporary = mkdtempSync(join(tmpdir(), "ops-store-recovery-"));
  const databasePath = join(temporary, "runtime.db");
  const store = new OpsStore(databasePath);
  const conversation = store.createAiConversation({
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
  });
  const job = store.createAiTurn({
    conversationId: conversation.id,
    clientRequestId: crypto.randomUUID(),
    message: "synthetic recovery",
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
  }).job;
  store.transitionJob(job.id, "planning");
  store.updateProviderProgress(job.id, {
    providerStartedAt: new Date().toISOString(),
    currentPhase: "checking_workos",
  });
  store.close();

  const recovered = new OpsStore(databasePath);
  try {
    assert.equal(recovered.recoverInterruptedJobs(), 1);
    assert.equal(recovered.getAiJob(job.id)!.status, "interrupted");
    assert.equal(recovered.getAiMessage(job.assistantMessageId)!.status, "failed");
  } finally {
    recovered.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});
