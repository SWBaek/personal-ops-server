import { randomUUID } from "node:crypto";

import {
  providerGranted,
  requestsWorkspaceMutation,
  type AiProviderId,
  type WorkspaceTurnPlan,
} from "../domain/workspace.js";
import { GitWorkspace } from "../infra/git-workspace.js";
import {
  type ActivityEvent,
  type AiJob,
  type AiMessage,
  type OpsStore,
  type WorkspaceReceipt,
} from "../infra/store.js";
import type { ProviderPhase, ProviderProgressEvent, WorkspaceProvider } from "./workspace-provider.js";

export interface AiJobSnapshot {
  job: AiJob;
  message: AiMessage;
  activity: ActivityEvent[];
  receipt: WorkspaceReceipt | null;
}

export interface JobLiveness {
  jobId: string;
  lifecycleStatus: AiJob["status"];
  processState: "starting" | "running" | "stopped";
  phase: ProviderPhase;
  serverTime: string;
  startedAt: string | null;
  lastProviderSignalAt: string | null;
  timeoutAt: string | null;
}

export type AiJobStreamEvent =
  | { type: "status"; status: AiJob["status"] }
  | { type: "activity"; activity: ActivityEvent }
  | { type: "approval_required"; snapshot: AiJobSnapshot }
  | { type: "completed"; snapshot: AiJobSnapshot }
  | { type: "failed"; snapshot: AiJobSnapshot; error: string };

type Listener = (event: AiJobStreamEvent) => void;

export class AiConversationService {
  readonly #store: OpsStore;
  readonly #provider: WorkspaceProvider;
  readonly #workspace: GitWorkspace;
  readonly #listeners = new Map<string, Set<Listener>>();
  readonly #controllers = new Map<string, AbortController>();
  readonly #providerLocks = new Set<AiProviderId>();
  readonly #processStates = new Map<string, JobLiveness["processState"]>();

  constructor(store: OpsStore, provider: WorkspaceProvider, workspace = new GitWorkspace()) {
    this.#store = store;
    this.#provider = provider;
    this.#workspace = workspace;
    this.#store.recoverInterruptedJobs();
  }

  enqueue(jobId: string): void {
    const job = this.#store.getAiJob(jobId);
    const userMessage = job ? this.#store.getAiMessage(job.userMessageId) : null;
    const mutationRequested = Boolean(userMessage && requestsWorkspaceMutation(userMessage.content));
    queueMicrotask(() => void (mutationRequested ? this.#plan(jobId) : this.#answer(jobId)));
  }

  snapshot(jobId: string): AiJobSnapshot | null {
    const job = this.#store.getAiJob(jobId);
    if (!job) return null;
    return {
      job,
      message: this.#store.getAiMessage(job.assistantMessageId)!,
      activity: this.#store.listActivity(job.id),
      receipt: this.#store.listReceipts(100).find((receipt) => receipt.jobId === job.id) ?? null,
    };
  }

  liveness(jobId: string): JobLiveness | null {
    const job = this.#store.getAiJob(jobId);
    if (!job) return null;
    return {
      jobId: job.id,
      lifecycleStatus: job.status,
      processState: terminal(job.status) ? "stopped" : (this.#processStates.get(job.id) ?? "starting"),
      phase: job.currentPhase,
      serverTime: new Date().toISOString(),
      startedAt: job.providerStartedAt,
      lastProviderSignalAt: job.lastProviderSignalAt,
      timeoutAt: job.providerStartedAt
        ? new Date(Date.parse(job.providerStartedAt) + 300_000).toISOString()
        : null,
    };
  }

  subscribe(jobId: string, listener: Listener): () => void {
    let listeners = this.#listeners.get(jobId);
    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(jobId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) this.#listeners.delete(jobId);
    };
  }

  approve(jobId: string): AiJobSnapshot | null {
    const job = this.#store.getAiJob(jobId);
    if (!job) return null;
    if (job.status !== "approval_required" || !job.plan) {
      throw new Error("AI job is not waiting for approval");
    }
    this.#activity(job.id, "approval", "사용자가 사전계획의 Govern 범위를 승인했습니다.");
    this.#store.transitionJob(job.id, "queued", { plan: job.plan, error: null });
    queueMicrotask(() => void this.#execute(job.id));
    return this.snapshot(job.id);
  }

  reject(jobId: string): AiJobSnapshot | null {
    const job = this.#store.getAiJob(jobId);
    if (!job) return null;
    if (job.status !== "approval_required") throw new Error("AI job is not waiting for approval");
    this.#store.transitionJob(job.id, "cancelled", {
      content: "승인하지 않아 WorkOS를 변경하지 않았습니다.",
      error: null,
    });
    const snapshot = this.snapshot(job.id)!;
    this.#emit(job.id, { type: "failed", snapshot, error: "승인이 거절되었습니다." });
    return snapshot;
  }

  cancel(jobId: string): AiJobSnapshot | null {
    const job = this.#store.getAiJob(jobId);
    if (!job) return null;
    if (terminal(job.status)) return this.snapshot(job.id);
    this.#controllers.get(job.id)?.abort();
    if (job.status === "approval_required" || job.status === "queued") {
      this.#store.transitionJob(job.id, "cancelled", {
        content: "요청을 취소했습니다. WorkOS를 변경하지 않았습니다.",
        error: null,
      });
    }
    return this.snapshot(job.id);
  }

  receiptDiff(receiptId: string): string {
    const configuration = this.#requireConfiguration();
    const receipt = this.#store.getReceipt(receiptId);
    if (!receipt) throw new Error("Receipt not found");
    return this.#workspace.diffForCommit(configuration.rootPath, receipt.afterCommit);
  }

  undoReceipt(receiptId: string): WorkspaceReceipt {
    const configuration = this.#requireConfiguration();
    const receipt = this.#store.getReceipt(receiptId);
    if (!receipt) throw new Error("Receipt not found");
    if (receipt.undoneByReceiptId) throw new Error("Receipt was already undone");
    const latest = this.#store.listReceipts(1)[0];
    if (!latest || latest.id !== receipt.id) throw new Error("Only the latest receipt can be undone");
    const validation = this.#workspace.validate(configuration.rootPath);
    if (!validation.valid) throw new Error(validation.errors.join("; "));
    if (validation.dirty) throw new Error("WorkOS must be clean before Undo");
    const before = this.#workspace.head(configuration.rootPath);
    if (before !== receipt.afterCommit) throw new Error("WorkOS HEAD diverged after this receipt");
    const after = this.#workspace.undo(configuration.rootPath, receipt.afterCommit);
    const undoPlan: WorkspaceTurnPlan = {
      mode: "execute",
      summary: `Undo receipt ${receipt.id}`,
      reply: "",
      risk: "low",
      expectedPaths: receipt.changedPaths,
      operations: ["revert latest application receipt"],
      capabilities: ["local"],
      rationale: "The owner explicitly requested Undo for the latest receipt.",
      requiresApproval: false,
    };
    const undoReceipt = this.#store.createReceipt({
      provider: receipt.provider,
      jobId: null,
      requestSummary: `Undo: ${receipt.requestSummary}`,
      plan: undoPlan,
      beforeCommit: before,
      afterCommit: after,
      changedPaths: receipt.changedPaths,
      semanticSummary: `Reverted receipt ${receipt.id}`,
      undoOfReceiptId: receipt.id,
    });
    this.#store.markReceiptUndone(receipt.id, undoReceipt.id);
    return undoReceipt;
  }

  async close(): Promise<void> {
    for (const controller of this.#controllers.values()) controller.abort();
    this.#controllers.clear();
  }

  async #answer(jobId: string): Promise<void> {
    const job = this.#store.getAiJob(jobId);
    if (!job || job.status !== "queued") return;
    if (!this.#acquire(job.provider)) {
      this.#fail(job, "선택한 provider가 이미 다른 요청을 처리하고 있습니다.");
      return;
    }
    const controller = new AbortController();
    this.#controllers.set(job.id, controller);
    try {
      const configuration = this.#requireConfiguration();
      if (!providerGranted(configuration, job.provider)) {
        throw new Error(`${job.provider}의 WorkOS 접근 권한이 설정에서 허용되지 않았습니다.`);
      }
      const validation = this.#workspace.validate(configuration.rootPath);
      if (!validation.valid) throw new Error(validation.errors.join("; "));
      const userMessage = this.#store.getAiMessage(job.userMessageId)!;
      this.#store.transitionJob(job.id, "planning", { plan: null, error: null });
      this.#emit(job.id, { type: "status", status: "planning" });
      this.#activity(job.id, "reading", `${job.provider}가 WorkOS에서 직접 답변합니다.`);
      const answer = await this.#provider.answer({
        provider: job.provider,
        model: job.model,
        reasoningEffort: job.reasoningEffort,
        rootPath: configuration.rootPath,
        message: userMessage.content,
        profile: this.#store.getAssistantProfile(),
        signal: controller.signal,
        onProgress: this.#providerProgress(job.id),
      });
      this.#store.transitionJob(job.id, "succeeded", {
        plan: null,
        content: answer,
        error: null,
      });
      this.#activity(job.id, "validation", "CLI 최종 답변을 그대로 전달했으며 WorkOS 변경은 없습니다.");
      this.#emit(job.id, { type: "completed", snapshot: this.snapshot(job.id)! });
    } catch (error) {
      this.#fail(job, safeError(error));
    } finally {
      this.#controllers.delete(job.id);
      this.#release(job.provider);
    }
  }

  async #plan(jobId: string): Promise<void> {
    const job = this.#store.getAiJob(jobId);
    if (!job || job.status !== "queued") return;
    if (!this.#acquire(job.provider)) {
      this.#fail(job, "선택한 provider가 이미 다른 요청을 처리하고 있습니다.");
      return;
    }
    const controller = new AbortController();
    this.#controllers.set(job.id, controller);
    try {
      const configuration = this.#requireConfiguration();
      if (!providerGranted(configuration, job.provider)) {
        throw new Error(`${job.provider}의 WorkOS 접근 권한이 설정에서 허용되지 않았습니다.`);
      }
      const validation = this.#workspace.validate(configuration.rootPath);
      if (!validation.valid) throw new Error(validation.errors.join("; "));
      const userMessage = this.#store.getAiMessage(job.userMessageId)!;
      this.#store.transitionJob(job.id, "planning");
      this.#emit(job.id, { type: "status", status: "planning" });
      this.#activity(job.id, "planning", `${job.provider}가 WorkOS 규칙과 필요한 근거를 읽고 사전계획을 작성합니다.`);
      const plan = await this.#provider.plan({
        provider: job.provider,
        model: job.model,
        reasoningEffort: job.reasoningEffort,
        rootPath: configuration.rootPath,
        message: userMessage.content,
        profile: this.#store.getAssistantProfile(),
        signal: controller.signal,
        onProgress: this.#providerProgress(job.id),
      });
      if (plan.mode === "observe") {
        const answer = plan.reply || "WorkOS를 확인했지만 답변을 만들지 못했습니다.";
        this.#store.transitionJob(job.id, "succeeded", { plan, content: answer, error: null });
        this.#activity(job.id, "validation", "읽기 전용 요청으로 완료했으며 WorkOS 변경은 없습니다.");
        this.#emit(job.id, { type: "completed", snapshot: this.snapshot(job.id)! });
        return;
      }
      if (plan.requiresApproval) {
        this.#store.transitionJob(job.id, "approval_required", {
          plan,
          content: plan.reply || "실행 전에 승인할 범위를 확인해주세요.",
          error: null,
        });
        this.#activity(job.id, "approval", `승인 필요: ${plan.rationale}`);
        this.#emit(job.id, { type: "approval_required", snapshot: this.snapshot(job.id)! });
        return;
      }
      this.#store.transitionJob(job.id, "queued", { plan, content: plan.reply, error: null });
    } catch (error) {
      this.#fail(job, safeError(error));
      return;
    } finally {
      this.#controllers.delete(job.id);
      this.#release(job.provider);
    }
    await this.#execute(job.id);
  }

  async #execute(jobId: string): Promise<void> {
    const job = this.#store.getAiJob(jobId);
    if (!job || !job.plan || !["queued", "approval_required"].includes(job.status)) return;
    if (!this.#acquire(job.provider)) {
      this.#fail(job, "선택한 provider가 이미 다른 요청을 처리하고 있습니다.");
      return;
    }
    const controller = new AbortController();
    this.#controllers.set(job.id, controller);
    let providerStarted = false;
    try {
      const configuration = this.#requireConfiguration();
      if (!providerGranted(configuration, job.provider)) {
        throw new Error(`${job.provider}의 WorkOS 접근 권한이 철회되었습니다.`);
      }
      const validation = this.#workspace.validate(configuration.rootPath);
      if (!validation.valid) throw new Error(validation.errors.join("; "));
      if (validation.dirty) {
        throw new Error("WorkOS에 미커밋 변경이 있어 AI 쓰기와 자동 commit을 차단했습니다.");
      }
      const beforeCommit = this.#workspace.head(configuration.rootPath);
      const userMessage = this.#store.getAiMessage(job.userMessageId)!;
      this.#store.transitionJob(job.id, "executing", { plan: job.plan, error: null });
      this.#emit(job.id, { type: "status", status: "executing" });
      this.#activity(job.id, "editing", `${job.provider}가 승인된 범위 안에서 실제 WorkOS를 수정합니다.`);
      providerStarted = true;
      const result = await this.#provider.execute({
        provider: job.provider,
        model: job.model,
        reasoningEffort: job.reasoningEffort,
        rootPath: configuration.rootPath,
        message: userMessage.content,
        profile: this.#store.getAssistantProfile(),
        plan: job.plan,
        signal: controller.signal,
        onProgress: this.#providerProgress(job.id),
      });
      const changedPaths = this.#workspace.changedPaths(configuration.rootPath);
      if (changedPaths.length === 0) {
        this.#store.transitionJob(job.id, "succeeded", {
          plan: job.plan,
          content: result.reply,
          error: null,
        });
        this.#activity(job.id, "validation", "검증 결과 파일 변경이 없어 commit을 만들지 않았습니다.");
        this.#emit(job.id, { type: "completed", snapshot: this.snapshot(job.id)! });
        return;
      }
      const unexpected = changedPaths.filter((path) => !pathPlanned(path, job.plan!.expectedPaths));
      if (unexpected.length > 0 || (job.plan.risk === "low" && changedPaths.length > 5)) {
        const detail = unexpected.length > 0
          ? `계획에 없던 변경: ${unexpected.join(", ")}`
          : "저위험 계획이 5개를 초과하는 파일을 변경했습니다.";
        this.#store.transitionJob(job.id, "needs_review", {
          plan: job.plan,
          content: `${result.reply}\n\n⚠️ ${detail} 자동 commit하지 않았으며 추가 쓰기를 차단했습니다.`,
          error: detail,
        });
        this.#activity(job.id, "warning", detail);
        this.#emit(job.id, { type: "failed", snapshot: this.snapshot(job.id)!, error: detail });
        return;
      }
      this.#activity(job.id, "validation", result.validation.join(" · ") || "변경 파일 검증을 완료했습니다.");
      const receiptId = randomUUID();
      this.#setPhase(job.id, "committing");
      const afterCommit = this.#workspace.commit(
        configuration.rootPath,
        changedPaths,
        receiptId,
        result.semanticSummary,
      );
      const receipt = this.#store.createReceipt({
        id: receiptId,
        jobId: job.id,
        provider: job.provider,
        requestSummary: job.plan.summary,
        plan: job.plan,
        beforeCommit,
        afterCommit,
        changedPaths,
        semanticSummary: result.semanticSummary,
        undoOfReceiptId: null,
      });
      this.#activity(job.id, "git", `${changedPaths.length}개 파일을 receipt ${receipt.id}로 commit했습니다.`);
      this.#store.transitionJob(job.id, "succeeded", {
        plan: job.plan,
        content: result.reply,
        receiptId: receipt.id,
        error: null,
      });
      this.#emit(job.id, { type: "completed", snapshot: this.snapshot(job.id)! });
    } catch (error) {
      const configuration = this.#store.getWorkspaceConfiguration();
      if (configuration && providerStarted) {
        try {
          const dirty = this.#workspace.changedPaths(configuration.rootPath);
          if (dirty.length > 0) {
            const detail = `실행이 중단되었지만 ${dirty.length}개 미커밋 변경이 남아 있습니다.`;
            this.#store.transitionJob(job.id, "needs_review", {
              plan: job.plan,
              content: `${safeError(error)}\n\n⚠️ ${detail}`,
              error: detail,
            });
            this.#activity(job.id, "warning", detail);
            this.#emit(job.id, { type: "failed", snapshot: this.snapshot(job.id)!, error: detail });
            return;
          }
        } catch {
          // Fall through to a normal failure when the workspace cannot be inspected.
        }
      }
      this.#fail(job, safeError(error));
    } finally {
      this.#controllers.delete(job.id);
      this.#release(job.provider);
    }
  }

  #requireConfiguration() {
    const configuration = this.#store.getWorkspaceConfiguration();
    if (!configuration) throw new Error("WorkOS 초기 설정이 필요합니다.");
    return configuration;
  }

  #activity(jobId: string, kind: ActivityEvent["kind"], summary: string): void {
    const activity = this.#store.addActivity(jobId, kind, summary);
    this.#emit(jobId, { type: "activity", activity });
  }

  #providerProgress(jobId: string): (event: ProviderProgressEvent) => void {
    return (event) => {
      if (event.type === "started") {
        this.#processStates.set(jobId, "running");
        this.#store.updateProviderProgress(jobId, {
          providerStartedAt: event.at,
          lastProviderSignalAt: event.at,
          currentPhase: "starting",
        });
        return;
      }
      if (event.type === "stopped") {
        this.#processStates.set(jobId, "stopped");
        return;
      }
      const result = this.#store.updateProviderProgress(jobId, {
        lastProviderSignalAt: event.at,
        currentPhase: event.phase,
      });
      if (result.phaseChanged) this.#activity(jobId, phaseKind(event.phase), phaseSummary(event.phase));
    };
  }

  #setPhase(jobId: string, phase: ProviderPhase): void {
    const result = this.#store.updateProviderProgress(jobId, {
      lastProviderSignalAt: new Date().toISOString(),
      currentPhase: phase,
    });
    if (result.phaseChanged) this.#activity(jobId, phaseKind(phase), phaseSummary(phase));
  }

  #fail(job: AiJob, message: string): void {
    const current = this.#store.getAiJob(job.id);
    if (!current || terminal(current.status)) return;
    this.#store.transitionJob(job.id, controllerCancelled(this.#controllers.get(job.id)) ? "cancelled" : "failed", {
      content: message,
      error: message,
    });
    const snapshot = this.snapshot(job.id)!;
    this.#emit(job.id, { type: "failed", snapshot, error: message });
  }

  #emit(jobId: string, event: AiJobStreamEvent): void {
    for (const listener of this.#listeners.get(jobId) ?? []) listener(event);
  }

  #acquire(provider: AiProviderId): boolean {
    if (this.#providerLocks.has(provider)) return false;
    this.#providerLocks.add(provider);
    return true;
  }

  #release(provider: AiProviderId): void {
    this.#providerLocks.delete(provider);
  }
}

function pathPlanned(path: string, expectedPaths: string[]): boolean {
  if (expectedPaths.length === 0) return false;
  return expectedPaths.some((expected) => path === expected || path.startsWith(`${expected.replace(/\/$/u, "")}/`));
}

function terminal(status: AiJob["status"]): boolean {
  return ["succeeded", "failed", "cancelled", "interrupted", "needs_review"].includes(status);
}

function controllerCancelled(controller: AbortController | undefined): boolean {
  return controller?.signal.aborted ?? false;
}

function phaseKind(phase: ProviderPhase): ActivityEvent["kind"] {
  if (phase === "checking_workos") return "reading";
  if (phase === "committing") return "git";
  return "validation";
}

function phaseSummary(phase: ProviderPhase): string {
  return {
    starting: "CLI 프로세스를 시작했습니다.",
    checking_workos: "WorkOS 확인 단계로 전환했습니다.",
    composing: "답변 구성 단계로 전환했습니다.",
    validating: "결과 검증 단계로 전환했습니다.",
    committing: "로컬 receipt commit 단계로 전환했습니다.",
  }[phase];
}

function safeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "AI 요청을 완료하지 못했습니다.";
}
