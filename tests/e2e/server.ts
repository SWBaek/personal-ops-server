import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { AiConversationService } from "../../src/ai/streaming-service.js";
import type {
  WorkspaceExecutionInput,
  WorkspaceProvider,
  WorkspaceProviderInput,
} from "../../src/ai/workspace-provider.js";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import type { WorkspaceExecutionResult, WorkspaceTurnPlan } from "../../src/domain/workspace.js";
import { GitWorkspace } from "../../src/infra/git-workspace.js";
import { OpsStore } from "../../src/infra/store.js";
import { createGitWorkspace } from "../helpers.js";

const config = loadConfig();
const root = resolve("var/playwright/e2e-runtime");
if (root.toLowerCase().startsWith(resolve("var/playwright").toLowerCase())) {
  rmSync(root, { recursive: true, force: true });
}
mkdirSync(root, { recursive: true });
const vault = join(root, "synthetic-workos");
createGitWorkspace(vault);

const provider: WorkspaceProvider = {
  async answer(input: WorkspaceProviderInput): Promise<string> {
    const startedAt = new Date().toISOString();
    input.onProgress?.({ type: "started", at: startedAt });
    input.onProgress?.({ type: "signal", at: startedAt, phase: "checking_workos" });
    await delay(input.message.includes("느린") ? 1_500 : 80, input.signal);
    input.onProgress?.({ type: "signal", at: new Date().toISOString(), phase: "composing" });
    input.onProgress?.({ type: "stopped", at: new Date().toISOString() });
    if (input.message.includes("Markdown")) {
      return [
        "## 프로젝트 요약",
        "",
        "- 첫 번째 결과",
        "- **중요한 결정**",
        "",
        "| 구분 | 상태 |",
        "| --- | --- |",
        "| 테스트 | 완료 |",
        "",
        "> 근거를 확인했습니다.",
        "",
        "```ts",
        "const safe = true;",
        "```",
        "",
        "[안전한 링크](https://example.com)",
        "[위험한 링크](javascript:alert(1))",
        "<img src=x onerror=\"window.__markdownXss = true\">",
        "<script>window.__markdownXss = true</script>",
      ].join("\n");
    }
    if (input.message.includes("일정")) {
      return "합성 WorkOS에는 오늘 등록된 일정이 없습니다.";
    }
    return "합성 WorkOS를 직접 읽고 답변했습니다.";
  },
  async plan(input: WorkspaceProviderInput): Promise<WorkspaceTurnPlan> {
    await delay(80, input.signal);
    if (input.message.includes("일정")) {
      return {
        mode: "observe",
        summary: "Read schedule",
        reply: "합성 WorkOS에는 오늘 등록된 일정이 없습니다.",
        risk: "low",
        expectedPaths: [],
        operations: ["read meeting notes"],
        capabilities: ["local"],
        rationale: "읽기 질문입니다.",
        requiresApproval: false,
      };
    }
    const govern = input.message.includes("AGENTS");
    return {
      mode: govern ? "govern" : "execute",
      summary: govern ? "Update AGENTS instructions" : "Update README note",
      reply: govern ? "운영 규칙 변경은 승인이 필요합니다." : "README 변경을 준비했습니다.",
      risk: govern ? "high" : "low",
      expectedPaths: [govern ? "AGENTS.md" : "README.md"],
      operations: [govern ? "edit agent contract" : "edit note"],
      capabilities: ["local"],
      rationale: govern ? "AGENTS.md는 Govern 영역입니다." : "사용자가 단일 문서 수정을 요청했습니다.",
      requiresApproval: govern,
    };
  },
  async execute(input: WorkspaceExecutionInput): Promise<WorkspaceExecutionResult> {
    await delay(100, input.signal);
    const path = input.plan.expectedPaths[0]!;
    const target = join(input.rootPath, path);
    const current = readFileSync(target, "utf8");
    writeFileSync(target, `${current.trimEnd()}\n\nAssistant verified change.\n`, "utf8");
    return {
      reply: `${path}를 변경하고 검증했습니다.`,
      semanticSummary: `Update ${path}`,
      changedPaths: [path],
      validation: ["Markdown file remains readable"],
    };
  },
};

const store = new OpsStore(join(root, "workos-runtime.db"));
const workspace = new GitWorkspace();
const proposal = store.createWorkspaceConfigProposal({
  rootPath: vault,
  codexGranted: true,
  grokGranted: true,
  validation: workspace.validate(vault),
});
store.confirmWorkspaceConfigProposal(proposal.id);
const service = new AiConversationService(store, provider, workspace);
const app = await buildApp({
  store,
  workspace,
  aiConversationService: service,
  environment: "test",
});
app.addHook("onClose", async () => {
  await service.close();
  store.close();
});
await app.listen({ host: config.host, port: config.port });

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveDelay, reject) => {
    const timer = setTimeout(resolveDelay, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });
}
