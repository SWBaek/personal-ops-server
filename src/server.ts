import { join } from "node:path";

import { CliAiChatService } from "./ai/chat-service.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { OpsStore } from "./infra/store.js";

const config = loadConfig();
const store = new OpsStore(join(config.dataDir, "personal-ops.db"));
const aiChatService = new CliAiChatService({
  workingDirectory: config.aiWorkingDir,
});
const app = await buildApp({ store, aiChatService });

app.addHook("onClose", async () => {
  store.close();
});

const close = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void close("SIGINT"));
process.once("SIGTERM", () => void close("SIGTERM"));

await app.listen({ host: config.host, port: config.port });
