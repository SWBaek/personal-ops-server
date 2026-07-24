import type { AiProviderId } from "../domain/workspace.js";
import { AI_MODEL_CATALOG } from "../domain/ai-models.js";
import { InputError } from "../domain/validation.js";

export interface AiProviderOption {
  id: AiProviderId;
  label: string;
  models: Array<{ id: string; label: string }>;
  reasoningEfforts: Array<{ id: string; label: string }>;
}

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  {
    id: "codex",
    label: "Codex",
    models: AI_MODEL_CATALOG.codex.models,
    reasoningEfforts: [
      { id: "default", label: "기본값" },
      { id: "low", label: "낮음" },
      { id: "medium", label: "보통" },
      { id: "high", label: "높음" },
      { id: "xhigh", label: "매우 높음" },
    ],
  },
  {
    id: "grok",
    label: "Grok",
    models: AI_MODEL_CATALOG.grok.models,
    reasoningEfforts: [
      { id: "default", label: "기본값" },
      { id: "low", label: "낮음" },
      { id: "medium", label: "보통" },
      { id: "high", label: "높음" },
    ],
  },
];

export interface AiSelection {
  provider: AiProviderId;
  model: string;
  reasoningEffort: string;
}

export function validateAiSelection(value: Record<string, unknown> | undefined): AiSelection {
  if (typeof value?.provider !== "string") throw new InputError("provider is not supported");
  const provider = AI_PROVIDER_OPTIONS.find((candidate) => candidate.id === value.provider);
  if (!provider) throw new InputError("provider is not supported");
  const model = value.model;
  const reasoningEffort = value.reasoningEffort ?? "default";
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

export class AiChatError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AiChatError";
    this.statusCode = statusCode;
  }
}
