import { InputError } from "./validation.js";

export const MEMO_KINDS = [
  "note",
  "action",
  "decision",
  "knowledge",
  "preference",
  "open_question",
] as const;

export type MemoKind = (typeof MEMO_KINDS)[number];
export type ProposalOperation = "create" | "revise";
export type ProposalResolutionAction = "confirm" | "reject" | "supersede";

export interface MemoFacet {
  kind: MemoKind;
  text: string;
}

export interface TimeReference {
  original: string;
  interpreted: string | null;
  certainty: "explicit" | "inferred" | "uncertain";
}

export interface AssistantMemoDraft {
  summary: string;
  facets: MemoFacet[];
  subjects: string[];
  timeReferences: TimeReference[];
  uncertainties: string[];
}

export interface MemoProposalDraft {
  operation: ProposalOperation;
  targetMemoId: string | null;
  supersedesProposalId: string | null;
  memo: AssistantMemoDraft;
}

export interface ProposalResolution {
  proposalId: string;
  action: ProposalResolutionAction;
}

export interface AssistantTurnEnvelope {
  reply: string;
  resolutions: ProposalResolution[];
  memoProposal: MemoProposalDraft | null;
}

export const ASSISTANT_TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "resolutions", "memoProposal"],
  properties: {
    reply: { type: "string", minLength: 1, maxLength: 12_000 },
    resolutions: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["proposalId", "action"],
        properties: {
          proposalId: { type: "string" },
          action: { enum: ["confirm", "reject", "supersede"] },
        },
      },
    },
    memoProposal: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["operation", "targetMemoId", "supersedesProposalId", "memo"],
          properties: {
            operation: { enum: ["create", "revise"] },
            targetMemoId: { type: ["string", "null"] },
            supersedesProposalId: { type: ["string", "null"] },
            memo: {
              type: "object",
              additionalProperties: false,
              required: ["summary", "facets", "subjects", "timeReferences", "uncertainties"],
              properties: {
                summary: { type: "string", minLength: 1, maxLength: 500 },
                facets: {
                  type: "array",
                  minItems: 1,
                  maxItems: 12,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["kind", "text"],
                    properties: {
                      kind: { enum: [...MEMO_KINDS] },
                      text: { type: "string", minLength: 1, maxLength: 500 },
                    },
                  },
                },
                subjects: {
                  type: "array",
                  maxItems: 12,
                  items: { type: "string", minLength: 1, maxLength: 120 },
                },
                timeReferences: {
                  type: "array",
                  maxItems: 12,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["original", "interpreted", "certainty"],
                    properties: {
                      original: { type: "string", minLength: 1, maxLength: 120 },
                      interpreted: { type: ["string", "null"], maxLength: 120 },
                      certainty: { enum: ["explicit", "inferred", "uncertain"] },
                    },
                  },
                },
                uncertainties: {
                  type: "array",
                  maxItems: 12,
                  items: { type: "string", minLength: 1, maxLength: 300 },
                },
              },
            },
          },
        },
      ],
    },
  },
} as const;

export function parseAssistantTurnEnvelope(text: string): AssistantTurnEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InputError("AI returned invalid structured intake output");
  }
  const record = requireRecord(value, "assistant turn");
  const resolutions = requireArray(record.resolutions, "resolutions", 10).map((item) => {
    const resolution = requireRecord(item, "resolution");
    return {
      proposalId: requireText(resolution.proposalId, "proposalId", 100),
      action: requireEnum(resolution.action, "action", ["confirm", "reject", "supersede"]),
    } as ProposalResolution;
  });
  return {
    reply: requireText(record.reply, "reply", 12_000),
    resolutions,
    memoProposal: record.memoProposal === null ? null : parseMemoProposal(record.memoProposal),
  };
}

export function formatAssistantTurn(envelope: AssistantTurnEnvelope): string {
  if (!envelope.memoProposal) return envelope.reply;
  const memo = envelope.memoProposal.memo;
  const details = memo.facets.map((facet) => `- ${facetLabel(facet.kind)}: ${facet.text}`).join("\n");
  const uncertainty = memo.uncertainties.length
    ? `\n확인이 필요한 점: ${memo.uncertainties.join(" · ")}`
    : "";
  return `${envelope.reply}\n\n정리 제안\n${memo.summary}\n${details}${uncertainty}\n\n이대로 저장할까요?`;
}

function parseMemoProposal(value: unknown): MemoProposalDraft {
  const proposal = requireRecord(value, "memoProposal");
  const operation = requireEnum(proposal.operation, "operation", ["create", "revise"]);
  const targetMemoId = optionalText(proposal.targetMemoId, "targetMemoId", 100);
  const supersedesProposalId = optionalText(proposal.supersedesProposalId, "supersedesProposalId", 100);
  if (operation === "create" && targetMemoId !== null) {
    throw new InputError("create proposals cannot target an existing memo");
  }
  if (operation === "revise" && targetMemoId === null) {
    throw new InputError("revise proposals require targetMemoId");
  }
  return {
    operation,
    targetMemoId,
    supersedesProposalId,
    memo: parseMemo(proposal.memo),
  };
}

function parseMemo(value: unknown): AssistantMemoDraft {
  const memo = requireRecord(value, "memo");
  const facets = requireArray(memo.facets, "facets", 12);
  if (facets.length === 0) throw new InputError("facets must not be empty");
  return {
    summary: requireText(memo.summary, "summary", 500),
    facets: facets.map((item) => {
      const facet = requireRecord(item, "facet");
      return {
        kind: requireEnum(facet.kind, "kind", [...MEMO_KINDS]),
        text: requireText(facet.text, "facet text", 500),
      };
    }),
    subjects: requireArray(memo.subjects, "subjects", 12).map((item) => requireText(item, "subject", 120)),
    timeReferences: requireArray(memo.timeReferences, "timeReferences", 12).map((item) => {
      const reference = requireRecord(item, "time reference");
      return {
        original: requireText(reference.original, "time original", 120),
        interpreted: optionalText(reference.interpreted, "time interpreted", 120),
        certainty: requireEnum(reference.certainty, "time certainty", ["explicit", "inferred", "uncertain"]),
      };
    }),
    uncertainties: requireArray(memo.uncertainties, "uncertainties", 12)
      .map((item) => requireText(item, "uncertainty", 300)),
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new InputError(`${field} must be an array`);
  return value;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new InputError(`${field} must be non-empty text`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null) return null;
  return requireText(value, field, max);
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new InputError(`${field} is not allowed`);
  }
  return value as T;
}

function facetLabel(kind: MemoKind): string {
  return ({
    note: "메모",
    action: "행동",
    decision: "결정",
    knowledge: "지식",
    preference: "선호",
    open_question: "열린 질문",
  } satisfies Record<MemoKind, string>)[kind];
}
