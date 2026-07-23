import { InputError } from "./validation.js";
import {
  parseProjectProjections,
  PROJECT_PROJECTION_SCHEMA,
  type ProjectProjectionDraft,
} from "./projects.js";

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
  projectProjections: ProjectProjectionDraft[];
}

export interface ProposalResolution {
  proposalId: string;
  action: ProposalResolutionAction;
}

export type GroundingStatus = "not_applicable" | "grounded" | "insufficient" | "conflicting";

export interface AssistantTurnGrounding {
  status: GroundingStatus;
  citedReferenceIds: string[];
  conflicts: string[];
}

export interface AssistantTurnEnvelope {
  reply: string;
  resolutions: ProposalResolution[];
  memoProposal: MemoProposalDraft | null;
  grounding: AssistantTurnGrounding;
}

export const ASSISTANT_TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "resolutions", "memoProposal", "grounding"],
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
          required: ["operation", "targetMemoId", "supersedesProposalId", "memo", "projectProjections"],
          properties: {
            operation: { enum: ["create", "revise"] },
            targetMemoId: { type: ["string", "null"] },
            supersedesProposalId: { type: ["string", "null"] },
            projectProjections: PROJECT_PROJECTION_SCHEMA,
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
    grounding: {
      type: "object",
      additionalProperties: false,
      required: ["status", "citedReferenceIds", "conflicts"],
      properties: {
        status: { enum: ["not_applicable", "grounded", "insufficient", "conflicting"] },
        citedReferenceIds: {
          type: "array",
          maxItems: 100,
          items: {
            type: "string",
            minLength: 1,
            maxLength: 140,
            pattern: "^memo:[0-9a-f-]+:v[1-9][0-9]*$",
          },
        },
        conflicts: {
          type: "array",
          maxItems: 5,
          items: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
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
    grounding: parseGrounding(record.grounding),
  };
}

export function validateGroundingReferences(
  grounding: AssistantTurnGrounding,
  availableReferenceIds: string[],
): void {
  const available = new Set(availableReferenceIds);
  const cited = new Set(grounding.citedReferenceIds);
  if (cited.size !== grounding.citedReferenceIds.length) {
    throw new InputError("grounding citations must be unique");
  }
  if (grounding.citedReferenceIds.some((id) => !available.has(id))) {
    throw new InputError("grounding cited an unavailable reference");
  }
  if (["grounded", "conflicting"].includes(grounding.status) && cited.size === 0) {
    throw new InputError("grounded answers require at least one citation");
  }
  if (["not_applicable", "insufficient"].includes(grounding.status) && cited.size > 0) {
    throw new InputError("ungrounded answers cannot include citations");
  }
  if (grounding.status === "conflicting" && grounding.conflicts.length === 0) {
    throw new InputError("conflicting answers require a conflict description");
  }
  if (grounding.status !== "conflicting" && grounding.conflicts.length > 0) {
    throw new InputError("only conflicting answers can include conflicts");
  }
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
    projectProjections: parseProjectProjections(proposal.projectProjections),
  };
}

function parseGrounding(value: unknown): AssistantTurnGrounding {
  const grounding = requireRecord(value, "grounding");
  return {
    status: requireEnum(
      grounding.status,
      "grounding status",
      ["not_applicable", "grounded", "insufficient", "conflicting"],
    ),
    citedReferenceIds: requireArray(grounding.citedReferenceIds, "citedReferenceIds", 100)
      .map((item) => {
        const referenceId = requireText(item, "cited reference id", 140);
        if (!/^memo:[0-9a-f-]+:v[1-9][0-9]*$/u.test(referenceId)) {
          throw new InputError("cited reference id is invalid");
        }
        return referenceId;
      }),
    conflicts: requireArray(grounding.conflicts, "conflicts", 5)
      .map((item) => requireText(item, "conflict", 500)),
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
