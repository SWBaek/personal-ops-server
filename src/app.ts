import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AI_PROVIDER_OPTIONS,
  AiChatError,
  validateAiSelection,
} from "./ai/chat-service.js";
import { getProviderStatuses } from "./ai/provider-status.js";
import {
  type AiConversationService,
  type AiJobSnapshot,
  type AiJobStreamEvent,
} from "./ai/streaming-service.js";
import { validateAssistantProfileInput } from "./domain/assistant-profile.js";
import { InputError, requireNonEmptyText } from "./domain/validation.js";
import { GitWorkspace } from "./infra/git-workspace.js";
import { type OpsStore } from "./infra/store.js";

interface BuildAppOptions {
  store: OpsStore;
  aiConversationService: AiConversationService;
  workspace: GitWorkspace;
  publicDir?: string;
  workspaceSeed?: string | null;
  environment?: "development" | "production" | "test";
}

const MARKED_BROWSER_MODULE = fileURLToPath(import.meta.resolve("marked"));
const DOMPURIFY_BROWSER_MODULE = fileURLToPath(import.meta.resolve("dompurify"));

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(fastifyStatic, {
    root: options.publicDir ?? resolve("public"),
    prefix: "/",
  });

  app.get("/vendor/marked.js", async (_request, reply) =>
    reply
      .type("text/javascript; charset=utf-8")
      .header("cache-control", "public, max-age=86400")
      .send(createReadStream(MARKED_BROWSER_MODULE)));

  app.get("/vendor/dompurify.js", async (_request, reply) =>
    reply
      .type("text/javascript; charset=utf-8")
      .header("cache-control", "public, max-age=86400")
      .send(createReadStream(DOMPURIFY_BROWSER_MODULE)));

  app.get("/api/health", async () => ({
    ok: true,
    build: "workos-liveness-v1",
    now: new Date().toISOString(),
  }));

  app.get("/api/system/runtime", async () => ({
    runtime: {
      environment: options.environment ?? "test",
      mode: "workos-native",
      build: "workos-liveness-v1",
    },
  }));

  app.get("/api/workspace/status", async () => {
    const configuration = options.store.getWorkspaceConfiguration();
    if (!configuration) {
      return {
        configured: false,
        suggestedRoot: options.workspaceSeed ?? null,
        configuration: null,
        validation: null,
      };
    }
    return {
      configured: true,
      suggestedRoot: null,
      configuration,
      validation: options.workspace.validate(configuration.rootPath),
    };
  });

  app.post<{
    Body: { rootPath?: unknown; codexGranted?: unknown; grokGranted?: unknown };
  }>("/api/workspace/configuration/proposals", async (request, reply) => {
    if (options.store.hasActiveAiJobs()) {
      return reply.code(409).send({ error: "AI 작업이 진행 중일 때는 WorkOS 설정을 바꿀 수 없습니다." });
    }
    const rootPath = requireNonEmptyText(request.body?.rootPath, "rootPath", 2_000);
    const codexGranted = requireBoolean(request.body?.codexGranted, "codexGranted");
    const grokGranted = requireBoolean(request.body?.grokGranted, "grokGranted");
    if (!codexGranted && !grokGranted) {
      throw new InputError("At least one provider must be granted WorkOS access");
    }
    const validation = options.workspace.validate(rootPath);
    const proposal = options.store.createWorkspaceConfigProposal({
      rootPath: validation.rootPath,
      codexGranted,
      grokGranted,
      validation,
    });
    return reply.code(201).send({ proposal });
  });

  app.post<{ Params: { id: string }; Body: { confirmation?: unknown } }>(
    "/api/workspace/configuration/proposals/:id/confirm",
    async (request, reply) => {
      requireConfirmation(request.body?.confirmation, "CONNECT_WORKOS");
      if (options.store.hasActiveAiJobs()) {
        return reply.code(409).send({ error: "AI 작업이 진행 중일 때는 WorkOS 설정을 바꿀 수 없습니다." });
      }
      const proposal = options.store.getWorkspaceConfigProposal(request.params.id);
      if (!proposal) return reply.code(404).send({ error: "WorkOS 설정 제안을 찾을 수 없습니다." });
      const currentValidation = options.workspace.validate(proposal.rootPath);
      if (!currentValidation.valid) {
        return reply.code(409).send({ error: currentValidation.errors.join("; "), validation: currentValidation });
      }
      const configuration = options.store.confirmWorkspaceConfigProposal(proposal.id);
      return { configuration, validation: currentValidation };
    },
  );

  app.get("/api/assistant/profile", async () => ({ profile: options.store.getAssistantProfile() }));
  app.put<{ Body: Record<string, unknown> }>("/api/assistant/profile", async (request, reply) => {
    requireConfirmation(request.body?.confirmation, "UPDATE_ASSISTANT_PROFILE");
    if (options.store.hasActiveAiJobs()) {
      return reply.code(409).send({ error: "AI 작업이 진행 중일 때는 비서 설정을 바꿀 수 없습니다." });
    }
    return { profile: options.store.updateAssistantProfile(validateAssistantProfileInput(request.body)) };
  });

  app.get("/api/ai/providers", async () => ({ providers: await getProviderStatuses() }));
  app.get("/api/ai/options", async () => ({ providers: AI_PROVIDER_OPTIONS }));

  app.get("/api/ai/conversations", async () => ({
    conversations: options.store.listAiConversations(),
  }));

  app.post<{ Body: Record<string, unknown> }>("/api/ai/conversations", async (request, reply) => {
    const selection = validateAiSelection(request.body);
    const configuration = options.store.getWorkspaceConfiguration();
    if (!configuration) throw new AiChatError("WorkOS 초기 설정이 필요합니다.", 409);
    const conversation = options.store.createAiConversation(selection);
    return reply.code(201).send({ conversation });
  });

  app.get<{ Params: { id: string } }>("/api/ai/conversations/:id", async (request, reply) => {
    const conversation = options.store.getAiConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "AI 대화를 찾을 수 없습니다." });
    return {
      conversation,
      messages: options.store.listAiMessages(conversation.id),
    };
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/ai/conversations/:id/provider",
    async (request, reply) => {
      const selection = validateAiSelection(request.body);
      try {
        return { conversation: options.store.switchConversationProvider(request.params.id, selection) };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.code(404).send({ error: "AI 대화를 찾을 수 없습니다." });
        }
        throw error;
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { clientRequestId?: unknown; message?: unknown; model?: unknown; reasoningEffort?: unknown };
  }>("/api/ai/conversations/:id/messages", async (request, reply) => {
    const conversation = options.store.getAiConversation(request.params.id);
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
        throw new AiChatError("이미 다른 AI 요청을 처리하고 있습니다.", 409);
      }
      throw error;
    }
    options.aiConversationService.enqueue(turn.job.id);
    return reply.code(202).send(turn);
  });

  app.get<{ Params: { id: string } }>("/api/ai/jobs/:id/events", async (request, reply) => {
    const snapshot = options.aiConversationService.snapshot(request.params.id);
    if (!snapshot) return reply.code(404).send({ error: "AI 작업을 찾을 수 없습니다." });
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    let heartbeat: NodeJS.Timeout | null = null;
    const unsubscribe = options.aiConversationService.subscribe(request.params.id, (event) => {
      writeJobEvent(reply.raw, event);
      if (terminal(event)) {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        reply.raw.end();
      }
    });
    writeSse(reply.raw, "snapshot", publicSnapshot(snapshot));
    writeSse(reply.raw, "liveness", options.aiConversationService.liveness(request.params.id));
    if (snapshot.job.status === "approval_required") {
      writeSse(reply.raw, "approval_required", publicSnapshot(snapshot));
      unsubscribe();
      reply.raw.end();
      return;
    }
    if (isTerminalStatus(snapshot.job.status)) {
      writeSse(reply.raw, snapshot.job.status === "succeeded" ? "completed" : "failed", publicSnapshot(snapshot));
      unsubscribe();
      reply.raw.end();
      return;
    }
    heartbeat = setInterval(() => {
      const liveness = options.aiConversationService.liveness(request.params.id);
      if (liveness) writeSse(reply.raw, "liveness", liveness);
    }, 5_000);
    request.raw.once("close", () => {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post<{ Params: { id: string } }>("/api/ai/jobs/:id/approve", async (request, reply) => {
    const snapshot = options.aiConversationService.approve(request.params.id);
    if (!snapshot) return reply.code(404).send({ error: "AI 작업을 찾을 수 없습니다." });
    return { snapshot: publicSnapshot(snapshot) };
  });

  app.post<{ Params: { id: string } }>("/api/ai/jobs/:id/reject", async (request, reply) => {
    const snapshot = options.aiConversationService.reject(request.params.id);
    if (!snapshot) return reply.code(404).send({ error: "AI 작업을 찾을 수 없습니다." });
    return { snapshot: publicSnapshot(snapshot) };
  });

  app.post<{ Params: { id: string } }>("/api/ai/jobs/:id/cancel", async (request, reply) => {
    const snapshot = options.aiConversationService.cancel(request.params.id);
    if (!snapshot) return reply.code(404).send({ error: "AI 작업을 찾을 수 없습니다." });
    return { snapshot: publicSnapshot(snapshot) };
  });

  app.get("/api/workspace/receipts", async () => ({
    receipts: options.store.listReceipts(),
  }));

  app.get<{ Params: { id: string } }>("/api/workspace/receipts/:id/diff", async (request, reply) => {
    try {
      return { diff: options.aiConversationService.receiptDiff(request.params.id) };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ error: "Receipt를 찾을 수 없습니다." });
      }
      throw error;
    }
  });

  app.post<{ Params: { id: string }; Body: { confirmation?: unknown } }>(
    "/api/workspace/receipts/:id/undo",
    async (request, reply) => {
      requireConfirmation(request.body?.confirmation, "UNDO_LATEST_RECEIPT");
      if (options.store.hasActiveAiJobs()) {
        return reply.code(409).send({ error: "AI 작업이 진행 중일 때는 Undo할 수 없습니다." });
      }
      return { receipt: options.aiConversationService.undoReceipt(request.params.id) };
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
      : message.includes("must") || message.includes("not supported")
        ? 400
        : message.includes("active") || message.includes("clean") || message.includes("diverged")
          ? 409
          : 500;
    if (statusCode >= 500) app.log.error(error);
    void reply.code(statusCode).send({ error: message });
  });

  return app;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new InputError(`${field} must be a boolean`);
  return value;
}

function requireUuid(value: unknown, field: string): string {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new InputError(`${field} must be a UUID`);
  }
  return value;
}

function requireConfirmation(value: unknown, expected: string): void {
  if (value !== expected) throw new InputError("confirmation does not match");
}

function publicSnapshot(snapshot: AiJobSnapshot) {
  const { clientRequestId: _clientRequestId, ...job } = snapshot.job;
  return { ...snapshot, job };
}

function writeJobEvent(raw: { write(chunk: string): unknown }, event: AiJobStreamEvent): void {
  if (event.type === "completed" || event.type === "approval_required") {
    writeSse(raw, event.type, publicSnapshot(event.snapshot));
  } else if (event.type === "failed") {
    writeSse(raw, "failed", { ...publicSnapshot(event.snapshot), error: event.error });
  } else {
    writeSse(raw, event.type, event);
  }
}

function writeSse(raw: { write(chunk: string): unknown }, event: string, data: unknown): void {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function terminal(event: AiJobStreamEvent): boolean {
  return event.type === "completed" || event.type === "failed" || event.type === "approval_required";
}

function isTerminalStatus(status: AiJobSnapshot["job"]["status"]): boolean {
  return ["succeeded", "failed", "cancelled", "interrupted", "needs_review"].includes(status);
}
