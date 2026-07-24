import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AiConversationService } from "../src/ai/streaming-service.js";
import type {
  WorkspaceExecutionInput,
  WorkspaceProvider,
  WorkspaceProviderInput,
} from "../src/ai/workspace-provider.js";
import { buildApp } from "../src/app.js";
import type { WorkspaceExecutionResult, WorkspaceTurnPlan } from "../src/domain/workspace.js";
import { GitWorkspace } from "../src/infra/git-workspace.js";
import { OpsStore } from "../src/infra/store.js";
import { createGitWorkspace } from "./helpers.js";

class NoopProvider implements WorkspaceProvider {
  async answer(_input: WorkspaceProviderInput): Promise<string> {
    return "Synthetic answer";
  }

  async plan(_input: WorkspaceProviderInput): Promise<WorkspaceTurnPlan> {
    return {
      mode: "observe",
      summary: "Answer",
      reply: "Synthetic answer",
      risk: "low",
      expectedPaths: [],
      operations: ["read"],
      capabilities: ["local"],
      rationale: "Question",
      requiresApproval: false,
    };
  }

  async execute(_input: WorkspaceExecutionInput): Promise<WorkspaceExecutionResult> {
    throw new Error("not used");
  }
}

test("first-run configuration validates Git and exposes only WorkOS-native APIs", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "ops-app-"));
  const vault = join(temporary, "vault");
  createGitWorkspace(vault);
  const store = new OpsStore(join(temporary, "runtime.db"));
  const workspace = new GitWorkspace();
  const service = new AiConversationService(store, new NoopProvider(), workspace);
  const app = await buildApp({ store, workspace, aiConversationService: service, workspaceSeed: vault });
  try {
    const initial = await app.inject({ method: "GET", url: "/api/workspace/status" });
    assert.equal(initial.statusCode, 200);
    assert.equal(initial.json().configured, false);
    assert.equal(initial.json().suggestedRoot, vault);

    const proposal = await app.inject({
      method: "POST",
      url: "/api/workspace/configuration/proposals",
      payload: { rootPath: vault, codexGranted: true, grokGranted: true },
    });
    assert.equal(proposal.statusCode, 201);
    assert.equal(proposal.json().proposal.validation.valid, true);
    const proposalId = proposal.json().proposal.id as string;

    const confirm = await app.inject({
      method: "POST",
      url: `/api/workspace/configuration/proposals/${proposalId}/confirm`,
      payload: { confirmation: "CONNECT_WORKOS" },
    });
    assert.equal(confirm.statusCode, 200);
    assert.equal(confirm.json().configuration.codexGranted, true);

    assert.equal((await app.inject({ method: "GET", url: "/api/projects" })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: "/api/inbox" })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: "/api/debug/summary" })).statusCode, 404);

    const health = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(health.json().build, "workos-native-v1");
    const markedModule = await app.inject({ method: "GET", url: "/vendor/marked.js" });
    assert.equal(markedModule.statusCode, 200);
    assert.match(markedModule.headers["content-type"] ?? "", /javascript/u);
    assert.match(markedModule.body, /markdown parser/u);
    const purifierModule = await app.inject({ method: "GET", url: "/vendor/dompurify.js" });
    assert.equal(purifierModule.statusCode, 200);
    assert.match(purifierModule.headers["content-type"] ?? "", /javascript/u);
    assert.match(purifierModule.body, /createDOMPurify/u);
  } finally {
    await app.close();
    store.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("conversation question completes through one direct provider answer", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "ops-app-"));
  const vault = join(temporary, "vault");
  createGitWorkspace(vault);
  const store = new OpsStore(join(temporary, "runtime.db"));
  const workspace = new GitWorkspace();
  const configuration = store.createWorkspaceConfigProposal({
    rootPath: vault,
    codexGranted: true,
    grokGranted: false,
    validation: workspace.validate(vault),
  });
  store.confirmWorkspaceConfigProposal(configuration.id);
  const service = new AiConversationService(store, new NoopProvider(), workspace);
  const app = await buildApp({ store, workspace, aiConversationService: service });
  try {
    const conversation = await app.inject({
      method: "POST",
      url: "/api/ai/conversations",
      payload: { provider: "codex", model: "default", reasoningEffort: "high" },
    });
    assert.equal(conversation.statusCode, 201);
    const conversationId = conversation.json().conversation.id as string;
    const submitted = await app.inject({
      method: "POST",
      url: `/api/ai/conversations/${conversationId}/messages`,
      payload: {
        clientRequestId: "db5dde63-ed47-4476-a1fe-78cbdab56247",
        message: "WorkOS 규칙을 알려줘",
        model: "default",
        reasoningEffort: "high",
      },
    });
    assert.equal(submitted.statusCode, 202);
    const jobId = submitted.json().job.id as string;
    await waitFor(() => store.getAiJob(jobId)?.status === "succeeded");
    assert.equal(store.getAiMessage(store.getAiJob(jobId)!.assistantMessageId)!.content, "Synthetic answer");
  } finally {
    await app.close();
    store.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 3_000) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
