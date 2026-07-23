import { AiConversationService, type AiStreamingProvider } from "../../src/ai/streaming-service.js";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { OpsStore } from "../../src/infra/store.js";

const config = loadConfig();
const store = new OpsStore(":memory:");
const provider: AiStreamingProvider = {
  async runTurn(input) {
    await delay(150, input.signal);
    const currentMessage = input.message.split("Current owner message:\n").at(-1)?.trim() ?? "";
    const pendingId = /"pendingProposals":\[\{"id":"([^"]+)"/.exec(input.message)?.[1] ?? null;
    const envelope = currentMessage.includes("알파 배포")
      ? {
          reply: "알파 배포 후속 조치로 이해했습니다.",
          resolutions: [],
          memoProposal: {
            operation: "create",
            targetMemoId: null,
            supersedesProposalId: null,
            memo: {
              summary: "알파 배포 일정을 금요일에 확인한다.",
              facets: [{ kind: "action", text: "민수에게 알파 배포 일정을 확인한다." }],
              subjects: ["알파", "민수"],
              timeReferences: [{ original: "금요일", interpreted: "2026-07-24", certainty: "explicit" }],
              uncertainties: [],
            },
          },
        }
      : currentMessage.includes("저장해") && pendingId
        ? { reply: "비서 메모로 저장했습니다.", resolutions: [{ proposalId: pendingId, action: "confirm" }], memoProposal: null }
        : { reply: "구조화 응답 완료", resolutions: [], memoProposal: null };
    const text = JSON.stringify(envelope);
    return {
      text,
      usage: { inputTokens: 4, cachedInputTokens: 0, outputTokens: 3, reasoningTokens: 0 },
      durationMs: 150,
      providerThreadId: `e2e-${input.provider}`,
      streamMode: "buffered",
    };
  },
};
const aiConversationService = new AiConversationService(store, provider);
const app = await buildApp({
  store,
  aiConversationService,
  aiRuntime: { environment: "test", mode: "managed", isolated: true },
});

app.addHook("onClose", async () => {
  await aiConversationService.close();
  store.close();
});

await app.listen({ host: config.host, port: config.port });

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });
}
