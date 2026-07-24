import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      model: "default",
      reasoningEffort: "high",
    });
    assert.equal(store.createAiConversation({
      provider: "grok",
      model: "default",
      reasoningEffort: "default",
    }).id, conversation.id);

    const requestId = "edff3c61-d351-43f4-9015-7c586bc0fb98";
    const first = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: requestId,
      message: "오늘 일정은?",
      model: "default",
      reasoningEffort: "high",
    });
    const duplicate = store.createAiTurn({
      conversationId: conversation.id,
      clientRequestId: requestId,
      message: "ignored",
      model: "default",
      reasoningEffort: "high",
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.job.id, first.job.id);
    store.transitionJob(first.job.id, "succeeded", { content: "답변", error: null });

    const switched = store.switchConversationProvider(conversation.id, {
      provider: "grok",
      model: "default",
      reasoningEffort: "high",
    });
    assert.equal(switched.providerSegment, 2);
    assert.equal(switched.provider, "grok");
  } finally {
    store.close();
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
