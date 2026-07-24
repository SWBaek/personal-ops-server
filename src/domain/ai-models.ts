import type { AiProviderId } from "./workspace.js";

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiProviderModelCatalog {
  initialModel: string;
  models: AiModelOption[];
}

export const AI_MODEL_CATALOG: Record<AiProviderId, AiProviderModelCatalog> = {
  codex: {
    initialModel: "gpt-5.6-sol",
    models: [
      { id: "gpt-5.6-sol", label: "GPT-5.6-Sol" },
      { id: "gpt-5.6-terra", label: "GPT-5.6-Terra" },
      { id: "gpt-5.6-luna", label: "GPT-5.6-Luna" },
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
      { id: "gpt-5.3-codex-spark", label: "GPT-5.3-Codex-Spark" },
    ],
  },
  grok: {
    initialModel: "grok-4.5",
    models: [
      { id: "grok-4.5", label: "Grok 4.5" },
    ],
  },
};

export function initialModelFor(provider: AiProviderId): string {
  return AI_MODEL_CATALOG[provider].initialModel;
}
