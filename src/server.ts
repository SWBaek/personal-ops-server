import { join } from "node:path";

import { AiConversationService } from "./ai/streaming-service.js";
import { CliWorkspaceProvider } from "./ai/workspace-provider.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { GitWorkspace } from "./infra/git-workspace.js";
import { OpsStore } from "./infra/store.js";

const config = loadConfig();
const store = new OpsStore(join(config.dataDir, "workos-runtime.db"));
const workspace = new GitWorkspace();
const provider = new CliWorkspaceProvider(config.runtimeDir);
const aiConversationService = new AiConversationService(store, provider, workspace);
const app = await buildApp({
  store,
  workspace,
  aiConversationService,
  workspaceSeed: config.workspaceSeed,
  environment: config.environment,
});

app.addHook("onClose", async () => {
  await aiConversationService.close();
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
