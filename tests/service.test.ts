import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AiConversationService } from "../src/ai/streaming-service.js";
import type {
  WorkspaceExecutionInput,
  WorkspaceProvider,
  WorkspaceProviderInput,
} from "../src/ai/workspace-provider.js";
import type {
  WorkspaceExecutionResult,
  WorkspaceTurnPlan,
} from "../src/domain/workspace.js";
import { GitWorkspace } from "../src/infra/git-workspace.js";
import { OpsStore } from "../src/infra/store.js";
import { createGitWorkspace, git } from "./helpers.js";

class FakeProvider implements WorkspaceProvider {
  answerResult: string;
  planResult: WorkspaceTurnPlan;
  executionResult: WorkspaceExecutionResult;
  writePath: string | null;
  writeContent: string;
  answerError: Error | null = null;
  answerCalls = 0;
  planCalls = 0;

  constructor(plan: WorkspaceTurnPlan, writePath: string | null = null, answer = "오늘 일정입니다.") {
    this.answerResult = answer;
    this.planResult = plan;
    this.writePath = writePath;
    this.writeContent = "# Updated by assistant\n";
    this.executionResult = {
      reply: "변경했습니다.",
      semanticSummary: "Update synthetic note",
      changedPaths: writePath ? [writePath] : [],
      validation: ["synthetic validation passed"],
    };
  }

  async answer(_input: WorkspaceProviderInput): Promise<string> {
    this.answerCalls += 1;
    if (this.answerError) throw this.answerError;
    return this.answerResult;
  }

  async plan(_input: WorkspaceProviderInput): Promise<WorkspaceTurnPlan> {
    this.planCalls += 1;
    return this.planResult;
  }

  async execute(input: WorkspaceExecutionInput): Promise<WorkspaceExecutionResult> {
    if (this.writePath) writeFileSync(join(input.rootPath, this.writePath), this.writeContent, "utf8");
    return this.executionResult;
  }
}

test("observe completes without writes and execute creates one receipt commit with Undo", async () => {
  const fixture = setupFixture();
  try {
    const directAnswer = "오늘 일정입니다.\n\n- 14:00 프로젝트 미팅";
    const observeProvider = new FakeProvider(
      plan({ mode: "observe", reply: "이 계획은 사용되지 않아야 합니다." }),
      null,
      directAnswer,
    );
    const observeService = new AiConversationService(fixture.store, observeProvider, fixture.workspace);
    const observeJob = createTurn(fixture.store, fixture.conversationId, "오늘 일정은?");
    observeService.enqueue(observeJob);
    await waitFor(() => fixture.store.getAiJob(observeJob)?.status === "succeeded");
    const observe = fixture.store.getAiJob(observeJob)!;
    assert.equal(fixture.store.getAiMessage(observe.assistantMessageId)!.content, directAnswer);
    assert.equal(observe.plan, null);
    assert.equal(observeProvider.answerCalls, 1);
    assert.equal(observeProvider.planCalls, 0);
    assert.equal(fixture.workspace.changedPaths(fixture.vault).length, 0);
    await observeService.close();

    const executeProvider = new FakeProvider(plan({
      mode: "execute",
      summary: "Update README",
      expectedPaths: ["README.md"],
    }), "README.md");
    const executeService = new AiConversationService(fixture.store, executeProvider, fixture.workspace);
    const executeJob = createTurn(fixture.store, fixture.conversationId, "README를 업데이트해");
    executeService.enqueue(executeJob);
    await waitFor(() => fixture.store.getAiJob(executeJob)?.status === "succeeded");
    assert.equal(executeProvider.answerCalls, 0);
    assert.equal(executeProvider.planCalls, 1);
    const receipts = fixture.store.listReceipts();
    assert.equal(receipts.length, 1);
    assert.equal(git(fixture.vault, ["status", "--porcelain"]), "");
    assert.match(git(fixture.vault, ["log", "-1", "--pretty=%B"]), /Receipt:/u);

    const undo = executeService.undoReceipt(receipts[0]!.id);
    assert.equal(undo.undoOfReceiptId, receipts[0]!.id);
    assert.match(git(fixture.vault, ["log", "-1", "--pretty=%s"]), /Revert/u);
    await executeService.close();
  } finally {
    fixture.close();
  }
});

test("incomplete provider output fails durably instead of completing the message", async () => {
  const fixture = setupFixture();
  try {
    const provider = new FakeProvider(plan({ mode: "observe" }));
    provider.answerError = new Error("AI provider returned no usable answer");
    const service = new AiConversationService(fixture.store, provider, fixture.workspace);
    const jobId = createTurn(fixture.store, fixture.conversationId, "운영 상태를 평가해봐");
    service.enqueue(jobId);
    await waitFor(() => fixture.store.getAiJob(jobId)?.status === "failed");

    const job = fixture.store.getAiJob(jobId)!;
    const message = fixture.store.getAiMessage(job.assistantMessageId)!;
    assert.equal(message.status, "failed");
    assert.equal(message.content, "AI provider returned no usable answer");
    assert.match(job.error!, /no usable answer/u);
    await service.close();
  } finally {
    fixture.close();
  }
});

test("govern waits for approval and dirty worktree blocks execution", async () => {
  const fixture = setupFixture();
  try {
    const provider = new FakeProvider(plan({
      mode: "govern",
      risk: "high",
      requiresApproval: true,
      summary: "Change AGENTS",
      expectedPaths: ["AGENTS.md"],
    }), "AGENTS.md");
    const service = new AiConversationService(fixture.store, provider, fixture.workspace);
    const jobId = createTurn(fixture.store, fixture.conversationId, "AGENTS를 바꿔");
    service.enqueue(jobId);
    await waitFor(() => fixture.store.getAiJob(jobId)?.status === "approval_required");
    assert.equal(fixture.workspace.changedPaths(fixture.vault).length, 0);

    writeFileSync(join(fixture.vault, "README.md"), "# owner change\n", "utf8");
    service.approve(jobId);
    await waitFor(() => fixture.store.getAiJob(jobId)?.status === "failed");
    assert.match(fixture.store.getAiJob(jobId)!.error!, /미커밋/u);
    assert.deepEqual(fixture.workspace.changedPaths(fixture.vault), ["README.md"]);
    await service.close();
  } finally {
    fixture.close();
  }
});

function setupFixture() {
  const temporary = mkdtempSync(join(tmpdir(), "ops-service-"));
  const vault = join(temporary, "vault");
  createGitWorkspace(vault);
  const store = new OpsStore(join(temporary, "runtime.db"));
  const workspace = new GitWorkspace();
  const proposal = store.createWorkspaceConfigProposal({
    rootPath: vault,
    codexGranted: true,
    grokGranted: true,
    validation: workspace.validate(vault),
  });
  store.confirmWorkspaceConfigProposal(proposal.id);
  const conversation = store.createAiConversation({
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
  });
  return {
    temporary,
    vault,
    store,
    workspace,
    conversationId: conversation.id,
    close() {
      store.close();
      rmSync(temporary, { recursive: true, force: true });
    },
  };
}

function createTurn(store: OpsStore, conversationId: string, message: string): string {
  return store.createAiTurn({
    conversationId,
    clientRequestId: crypto.randomUUID(),
    message,
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
  }).job.id;
}

function plan(overrides: Partial<WorkspaceTurnPlan>): WorkspaceTurnPlan {
  return {
    mode: "execute",
    summary: "Synthetic plan",
    reply: "계획",
    risk: "low",
    expectedPaths: [],
    operations: ["edit note"],
    capabilities: ["local"],
    rationale: "Synthetic test",
    requiresApproval: false,
    ...overrides,
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for service state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
