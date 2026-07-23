import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  normalizeProjectAlias,
  resolveProjectMention,
  type ProjectProjectionDraft,
} from "../src/domain/projects.js";
import { validateGroundingReferences } from "../src/domain/intake.js";
import { OpsStore, type CreatedAiTurn } from "../src/infra/store.js";

const alphaProjection: ProjectProjectionDraft = {
  projectName: "알파 프로젝트",
  aliases: ["알파", "ALPHA"],
  outcome: "안전하게 알파를 배포한다.",
  currentState: "배포 일정을 확인하는 중이다.",
  actions: [{
    title: "배포 일정을 확인한다.",
    status: "open",
    plannedOn: "2026-07-24",
    dueOn: "2026-07-27",
  }],
  decisions: [{ text: "점진적으로 배포한다.", decidedOn: "2026-07-23" }],
  dependencies: [{ text: "승인 대기", status: "open" }],
  risks: [{ text: "일정 지연 가능성", status: "open" }],
  meetings: [{ title: "알파 준비 회의", scheduledAt: "2026-07-24T09:00:00+09:00", status: "planned" }],
  judgments: [{ question: "배포 범위를 어디까지 할까?", status: "open" }],
};

test("project aliases use NFKC normalization and longest exact phrase matching", () => {
  assert.equal(normalizeProjectAlias("  ＡＬＰＨＡ   Project  "), "alpha project");
  const aliases = [
    { projectId: "short", projectName: "알파", alias: "알파", normalizedAlias: "알파" },
    {
      projectId: "long",
      projectName: "알파 프로젝트",
      alias: "알파 프로젝트",
      normalizedAlias: "알파 프로젝트",
    },
  ];
  const resolved = resolveProjectMention("알파 프로젝트 현황을 알려줘", aliases);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.projectId, "long");

  const ambiguous = resolveProjectMention("공유 프로젝트 현황", [
    { projectId: "one", projectName: "하나", alias: "공유 프로젝트", normalizedAlias: "공유 프로젝트" },
    { projectId: "two", projectName: "둘", alias: "공유 프로젝트", normalizedAlias: "공유 프로젝트" },
  ]);
  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(ambiguous.candidateProjectIds, ["one", "two"]);
});

test("confirming a memo creates one project and all snapshots atomically without retry duplicates", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversationId = createConversation(store);
    const proposal = proposeMemo(store, conversationId, "알파 프로젝트를 정리해줘", alphaProjection, 1);
    const proposalId = proposal.outcome.createdProposalId!;
    const confirmation = confirmProposal(store, conversationId, proposalId, 2);
    assert.equal(confirmation.outcome.confirmedMemoIds.length, 1);
    assert.equal(store.listProjects().length, 1);
    const brief = store.getProjectBrief(store.listProjects()[0]!.id)!;
    assert.equal(brief.coverage, "complete");
    assert.equal(brief.sections.openActions.length, 1);
    assert.equal(brief.sections.decisions.length, 1);
    assert.equal(brief.sections.dependencies.length, 1);
    assert.equal(brief.sections.risks.length, 1);
    assert.equal(brief.sections.meetings.length, 1);
    assert.equal(brief.sections.judgments.length, 1);
    assert.ok(Object.values(brief.sections).flat().every((item) => item.referenceIds.length > 0));

    assert.equal(store.completeAssistantTurn(confirmation.turn.job.id, completion({
      reply: "중복 확인",
      resolutions: [{ proposalId, action: "confirm" }],
      memoProposal: null,
      grounding: { status: "not_applicable", citedReferenceIds: [], conflicts: [] },
    })), null);
    assert.equal(store.listProjects().length, 1);
    assert.equal(store.debugDataset("action_snapshots").length, 1);

    store.rebuildProjectSnapshots();
    assert.equal(store.debugDataset("action_snapshots").length, 1);
    assert.equal(store.getProjectBrief(brief.project.id)?.sections.decisions.length, 1);

    store.clearAiHistory();
    assert.equal(store.listProjects().length, 1);
    assert.equal(store.getProjectBrief(brief.project.id)?.sections.openActions.length, 1);

    store.resetAllData();
    assert.equal(store.listProjects().length, 0);
    assert.equal(store.debugDataset("project_snapshots").length, 0);
    assert.equal(store.debugDataset("memo_projection_statuses").length, 0);
  } finally {
    store.close();
  }
});

test("memo revisions expose only current-version snapshots while retaining pinned provenance", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversationId = createConversation(store);
    const created = proposeMemo(store, conversationId, "알파 프로젝트", alphaProjection, 1);
    const confirmed = confirmProposal(store, conversationId, created.outcome.createdProposalId!, 2);
    const memoId = confirmed.outcome.confirmedMemoIds[0]!;
    const revisedProjection: ProjectProjectionDraft = {
      ...alphaProjection,
      currentState: "배포 승인을 받았다.",
      actions: [{
        title: "배포를 실행한다.",
        status: "open",
        plannedOn: "2026-07-28",
        dueOn: null,
      }],
    };
    const revision = proposeMemo(
      store,
      conversationId,
      "승인을 받았고 다음 주에 배포한다.",
      revisedProjection,
      3,
      memoId,
    );
    confirmProposal(store, conversationId, revision.outcome.createdProposalId!, 4);

    const project = store.listProjects()[0]!;
    const brief = store.getProjectBrief(project.id)!;
    assert.deepEqual(brief.sections.currentState.map((item) => item.text), ["배포 승인을 받았다."]);
    assert.deepEqual(brief.sections.openActions.map((item) => item.text), ["배포를 실행한다."]);
    assert.ok(brief.references.every((reference) => reference.version === 2));
    assert.equal(store.listAssistantMemoVersions(memoId).length, 2);
    const snapshots = store.debugDataset("action_snapshots", 10);
    assert.equal(snapshots.length, 2);
    assert.deepEqual(new Set(snapshots.map((row) => row.active)), new Set([0, 1]));

    const context = store.buildAssistantTurnContext(
      conversationId,
      "알파 프로젝트 현황을 알려줘",
    );
    assert.throws(() => validateGroundingReferences({
      status: "grounded",
      citedReferenceIds: [`memo:${memoId}:v1`],
      conflicts: [],
    }, context.groundingSources.map(
      (source) => `memo:${source.memoId}:v${source.version}`,
    )), /unavailable reference/);
    assert.throws(() => validateGroundingReferences({
      status: "grounded",
      citedReferenceIds: ["memo:00000000-0000-4000-8000-000000000999:v1"],
      conflicts: [],
    }, context.groundingSources.map(
      (source) => `memo:${source.memoId}:v${source.version}`,
    )), /unavailable reference/);
  } finally {
    store.close();
  }
});

test("sequential migration preserves an existing memo as unprojected and makes coverage partial", () => {
  const directory = mkdtempSync(join(tmpdir(), "personal-ops-migration-"));
  const filename = join(directory, "ops.db");
  try {
    const initial = new OpsStore(filename);
    const conversationId = createConversation(initial);
    const proposal = proposeMemo(initial, conversationId, "일반 메모", null, 1);
    const confirmed = confirmProposal(initial, conversationId, proposal.outcome.createdProposalId!, 2);
    const memoId = confirmed.outcome.confirmedMemoIds[0]!;
    initial.close();

    const db = new DatabaseSync(filename);
    db.exec(`
      DELETE FROM assistant_memo_search;
      DELETE FROM memo_projection_statuses;
      UPDATE assistant_memo_versions SET projection_json = NULL;
      PRAGMA user_version = 1;
    `);
    db.close();

    const migrated = new OpsStore(filename);
    try {
      assert.equal(migrated.getAssistantMemo(memoId)?.projectionStatus, "unprojected");
      assert.equal(migrated.searchAssistantMemos("일반 메모")[0]?.memoId, memoId);
      const projectConversationId = createConversation(migrated);
      const projectProposal = proposeMemo(
        migrated,
        projectConversationId,
        "알파 프로젝트",
        alphaProjection,
        3,
      );
      confirmProposal(
        migrated,
        projectConversationId,
        projectProposal.outcome.createdProposalId!,
        4,
      );
      assert.equal(migrated.listProjects()[0]?.coverage, "partial");
      const pragma = new DatabaseSync(filename);
      const version = pragma.prepare("PRAGMA user_version").get() as { user_version: number };
      pragma.close();
      assert.equal(version.user_version, 2);
    } finally {
      migrated.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("alias collisions preserve the memo and leave only its projection unresolved", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversationId = createConversation(store);
    const first = proposeMemo(store, conversationId, "알파 프로젝트", alphaProjection, 1);
    confirmProposal(store, conversationId, first.outcome.createdProposalId!, 2);

    const collidingProjection: ProjectProjectionDraft = {
      ...alphaProjection,
      projectName: "베타 프로젝트",
      aliases: ["알파"],
    };
    const second = proposeMemo(store, conversationId, "베타 프로젝트", collidingProjection, 3);
    const confirmed = confirmProposal(store, conversationId, second.outcome.createdProposalId!, 4);
    const memoId = confirmed.outcome.confirmedMemoIds[0]!;

    assert.equal(store.listAssistantMemos().length, 2);
    assert.equal(store.listProjects().length, 1);
    assert.equal(store.getAssistantMemo(memoId)?.projectionStatus, "unresolved");
  } finally {
    store.close();
  }
});

test("project SQL retrieval includes more than five facts and records deterministic audit data", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversationId = createConversation(store);
    const actions: ProjectProjectionDraft["actions"] = Array.from({ length: 8 }, (_, index) => ({
      title: `Action ${index + 1}`,
      status: "open",
      plannedOn: null,
      dueOn: null,
    }));
    actions.push({
      title: "이미 끝난 Action",
      status: "completed",
      plannedOn: null,
      dueOn: null,
    });
    const projection: ProjectProjectionDraft = {
      ...alphaProjection,
      actions,
    };
    const proposal = proposeMemo(store, conversationId, "알파 프로젝트 actions", projection, 1);
    confirmProposal(store, conversationId, proposal.outcome.createdProposalId!, 2);
    const context = store.buildAssistantTurnContext(conversationId, "알파 프로젝트 Action을 전부 알려줘");
    const grokConversation = store.createAiConversation({
      provider: "grok",
      model: "default",
      reasoningEffort: "default",
    });
    const grokContext = store.buildAssistantTurnContext(
      grokConversation.id,
      "알파 프로젝트 Action을 전부 알려줘",
    );

    assert.equal(context.plan.intent, "project_actions");
    assert.equal(context.plan.exhaustive, true);
    assert.equal(context.coverage, "complete");
    assert.equal(context.projectBrief?.sections.openActions.length, 8);
    assert.deepEqual(
      { ...grokContext.plan, asOf: "<time>" },
      { ...context.plan, asOf: "<time>" },
    );
    assert.deepEqual(
      grokContext.projectBrief?.references.map((reference) => reference.referenceId),
      context.projectBrief?.references.map((reference) => reference.referenceId),
    );
    assert.equal(store.debugDataset("retrieval_runs")[0]?.coverage, "complete");
    const actionCandidates = store.debugDataset("retrieval_candidates", 100)
      .filter((row) =>
        row.retrieval_run_id === context.retrievalRunId
        && row.domain_table === "action_snapshots");
    assert.equal(actionCandidates.length, 9);
    assert.equal(actionCandidates.filter((row) => row.included === 1).length, 8);
    assert.equal(actionCandidates.find((row) => row.included === 0)?.exclusion_reason, "status_filter");
  } finally {
    store.close();
  }
});

test("project retrieval distinguishes unresolved target, partial coverage, and zero facts", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversationId = createConversation(store);
    const proposal = proposeMemo(store, conversationId, "알파 프로젝트", {
      ...alphaProjection,
      actions: [],
      decisions: [],
      dependencies: [],
      risks: [],
      meetings: [],
      judgments: [],
    }, 1);
    confirmProposal(store, conversationId, proposal.outcome.createdProposalId!, 2);

    const unresolved = store.buildAssistantTurnContext(conversationId, "그 프로젝트 위험을 알려줘");
    assert.equal(unresolved.coverage, "unknown");
    assert.equal(unresolved.plan.projectId, null);
    assert.ok(unresolved.plan.unresolvedConditions.length > 0);

    const zero = store.buildAssistantTurnContext(conversationId, "알파 프로젝트 위험을 알려줘");
    assert.equal(zero.coverage, "complete");
    assert.deepEqual(zero.projectBrief?.sections.risks, []);
  } finally {
    store.close();
  }
});

test("project context truncation is explicit and downgrades complete coverage to partial", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversationId = createConversation(store);
    const longText = "긴 프로젝트 사실 ".repeat(70);
    const projection: ProjectProjectionDraft = {
      ...alphaProjection,
      actions: Array.from({ length: 30 }, (_, index) => ({
        title: `${index} ${longText}`,
        status: "open" as const,
        plannedOn: null,
        dueOn: null,
      })),
      decisions: Array.from({ length: 30 }, (_, index) => ({
        text: `${index} ${longText}`,
        decidedOn: null,
      })),
      dependencies: Array.from({ length: 30 }, (_, index) => ({
        text: `${index} ${longText}`,
        status: "open" as const,
      })),
      risks: Array.from({ length: 30 }, (_, index) => ({
        text: `${index} ${longText}`,
        status: "open" as const,
      })),
      meetings: Array.from({ length: 30 }, (_, index) => ({
        title: `${index} ${longText}`,
        scheduledAt: null,
        status: "planned" as const,
      })),
      judgments: Array.from({ length: 30 }, (_, index) => ({
        question: `${index} ${longText}`,
        status: "open" as const,
      })),
    };
    const proposal = proposeMemo(store, conversationId, "대규모 알파 프로젝트", projection, 1);
    confirmProposal(store, conversationId, proposal.outcome.createdProposalId!, 2);
    const context = store.buildAssistantTurnContext(conversationId, "알파 프로젝트 현황");

    assert.equal(context.coverage, "partial");
    assert.match(context.projectBrief?.coverageReasons.at(-1) ?? "", /컨텍스트 예산/);
    assert.match(String(store.debugDataset("retrieval_runs")[0]?.truncation_reason), /컨텍스트 예산/);
    assert.ok(store.debugDataset("retrieval_candidates", 100)
      .some((row) => row.exclusion_reason === "context_budget"));
  } finally {
    store.close();
  }
});

function createConversation(store: OpsStore): string {
  return store.createAiConversation({
    provider: "codex",
    model: "default",
    reasoningEffort: "default",
  }).id;
}

function proposeMemo(
  store: OpsStore,
  conversationId: string,
  rawText: string,
  projection: ProjectProjectionDraft | null,
  sequence: number,
  targetMemoId: string | null = null,
) {
  const turn = runningTurn(store, conversationId, rawText, sequence);
  const completed = store.completeAssistantTurn(turn.job.id, completion({
    reply: "메모 제안",
    resolutions: [],
    memoProposal: {
      operation: targetMemoId ? "revise" : "create",
      targetMemoId,
      supersedesProposalId: null,
      memo: {
        summary: rawText,
        facets: [{ kind: "note", text: rawText }],
        subjects: projection ? [projection.projectName] : [],
        timeReferences: [],
        uncertainties: [],
      },
      projectProjections: projection ? [projection] : [],
    },
    grounding: { status: "not_applicable", citedReferenceIds: [], conflicts: [] },
  }));
  assert.ok(completed);
  return { ...completed, turn };
}

function confirmProposal(
  store: OpsStore,
  conversationId: string,
  proposalId: string,
  sequence: number,
) {
  const turn = runningTurn(store, conversationId, "저장해", sequence);
  const completed = store.completeAssistantTurn(turn.job.id, completion({
    reply: "저장했습니다.",
    resolutions: [{ proposalId, action: "confirm" }],
    memoProposal: null,
    grounding: { status: "not_applicable", citedReferenceIds: [], conflicts: [] },
  }));
  assert.ok(completed);
  return { ...completed, turn };
}

function runningTurn(
  store: OpsStore,
  conversationId: string,
  message: string,
  sequence: number,
): CreatedAiTurn {
  const turn = store.createAiTurn({
    conversationId,
    clientRequestId: `99999999-9999-4999-8999-${String(sequence).padStart(12, "0")}`,
    message,
    model: "default",
    reasoningEffort: "default",
  });
  store.startAiJob(turn.job.id);
  return turn;
}

function completion(
  envelope: Parameters<OpsStore["completeAssistantTurn"]>[1]["envelope"],
): Parameters<OpsStore["completeAssistantTurn"]>[1] {
  return {
    envelope,
    content: envelope.reply,
    inputTokens: 1,
    cachedInputTokens: 0,
    outputTokens: 1,
    reasoningTokens: 0,
    durationMs: 1,
    groundingSources: [],
    retrievalRunId: "test-retrieval-run",
    coverage: "unknown",
    projectBrief: null,
  };
}
