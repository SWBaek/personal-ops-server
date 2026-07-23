import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAssistantTurnEnvelope,
  validateGroundingReferences,
} from "../src/domain/intake.js";
import { OpsStore } from "../src/infra/store.js";

const firstDraft = {
  summary: "알파 배포 일정을 금요일에 확인한다.",
  facets: [{ kind: "action" as const, text: "민수에게 알파 배포 일정을 확인한다." }],
  subjects: ["알파", "민수"],
  timeReferences: [{ original: "금요일쯤", interpreted: "2026-07-24", certainty: "inferred" as const }],
  uncertainties: ["금요일은 대략적인 시점이다."],
};

test("structured assistant output rejects invalid memo payloads", () => {
  assert.throws(() => parseAssistantTurnEnvelope("not-json"), /invalid structured/);
  assert.throws(() => parseAssistantTurnEnvelope(JSON.stringify({
    reply: "확인했습니다.",
    resolutions: [],
    memoProposal: {
      operation: "revise",
      targetMemoId: null,
      supersedesProposalId: null,
      memo: firstDraft,
      projectProjections: [],
    },
    grounding: { status: "not_applicable", citedReferenceIds: [], conflicts: [] },
  })), /require targetMemoId/);
  assert.throws(() => validateGroundingReferences({
    status: "grounded",
    citedReferenceIds: ["memo:00000000-0000-4000-8000-000000000001:v1"],
    conflicts: [],
  }, []), /unavailable reference/);
});

test("natural-language proposals confirm and revise durable assistant memos", () => {
  const store = new OpsStore(":memory:");
  try {
    const conversation = store.createAiConversation({
      provider: "codex",
      model: "default",
      reasoningEffort: "default",
    });
    const proposalTurn = createRunningTurn(store, conversation.id, "알파 건은 금요일쯤 민수에게 물어봐야 해", 1);
    const proposed = store.completeAssistantTurn(proposalTurn.job.id, completion({
      reply: "알파 후속 조치로 정리했습니다.",
      resolutions: [],
      memoProposal: {
        operation: "create",
        targetMemoId: null,
        supersedesProposalId: null,
        memo: firstDraft,
        projectProjections: [],
      },
      grounding: { status: "not_applicable", citedReferenceIds: [], conflicts: [] },
    }));
    assert.ok(proposed?.outcome.createdProposalId);
    assert.equal(store.listIntakeProposals(conversation.id, "pending").length, 1);
    assert.equal(store.listAssistantMemos().length, 0);
    assert.equal(store.searchAssistantMemos("알파 배포 일정").length, 0);

    const confirmTurn = createRunningTurn(store, conversation.id, "저장해", 2);
    const confirmed = store.completeAssistantTurn(confirmTurn.job.id, completion({
      reply: "저장했습니다.",
      resolutions: [{ proposalId: proposed?.outcome.createdProposalId ?? "", action: "confirm" }],
      memoProposal: null,
      grounding: { status: "not_applicable", citedReferenceIds: [], conflicts: [] },
    }));
    const memoId = confirmed?.outcome.confirmedMemoIds[0];
    assert.ok(memoId);
    assert.equal(store.getAssistantMemo(memoId)?.currentVersion, 1);
    assert.equal(store.searchAssistantMemos("알파 배포 일정 알려줘")[0]?.memoId, memoId);

    const revisedDraft = {
      ...firstDraft,
      summary: "알파 배포 일정을 월요일에 확인한다.",
      timeReferences: [{ original: "월요일", interpreted: "2026-07-27", certainty: "explicit" as const }],
      uncertainties: [],
    };
    const revisionTurn = createRunningTurn(store, conversation.id, "금요일이 아니라 월요일이야", 3);
    const revision = store.completeAssistantTurn(revisionTurn.job.id, completion({
      reply: "월요일로 고친 메모를 제안합니다.",
      resolutions: [],
      memoProposal: {
        operation: "revise",
        targetMemoId: memoId ?? null,
        supersedesProposalId: null,
        memo: revisedDraft,
        projectProjections: [],
      },
      grounding: { status: "not_applicable", citedReferenceIds: [], conflicts: [] },
    }));
    const revisionProposalId = revision?.outcome.createdProposalId ?? "";
    const revisionConfirmTurn = createRunningTurn(store, conversation.id, "그대로 저장해", 4);
    store.completeAssistantTurn(revisionConfirmTurn.job.id, completion({
      reply: "수정해서 저장했습니다.",
      resolutions: [{ proposalId: revisionProposalId, action: "confirm" }],
      memoProposal: null,
      grounding: { status: "not_applicable", citedReferenceIds: [], conflicts: [] },
    }));
    assert.equal(store.getAssistantMemo(memoId ?? "")?.currentVersion, 2);
    assert.equal(store.listAssistantMemoVersions(memoId ?? "").length, 2);
    const context = store.buildAssistantTurnContext(
      conversation.id,
      "알파 배포 일정과 불확실한 점을 알려줘",
    );
    assert.equal(context.groundingSources[0]?.memoId, memoId);
    assert.equal(context.groundingSources[0]?.version, 2);
    const serialized = JSON.parse(context.serialized);
    assert.equal(serialized.retrievedEvidence.sources[0].source.rawExcerpt, "금요일이 아니라 월요일이야");
    assert.equal(
      serialized.retrievedEvidence.sources[0].interpretation.summary,
      "알파 배포 일정을 월요일에 확인한다.",
    );

    const groundedTurn = createRunningTurn(
      store,
      conversation.id,
      "알파 배포 일정과 불확실한 점을 알려줘",
      5,
    );
    store.completeAssistantTurn(groundedTurn.job.id, completion({
      reply: "저장된 근거에 따르면 월요일에 확인합니다.",
      resolutions: [],
      memoProposal: null,
      grounding: {
        status: "grounded",
        citedReferenceIds: [`memo:${memoId ?? ""}:v2`],
        conflicts: [],
      },
    }, context.groundingSources));
    const groundedMessage = store.getAiMessage(groundedTurn.assistantMessage.id);
    assert.equal(groundedMessage?.groundingStatus, "grounded");
    assert.deepEqual(groundedMessage?.sources, [{
      referenceId: `memo:${memoId}:v2`,
      memoId,
      version: 2,
      summary: "알파 배포 일정을 월요일에 확인한다.",
    }]);

    store.clearAiHistory();
    assert.equal(store.listIntakeProposals().length, 0);
    assert.equal(store.listAssistantMemos().length, 1);
    assert.equal(
      store.debugSummary().datasets.find((dataset) => dataset.id === "ai_message_sources")?.count,
      0,
    );
    assert.equal(store.searchAssistantMemos("알파 배포 일정")[0]?.version, 2);
  } finally {
    store.close();
  }
});

function createRunningTurn(store: OpsStore, conversationId: string, message: string, sequence: number) {
  const turn = store.createAiTurn({
    conversationId,
    clientRequestId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    message,
    model: "default",
    reasoningEffort: "default",
  });
  store.startAiJob(turn.job.id);
  return turn;
}

function completion(
  envelope: Parameters<OpsStore["completeAssistantTurn"]>[1]["envelope"],
  groundingSources: Parameters<OpsStore["completeAssistantTurn"]>[1]["groundingSources"] = [],
): Parameters<OpsStore["completeAssistantTurn"]>[1] {
  return {
    envelope,
    content: envelope.reply,
    inputTokens: 1,
    cachedInputTokens: 0,
    outputTokens: 1,
    reasoningTokens: 0,
    durationMs: 1,
    groundingSources,
    retrievalRunId: "test-retrieval-run",
    coverage: "unknown",
    projectBrief: null,
  };
}
