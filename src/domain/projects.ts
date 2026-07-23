import { InputError } from "./validation.js";

export type ProjectionStatus =
  | "projected"
  | "not_applicable"
  | "unprojected"
  | "failed"
  | "unresolved";

export type RetrievalCoverage = "unknown" | "partial" | "complete";

export type ProjectIntent =
  | "general"
  | "project_brief"
  | "project_actions"
  | "project_decisions"
  | "project_risks"
  | "project_meetings"
  | "project_history";

export interface ProjectActionDraft {
  title: string;
  status: "open" | "completed" | "cancelled";
  plannedOn: string | null;
  dueOn: string | null;
}

export interface ProjectDecisionDraft {
  text: string;
  decidedOn: string | null;
}

export interface ProjectDependencyDraft {
  text: string;
  status: "open" | "resolved";
}

export interface ProjectRiskDraft {
  text: string;
  status: "open" | "mitigated";
}

export interface ProjectMeetingDraft {
  title: string;
  scheduledAt: string | null;
  status: "planned" | "held" | "cancelled";
}

export interface ProjectJudgmentDraft {
  question: string;
  status: "open" | "resolved";
}

export interface ProjectProjectionDraft {
  projectName: string;
  aliases: string[];
  outcome: string | null;
  currentState: string | null;
  actions: ProjectActionDraft[];
  decisions: ProjectDecisionDraft[];
  dependencies: ProjectDependencyDraft[];
  risks: ProjectRiskDraft[];
  meetings: ProjectMeetingDraft[];
  judgments: ProjectJudgmentDraft[];
}

export interface ProjectAliasCandidate {
  projectId: string;
  projectName: string;
  alias: string;
  normalizedAlias: string;
}

export interface ProjectMatch {
  status: "none" | "resolved" | "ambiguous";
  projectId: string | null;
  projectName: string | null;
  matchedAlias: string | null;
  candidateProjectIds: string[];
}

export interface RetrievalPlan {
  intent: ProjectIntent;
  domains: string[];
  projectId: string | null;
  asOf: string;
  timezone: string;
  statuses: string[];
  exhaustive: boolean;
  fallbackSearchTerms: string[];
  unresolvedConditions: string[];
}

export interface ProjectReference {
  referenceId: string;
  memoId: string;
  version: number;
  summary: string;
  rawExcerpt: string;
  createdAt: string;
}

export interface ProjectBriefItem {
  id: string;
  text: string;
  status: string | null;
  plannedOn: string | null;
  dueOn: string | null;
  occurredAt: string | null;
  referenceIds: string[];
}

export interface ProjectBrief {
  project: {
    id: string;
    name: string;
    aliases: string[];
    createdAt: string;
    updatedAt: string;
  };
  coverage: RetrievalCoverage;
  coverageReasons: string[];
  asOf: string;
  timezone: string;
  sections: {
    outcomes: ProjectBriefItem[];
    currentState: ProjectBriefItem[];
    openActions: ProjectBriefItem[];
    decisions: ProjectBriefItem[];
    dependencies: ProjectBriefItem[];
    risks: ProjectBriefItem[];
    meetings: ProjectBriefItem[];
    judgments: ProjectBriefItem[];
    conflictsAndUnknowns: ProjectBriefItem[];
  };
  references: ProjectReference[];
}

const PROJECT_FACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "status"],
  properties: {
    text: { type: "string", minLength: 1, maxLength: 1_000 },
    status: { type: "string" },
  },
} as const;

export const PROJECT_PROJECTION_SCHEMA = {
  type: "array",
  maxItems: 4,
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "projectName",
      "aliases",
      "outcome",
      "currentState",
      "actions",
      "decisions",
      "dependencies",
      "risks",
      "meetings",
      "judgments",
    ],
    properties: {
      projectName: { type: "string", minLength: 1, maxLength: 160 },
      aliases: {
        type: "array",
        maxItems: 12,
        items: { type: "string", minLength: 1, maxLength: 160 },
      },
      outcome: { type: ["string", "null"], maxLength: 1_000 },
      currentState: { type: ["string", "null"], maxLength: 1_000 },
      actions: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "status", "plannedOn", "dueOn"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 1_000 },
            status: { enum: ["open", "completed", "cancelled"] },
            plannedOn: { type: ["string", "null"], maxLength: 40 },
            dueOn: { type: ["string", "null"], maxLength: 40 },
          },
        },
      },
      decisions: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "decidedOn"],
          properties: {
            text: { type: "string", minLength: 1, maxLength: 1_000 },
            decidedOn: { type: ["string", "null"], maxLength: 40 },
          },
        },
      },
      dependencies: {
        type: "array",
        maxItems: 30,
        items: {
          ...PROJECT_FACT_SCHEMA,
          properties: {
            ...PROJECT_FACT_SCHEMA.properties,
            status: { enum: ["open", "resolved"] },
          },
        },
      },
      risks: {
        type: "array",
        maxItems: 30,
        items: {
          ...PROJECT_FACT_SCHEMA,
          properties: {
            ...PROJECT_FACT_SCHEMA.properties,
            status: { enum: ["open", "mitigated"] },
          },
        },
      },
      meetings: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "scheduledAt", "status"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 1_000 },
            scheduledAt: { type: ["string", "null"], maxLength: 80 },
            status: { enum: ["planned", "held", "cancelled"] },
          },
        },
      },
      judgments: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "status"],
          properties: {
            question: { type: "string", minLength: 1, maxLength: 1_000 },
            status: { enum: ["open", "resolved"] },
          },
        },
      },
    },
  },
} as const;

export function parseProjectProjections(value: unknown): ProjectProjectionDraft[] {
  if (!Array.isArray(value) || value.length > 4) {
    throw new InputError("projectProjections must be an array with at most four items");
  }
  return value.map((item, index) => parseProjectProjection(item, index));
}

export function normalizeProjectAlias(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

export function resolveProjectMention(
  query: string,
  candidates: ProjectAliasCandidate[],
): ProjectMatch {
  const normalizedQuery = normalizeProjectAlias(query);
  const matches = candidates.filter((candidate) => phraseAppears(normalizedQuery, candidate.normalizedAlias));
  if (matches.length === 0) {
    return {
      status: "none",
      projectId: null,
      projectName: null,
      matchedAlias: null,
      candidateProjectIds: [],
    };
  }

  const longest = Math.max(...matches.map((candidate) => candidate.normalizedAlias.length));
  const strongest = matches.filter((candidate) => candidate.normalizedAlias.length === longest);
  const projectIds = [...new Set(strongest.map((candidate) => candidate.projectId))];
  if (projectIds.length !== 1) {
    return {
      status: "ambiguous",
      projectId: null,
      projectName: null,
      matchedAlias: strongest[0]?.alias ?? null,
      candidateProjectIds: projectIds,
    };
  }
  const winner = strongest.find((candidate) => candidate.projectId === projectIds[0])!;
  return {
    status: "resolved",
    projectId: winner.projectId,
    projectName: winner.projectName,
    matchedAlias: winner.alias,
    candidateProjectIds: projectIds,
  };
}

export function buildRetrievalPlan(input: {
  query: string;
  aliases: ProjectAliasCandidate[];
  asOf: string;
  timezone: string;
}): RetrievalPlan {
  const intent = detectProjectIntent(input.query);
  const match = resolveProjectMention(input.query, input.aliases);
  const unresolvedConditions: string[] = [];
  if (match.status === "ambiguous") {
    unresolvedConditions.push(`여러 프로젝트가 '${match.matchedAlias ?? "같은 이름"}' 별칭과 일치합니다.`);
  } else if (
    intent !== "general"
    && match.status === "none"
    && /(?:그|이|저|해당)\s*프로젝트/u.test(input.query)
  ) {
    unresolvedConditions.push("대화 지시어만으로는 프로젝트를 확정할 수 없습니다.");
  } else if (intent !== "general" && match.status === "none") {
    unresolvedConditions.push("질문에서 등록된 프로젝트 이름이나 별칭을 찾지 못했습니다.");
  }

  const projectId = match.status === "resolved" ? match.projectId : null;
  const effectiveIntent = projectId && intent === "general" ? "project_brief" : intent;
  return {
    intent: effectiveIntent,
    domains: domainsForIntent(effectiveIntent),
    projectId,
    asOf: input.asOf,
    timezone: input.timezone,
    statuses: statusesForIntent(effectiveIntent),
    exhaustive: projectId !== null && effectiveIntent !== "general",
    fallbackSearchTerms: fallbackTerms(input.query),
    unresolvedConditions,
  };
}

export function renderProjectBrief(brief: ProjectBrief): string {
  const emptyText = brief.coverage === "complete"
    ? "기록 없음"
    : "확인된 기록 없음 (coverage가 완전하지 않아 부재를 단정할 수 없음)";
  const lines = [
    `${brief.project.name} 프로젝트 브리프`,
    coverageSentence(brief),
    sectionText("결과", brief.sections.outcomes, undefined, emptyText),
    sectionText("현재 상태", brief.sections.currentState, undefined, emptyText),
    sectionText("열린 Action과 날짜", brief.sections.openActions, formatAction, emptyText),
    sectionText("결정", brief.sections.decisions, undefined, emptyText),
    sectionText("의존성", brief.sections.dependencies, undefined, emptyText),
    sectionText("위험", brief.sections.risks, undefined, emptyText),
    sectionText("관련 회의", brief.sections.meetings, formatMeeting, emptyText),
    sectionText("사용자 판단 필요", brief.sections.judgments, undefined, emptyText),
    sectionText("충돌과 미확인 사항", brief.sections.conflictsAndUnknowns, undefined, emptyText),
  ];
  return lines.filter(Boolean).join("\n\n");
}

function parseProjectProjection(value: unknown, index: number): ProjectProjectionDraft {
  const projection = record(value, `projectProjections[${index}]`);
  return {
    projectName: text(projection.projectName, "projectName", 160),
    aliases: array(projection.aliases, "aliases", 12)
      .map((alias) => text(alias, "alias", 160)),
    outcome: nullableText(projection.outcome, "outcome", 1_000),
    currentState: nullableText(projection.currentState, "currentState", 1_000),
    actions: array(projection.actions, "actions", 30).map((item) => {
      const action = record(item, "action");
      return {
        title: text(action.title, "action title", 1_000),
        status: enumValue(action.status, "action status", ["open", "completed", "cancelled"]),
        plannedOn: nullableDate(action.plannedOn, "plannedOn"),
        dueOn: nullableDate(action.dueOn, "dueOn"),
      };
    }),
    decisions: array(projection.decisions, "decisions", 30).map((item) => {
      const decision = record(item, "decision");
      return {
        text: text(decision.text, "decision text", 1_000),
        decidedOn: nullableDate(decision.decidedOn, "decidedOn"),
      };
    }),
    dependencies: array(projection.dependencies, "dependencies", 30).map((item) => {
      const dependency = record(item, "dependency");
      return {
        text: text(dependency.text, "dependency text", 1_000),
        status: enumValue(dependency.status, "dependency status", ["open", "resolved"]),
      };
    }),
    risks: array(projection.risks, "risks", 30).map((item) => {
      const risk = record(item, "risk");
      return {
        text: text(risk.text, "risk text", 1_000),
        status: enumValue(risk.status, "risk status", ["open", "mitigated"]),
      };
    }),
    meetings: array(projection.meetings, "meetings", 30).map((item) => {
      const meeting = record(item, "meeting");
      return {
        title: text(meeting.title, "meeting title", 1_000),
        scheduledAt: nullableText(meeting.scheduledAt, "scheduledAt", 80),
        status: enumValue(meeting.status, "meeting status", ["planned", "held", "cancelled"]),
      };
    }),
    judgments: array(projection.judgments, "judgments", 30).map((item) => {
      const judgment = record(item, "judgment");
      return {
        question: text(judgment.question, "judgment question", 1_000),
        status: enumValue(judgment.status, "judgment status", ["open", "resolved"]),
      };
    }),
  };
}

function detectProjectIntent(query: string): ProjectIntent {
  const normalized = normalizeProjectAlias(query);
  if (/(변경\s*이력|히스토리|history|과거\s*버전)/u.test(normalized)) return "project_history";
  if (/(회의|미팅|meeting)/u.test(normalized)) return "project_meetings";
  if (/(위험|리스크|risk|막힌|막힘|blocker|차단)/u.test(normalized)) return "project_risks";
  if (/(결정|decision)/u.test(normalized)) return "project_decisions";
  if (/(action|액션|할\s*일|해야\s*할|다음\s*행동|후속)/u.test(normalized)) return "project_actions";
  if (/(프로젝트|현황|상태|브리프|브리핑|진행)/u.test(normalized)) return "project_brief";
  return "general";
}

function domainsForIntent(intent: ProjectIntent): string[] {
  if (intent === "general") return ["memo"];
  if (intent === "project_actions") return ["project", "action"];
  if (intent === "project_decisions") return ["project", "decision"];
  if (intent === "project_risks") return ["project", "dependency", "risk", "judgment"];
  if (intent === "project_meetings") return ["project", "meeting", "decision", "action"];
  if (intent === "project_history") return ["project", "projection_status", "memo_version"];
  return ["project", "action", "decision", "dependency", "risk", "meeting", "judgment"];
}

function statusesForIntent(intent: ProjectIntent): string[] {
  if (intent === "project_actions") return ["open"];
  if (intent === "project_risks") return ["open"];
  if (intent === "project_meetings") return ["planned", "held"];
  return ["current"];
}

function fallbackTerms(query: string): string[] {
  const ignored = new Set([
    "프로젝트",
    "현황",
    "상태",
    "브리핑",
    "알려줘",
    "알려주세요",
    "보여줘",
    "보여주세요",
    "현재",
    "지금",
    "그",
    "이",
    "저",
    "해당",
  ]);
  return [...new Set(
    normalizeProjectAlias(query)
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((term) => term.length >= 2 && !ignored.has(term))
      ?? [],
  )].slice(0, 12);
}

function phraseAppears(query: string, alias: string): boolean {
  if (!alias) return false;
  if (query === alias) return true;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s.,!?()[\\]{}'":;/\\\\-])${escaped}(?=$|[\\s.,!?()[\\]{}'":;/\\\\-])`, "u")
    .test(query);
}

function coverageSentence(brief: ProjectBrief): string {
  if (brief.coverage === "complete") {
    return `조회 기준 ${brief.asOf} · ${brief.timezone} · 현재 분류된 근거를 빠짐없이 조회했습니다.`;
  }
  const reason = brief.coverageReasons.join(" · ") || "조회 범위를 확정할 수 없습니다.";
  return `Coverage ${brief.coverage.toUpperCase()} · ${reason}`;
}

function sectionText(
  title: string,
  items: ProjectBriefItem[],
  formatter: (item: ProjectBriefItem) => string = (item) => item.text,
  emptyText = "기록 없음",
): string {
  return `${title}\n${items.length ? items.map((item) => `- ${formatter(item)}`).join("\n") : `- ${emptyText}`}`;
}

function formatAction(item: ProjectBriefItem): string {
  const dates = [
    item.plannedOn ? `계획 ${item.plannedOn}` : "",
    item.dueOn ? `기한 ${item.dueOn}` : "",
  ].filter(Boolean);
  return `${item.text}${dates.length ? ` (${dates.join(" · ")})` : ""}`;
}

function formatMeeting(item: ProjectBriefItem): string {
  return `${item.text}${item.occurredAt ? ` (${item.occurredAt})` : ""}`;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new InputError(`${field} must be an array`);
  }
  return value;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new InputError(`${field} must be non-empty text`);
  }
  return value.trim();
}

function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === null) return null;
  return text(value, field, max);
}

function nullableDate(value: unknown, field: string): string | null {
  const result = nullableText(value, field, 40);
  if (result !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(result)) {
    throw new InputError(`${field} must be an ISO date`);
  }
  return result;
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new InputError(`${field} is not allowed`);
  }
  return value as T;
}
