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
import {
  type AiConversationService,
  type AiJobSnapshot,
  type AiJobStreamEvent,
} from "./ai/streaming-service.js";
import { validateAssistantProfileInput } from "./domain/assistant-profile.js";
import { InputError, localDateString, optionalIsoDate, requireNonEmptyText } from "./domain/validation.js";
import {
  DEBUG_DATASETS,
  type DebugDatasetId,
  OpsStore,
} from "./infra/store.js";

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

interface CreateAiConversationBody {
  assistantSlot?: unknown;
  provider?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
}

interface CreateAiMessageBody {
  clientRequestId?: unknown;
  message?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
}

interface ResetAiConversationBody {
  provider?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
}

interface ConfirmDestructiveBody {
  confirmation?: unknown;
}

interface BuildAppOptions {
  store: OpsStore;
  aiChatService?: AiChatService;
  aiConversationService?: AiConversationService;
  publicDir?: string;
  aiRuntime?: {
    environment: "development" | "production" | "test";
    mode: "managed" | "custom";
    isolated: boolean;
  };
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(fastifyStatic, {
    root: options.publicDir ?? resolve("public"),
    prefix: "/",
  });

  app.get("/api/health", async () => ({ ok: true, now: new Date().toISOString() }));

  app.get("/api/system/runtime", async () => ({
    runtime: options.aiRuntime ?? {
      environment: "test",
      mode: "managed",
      isolated: true,
    },
  }));

  app.get("/api/assistant/profile", async () => ({
    profile: options.store.getAssistantProfile(),
  }));

  app.put<{ Body: Record<string, unknown> }>("/api/assistant/profile", async (request, reply) => {
    requireConfirmation(request.body?.confirmation, "UPDATE_ASSISTANT_PROFILE");
    if (options.store.hasActiveAiJobs()) {
      return reply.code(409).send({ error: "진행 중인 AI 요청이 끝난 뒤 비서 구성을 변경해주세요." });
    }
    const profile = options.store.updateAssistantProfile(
      validateAssistantProfileInput(request.body),
    );
    return { profile };
  });

  app.get("/api/captures", async () => ({ captures: options.store.listCaptures() }));

  app.post<{ Body: CreateCaptureBody }>("/api/captures", async (request, reply) => {
    const body = requireNonEmptyText(request.body?.body, "body");
    const capture = options.store.createCapture(body);
    return reply.code(201).send({ capture });
  });

  app.get<{ Querystring: { status?: string } }>("/api/inbox", async (request) => {
    const status = request.query?.status;
    if (status && !["pending", "confirmed", "rejected", "superseded"].includes(status)) {
      throw new InputError("status is not allowed");
    }
    return {
      proposals: options.store.listIntakeProposals(
        undefined,
        status as import("./infra/store.js").IntakeProposalStatus | undefined,
      ),
      memos: status && status !== "confirmed" ? [] : options.store.listAssistantMemos(),
    };
  });

  app.get<{ Params: { id: string } }>("/api/inbox/:id", async (request, reply) => {
    const memo = options.store.getAssistantMemo(request.params.id);
    if (!memo) return reply.code(404).send({ error: "비서 메모를 찾을 수 없습니다." });
    return { memo, versions: options.store.listAssistantMemoVersions(memo.id) };
  });

  app.get<{ Params: { id: string; version: string } }>(
    "/api/inbox/:id/versions/:version",
    async (request, reply) => {
      if (!/^[1-9]\d*$/u.test(request.params.version)) {
        throw new InputError("version must be a positive integer");
      }
      const version = Number.parseInt(request.params.version, 10);
      if (!Number.isSafeInteger(version)) {
        throw new InputError("version must be a positive integer");
      }
      const memoVersion = options.store.getAssistantMemoVersion(request.params.id, version);
      if (!memoVersion) {
        return reply.code(404).send({ error: "해당 비서 메모 버전을 찾을 수 없습니다." });
      }
      return { memoVersion };
    },
  );

  app.get("/api/projects", async () => ({
    projects: options.store.listProjects(),
  }));

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const brief = options.store.getProjectBrief(request.params.id);
    if (!brief) return reply.code(404).send({ error: "프로젝트를 찾을 수 없습니다." });
    return { brief };
  });

  app.get("/api/debug/summary", async () => ({
    summary: options.store.debugSummary(),
  }));

  app.get<{ Params: { dataset: string }; Querystring: { limit?: string } }>(
    "/api/debug/data/:dataset",
    async (request) => {
      const dataset = request.params.dataset;
      if (!DEBUG_DATASETS.some((candidate) => candidate.id === dataset)) {
        throw new InputError("debug dataset is not allowed");
      }
      const limit = request.query?.limit === undefined
        ? 50
        : Number.parseInt(request.query.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new InputError("limit must be an integer from 1 to 100");
      }
      return {
        dataset,
        rows: options.store.debugDataset(dataset as DebugDatasetId, limit),
      };
    },
  );

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

  app.get("/api/ai/conversations", async () => ({
    conversations: options.store.listAiConversations().map(publicConversation),
    archivedConversations: options.store.listArchivedAiConversations().map(publicConversation),
  }));

  app.post<{ Body: ConfirmDestructiveBody }>("/api/ai/history/clear", async (request, reply) => {
    requireConfirmation(request.body?.confirmation, "DELETE_AI_HISTORY");
    if (options.store.hasActiveAiJobs()) {
      return reply.code(409).send({ error: "진행 중인 AI 요청을 먼저 취소해주세요." });
    }
    return { deleted: options.store.clearAiHistory() };
  });

  app.post<{ Body: ConfirmDestructiveBody }>("/api/system/reset-data", async (request, reply) => {
    requireConfirmation(request.body?.confirmation, "RESET_ALL_DATA");
    if (options.store.hasActiveAiJobs()) {
      return reply.code(409).send({ error: "진행 중인 AI 요청을 먼저 취소해주세요." });
    }
    return { deleted: options.store.resetAllData() };
  });

  app.post<{ Body: CreateAiConversationBody }>("/api/ai/conversations", async (request, reply) => {
    requireAiConversationService(options.aiConversationService);
    const selection = validateAiSelection(request.body);
    const assistantSlot = optionalAssistantSlot(request.body?.assistantSlot);
    let conversation;
    try {
      conversation = options.store.createAiConversation({
        ...selection,
        ...(assistantSlot ? { assistantSlot } : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("assistant")) {
        throw new AiChatError("활성 비서는 최대 두 명까지 사용할 수 있습니다.", 409);
      }
      throw error;
    }
    return reply.code(201).send({ conversation: publicConversation(conversation) });
  });

  app.get<{ Params: { id: string } }>("/api/ai/conversations/:id", async (request, reply) => {
    const conversation = options.store.getAiConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "AI 대화를 찾을 수 없습니다." });
    return {
      conversation: publicConversation(conversation),
      messages: options.store.listAiMessages(conversation.id),
    };
  });

  app.post<{ Params: { id: string }; Body: ResetAiConversationBody }>(
    "/api/ai/conversations/:id/reset",
    async (request, reply) => {
      requireAiConversationService(options.aiConversationService);
      const current = options.store.getActiveAiConversation(request.params.id);
      if (!current) return reply.code(404).send({ error: "활성 비서를 찾을 수 없습니다." });
      const selection = validateAiSelection({
        provider: request.body?.provider ?? current.provider,
        model: request.body?.model ?? current.defaultModel,
        reasoningEffort: request.body?.reasoningEffort ?? current.defaultReasoningEffort,
      });
      try {
        const conversation = options.store.resetAiConversation(request.params.id, selection);
        return reply.code(201).send({ conversation: publicConversation(conversation) });
      } catch (error) {
        if (error instanceof Error && error.message.includes("active request")) {
          throw new AiChatError("진행 중인 응답을 취소한 뒤 맥락을 초기화하세요.", 409);
        }
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.code(404).send({ error: "활성 비서를 찾을 수 없습니다." });
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { id: string }; Body: CreateAiMessageBody }>(
    "/api/ai/conversations/:id/messages",
    async (request, reply) => {
      const service = requireAiConversationService(options.aiConversationService);
      const conversation = options.store.getActiveAiConversation(request.params.id);
      if (!conversation) return reply.code(404).send({ error: "AI 대화를 찾을 수 없습니다." });
      const selection = validateAiSelection({
        provider: conversation.provider,
        model: request.body?.model ?? conversation.defaultModel,
        reasoningEffort: request.body?.reasoningEffort ?? conversation.defaultReasoningEffort,
      });
      const clientRequestId = requireUuid(request.body?.clientRequestId, "clientRequestId");
      const message = requireNonEmptyText(request.body?.message, "message", 8_000);
      let turn;
      try {
        turn = options.store.createAiTurn({
          conversationId: conversation.id,
          clientRequestId,
          message,
          model: selection.model,
          reasoningEffort: selection.reasoningEffort,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("active request")) {
          throw new AiChatError("이 대화에서 이미 AI 요청을 처리하고 있습니다.", 409);
        }
        if (error instanceof Error && error.message.includes("client request id")) {
          throw new AiChatError("clientRequestId가 이미 다른 요청에 사용되었습니다.", 409);
        }
        throw error;
      }
      service.enqueue(turn.job.id);
      return reply.code(202).send({
        job: publicJob(turn.job),
        userMessage: turn.userMessage,
        assistantMessage: turn.assistantMessage,
        duplicate: turn.duplicate,
      });
    },
  );

  app.get<{ Params: { id: string } }>("/api/ai/jobs/:id/events", async (request, reply) => {
    const service = requireAiConversationService(options.aiConversationService);
    const snapshot = service.snapshot(request.params.id);
    if (!snapshot) return reply.code(404).send({ error: "AI 작업을 찾을 수 없습니다." });

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    let heartbeat: NodeJS.Timeout | null = null;
    const unsubscribe = service.subscribe(request.params.id, (event) => {
      writeAiJobEvent(reply.raw, event);
      if (event.type === "completed" || event.type === "failed") {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        reply.raw.end();
      }
    });
    const currentSnapshot = service.snapshot(request.params.id) ?? snapshot;
    writeSse(reply.raw, "snapshot", publicSnapshot(currentSnapshot));
    if (isTerminalAiJob(currentSnapshot.job.status)) {
      unsubscribe();
      writeTerminalSnapshot(reply.raw, currentSnapshot);
      reply.raw.end();
      return;
    }

    heartbeat = setInterval(() => reply.raw.write(": keep-alive\n\n"), 15_000);
    request.raw.once("close", () => {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post<{ Params: { id: string } }>("/api/ai/jobs/:id/cancel", async (request, reply) => {
    const service = requireAiConversationService(options.aiConversationService);
    const snapshot = service.cancel(request.params.id);
    if (!snapshot) return reply.code(404).send({ error: "AI 작업을 찾을 수 없습니다." });
    return { snapshot: publicSnapshot(snapshot) };
  });

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

function validateAiSelection(body: CreateAiConversationBody | undefined): {
  provider: "codex" | "grok";
  model: string;
  reasoningEffort: string;
} {
  if (typeof body?.provider !== "string") throw new InputError("provider is not supported");
  const provider = AI_PROVIDER_OPTIONS.find((candidate) => candidate.id === body.provider);
  if (!provider) throw new InputError("provider is not supported");
  const model = body.model ?? "default";
  const reasoningEffort = body.reasoningEffort ?? "default";
  if (typeof model !== "string" || !provider.models.some((candidate) => candidate.id === model)) {
    throw new InputError("model is not supported");
  }
  if (
    typeof reasoningEffort !== "string"
    || !provider.reasoningEfforts.some((candidate) => candidate.id === reasoningEffort)
  ) {
    throw new InputError("reasoningEffort is not supported");
  }
  return { provider: provider.id, model, reasoningEffort };
}

function requireAiConversationService(service: AiConversationService | undefined): AiConversationService {
  if (!service) throw new AiChatError("AI conversations are not configured", 503);
  return service;
}

function optionalAssistantSlot(value: unknown): 1 | 2 | undefined {
  if (value === undefined) return undefined;
  if (value !== 1 && value !== 2) throw new InputError("assistantSlot must be 1 or 2");
  return value;
}

function requireUuid(value: unknown, field: string): string {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new InputError(`${field} must be a UUID`);
  }
  return value;
}

function requireConfirmation(value: unknown, expected: string): void {
  if (value !== expected) throw new InputError("destructive action confirmation does not match");
}

function publicConversation(conversation: ReturnType<OpsStore["createAiConversation"]>) {
  const { providerThreadId: _providerThreadId, ...safe } = conversation;
  return safe;
}

function publicJob(job: AiJobSnapshot["job"]) {
  const { clientRequestId: _clientRequestId, ...safe } = job;
  return safe;
}

function publicSnapshot(snapshot: AiJobSnapshot) {
  return {
    job: publicJob(snapshot.job),
    message: snapshot.message,
    ...(snapshot.intakeOutcome ? { intakeOutcome: snapshot.intakeOutcome } : {}),
  };
}

function isTerminalAiJob(status: AiJobSnapshot["job"]["status"]): boolean {
  return ["succeeded", "failed", "cancelled", "interrupted"].includes(status);
}

function writeAiJobEvent(
  raw: { write(chunk: string): unknown },
  event: AiJobStreamEvent,
): void {
  if (event.type === "completed") {
    writeSse(raw, "completed", { ...publicSnapshot(event.snapshot), streamMode: event.streamMode });
  } else if (event.type === "failed") {
    writeSse(raw, "failed", { ...publicSnapshot(event.snapshot), error: event.error });
  } else {
    writeSse(raw, event.type, event);
  }
}

function writeTerminalSnapshot(raw: { write(chunk: string): unknown }, snapshot: AiJobSnapshot): void {
  if (snapshot.job.status === "succeeded") {
    writeSse(raw, "completed", publicSnapshot(snapshot));
  } else {
    writeSse(raw, "failed", {
      ...publicSnapshot(snapshot),
      error: snapshot.job.error ?? "AI 요청이 완료되지 않았습니다.",
    });
  }
}

function writeSse(raw: { write(chunk: string): unknown }, event: string, data: unknown): void {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
