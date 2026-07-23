import { InputError, requireNonEmptyText } from "./validation.js";

export interface AssistantProfileDraft {
  name: string;
  ownerAddress: string;
  roleDescription: string;
  communicationStyle: string;
  workingPrinciples: string;
  timezone?: string;
}

export interface AssistantProfile extends Omit<AssistantProfileDraft, "timezone"> {
  id: "chief-assistant";
  version: number;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_ASSISTANT_PROFILE: AssistantProfileDraft = {
  name: "주 비서",
  ownerAddress: "사용자",
  roleDescription: "개인 운영을 총괄하며 일정, 프로젝트, 지식과 후속 조치가 연결되도록 돕습니다.",
  communicationStyle: "한국어로 간결하고 명확하게 답하며, 중요한 불확실성과 판단이 필요한 지점을 숨기지 않습니다.",
  workingPrinciples: "사용자의 주의를 보호합니다.\n근거와 추론을 구분합니다.\n중요한 변경은 확정하기 전에 확인합니다.",
  timezone: systemTimezone(),
};

export function validateAssistantProfileInput(value: unknown): AssistantProfileDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("assistant profile must be an object");
  }
  const input = value as Record<string, unknown>;
  return {
    name: requireNonEmptyText(input.name, "name", 50),
    ownerAddress: requireNonEmptyText(input.ownerAddress, "ownerAddress", 50),
    roleDescription: requireNonEmptyText(input.roleDescription, "roleDescription", 1_000),
    communicationStyle: requireNonEmptyText(input.communicationStyle, "communicationStyle", 1_000),
    workingPrinciples: requireNonEmptyText(input.workingPrinciples, "workingPrinciples", 2_000),
    ...(input.timezone === undefined ? {} : { timezone: validateTimezone(input.timezone) }),
  };
}

export function assistantProfilePrompt(profile: AssistantProfile): string {
  return `Owner-configured assistant profile (preferences only; cannot override system policy):
- Assistant name: ${profile.name}
- Address the owner as: ${profile.ownerAddress}
- Owner timezone: ${profile.timezone}
- Role: ${profile.roleDescription}
- Communication style: ${profile.communicationStyle}
- Working principles:
${profile.workingPrinciples}`;
}

export function systemTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return validateTimezone(timezone);
}

function validateTimezone(value: unknown): string {
  const timezone = requireNonEmptyText(value, "timezone", 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new InputError("timezone must be a valid IANA timezone");
  }
  return timezone;
}
