import { join } from "node:path";

import { AiConversationService, type AiStreamingProvider } from "../../src/ai/streaming-service.js";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { OpsStore } from "../../src/infra/store.js";

const config = loadConfig();
const store = new OpsStore(join(config.dataDir, "personal-ops.db"));
const provider: AiStreamingProvider = {
  async runTurn(input) {
    input.onDelta("스트리밍 ");
    await delay(150, input.signal);
    input.onDelta("응답 완료");
    return {
      text: "스트리밍 응답 완료",
      usage: { inputTokens: 4, cachedInputTokens: 0, outputTokens: 3, reasoningTokens: 0 },
      durationMs: 150,
      providerThreadId: `e2e-${input.provider}`,
      streamMode: "text",
    };
  },
};
const aiConversationService = new AiConversationService(store, provider);
const app = await buildApp({ store, aiConversationService });

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
