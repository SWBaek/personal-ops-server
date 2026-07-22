import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { resolve } from "node:path";

import {
  AI_PROVIDER_OPTIONS,
  AiChatError,
  type AiChatService,
  validateAiChatInput,
} from "./ai/chat-service.js";
import { getProviderStatuses } from "./ai/provider-status.js";
import { localDateString, optionalIsoDate, requireNonEmptyText } from "./domain/validation.js";
import { OpsStore } from "./infra/store.js";

interface CreateCaptureBody {
  body?: unknown;
}

interface CreateTaskBody {
  title?: unknown;
  scheduledOn?: unknown;
  dueOn?: unknown;
}

interface UpdateTaskBody {
  completed?: unknown;
  scheduledOn?: unknown;
}

interface BuildAppOptions {
  store: OpsStore;
  aiChatService?: AiChatService;
  publicDir?: string;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(fastifyStatic, {
    root: options.publicDir ?? resolve("public"),
    prefix: "/",
  });

  app.get("/api/health", async () => ({ ok: true, now: new Date().toISOString() }));

  app.get("/api/captures", async () => ({ captures: options.store.listCaptures() }));

  app.post<{ Body: CreateCaptureBody }>("/api/captures", async (request, reply) => {
    const body = requireNonEmptyText(request.body?.body, "body");
    const capture = options.store.createCapture(body);
    return reply.code(201).send({ capture });
  });

  app.get<{ Querystring: { view?: string } }>("/api/tasks", async (request) => {
    const tasks =
      request.query.view === "today"
        ? options.store.listTodayTasks(localDateString())
        : options.store.listOpenTasks();
    return { tasks };
  });

  app.post<{ Body: CreateTaskBody }>("/api/tasks", async (request, reply) => {
    const task = options.store.createTask({
      title: requireNonEmptyText(request.body?.title, "title", 500),
      scheduledOn: optionalIsoDate(request.body?.scheduledOn, "scheduledOn"),
      dueOn: optionalIsoDate(request.body?.dueOn, "dueOn"),
    });
    return reply.code(201).send({ task });
  });

  app.patch<{ Params: { id: string }; Body: UpdateTaskBody }>(
    "/api/tasks/:id",
    async (request, reply) => {
      const patch: { completed?: boolean; scheduledOn?: string | null } = {};

      if (request.body?.completed !== undefined) {
        if (typeof request.body.completed !== "boolean") {
          throw new Error("completed must be a boolean");
        }
        patch.completed = request.body.completed;
      }
      if (request.body?.scheduledOn !== undefined) {
        patch.scheduledOn = optionalIsoDate(request.body.scheduledOn, "scheduledOn");
      }
      if (Object.keys(patch).length === 0) {
        return reply.code(400).send({ error: "No supported changes were provided" });
      }

      const task = options.store.updateTask(request.params.id, patch);
      if (!task) {
        return reply.code(404).send({ error: "Task not found" });
      }
      return { task };
    },
  );

  app.get("/api/ai/providers", async () => ({ providers: await getProviderStatuses() }));

  app.get("/api/ai/options", async () => ({ providers: AI_PROVIDER_OPTIONS }));

  app.post<{ Body: Parameters<typeof validateAiChatInput>[0] }>(
    "/api/ai/chat",
    async (request) => {
      if (!options.aiChatService) {
        throw new AiChatError("AI chat is not configured", 503);
      }
      const input = validateAiChatInput(request.body);
      const result = await options.aiChatService.chat(input);
      return {
        provider: input.provider,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
        ...result,
      };
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const statusCodeValue =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined;
    const statusCode = typeof statusCodeValue === "number"
      ? statusCodeValue
      : message.includes("must be")
        ? 400
        : 500;

    if (statusCode >= 500) {
      app.log.error(error);
    }
    void reply.code(statusCode).send({ error: message });
  });

  return app;
}
