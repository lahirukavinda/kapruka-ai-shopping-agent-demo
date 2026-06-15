// ─── Model Configuration Map ────────────────────────────────────────────────
// Add new models here. Select the active model via AI_MODEL env var.
// messageBudget: max tokens allocated to conversation history (excluding system prompt & tools)
// lastMessageLimit: max chars preserved from the latest user message
export interface ModelConfig {
  messageBudget: number;
  lastMessageLimit: number;
  apiModelName?: string; // actual model name sent to the API (when config key differs)
}

// Budgets reflect actual platform token caps (not the model's native context window).
// GitHub Models free tier enforces 8K input / 4K output per request for all models.
// OpenAI direct API has no platform cap — models can use their full context window.
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // ── GitHub Models free tier (8K input cap → ~4K available after overhead) ──
  "gpt-4o-mini": { messageBudget: 4000,  lastMessageLimit: 2000 }, // 150 req/day
  "gpt-4o":      { messageBudget: 4000,  lastMessageLimit: 2000 }, // 50 req/day
  // ── GitHub Models Copilot Pro (4K input cap) ──
  "gpt-5-mini":  { messageBudget: 2000,  lastMessageLimit: 1500 }, // requires Copilot Pro
  // ── OpenAI direct API (128K+ context, no platform cap) ──
  "gpt-4o-mini-direct": { messageBudget: 16000, lastMessageLimit: 4000, apiModelName: "gpt-4o-mini" },
  "gpt-4o-direct":      { messageBudget: 32000, lastMessageLimit: 8000, apiModelName: "gpt-4o" },
};

export const DEFAULT_MODEL = "gpt-4o-mini";
export const DEFAULT_CONFIG: ModelConfig = { messageBudget: 4000, lastMessageLimit: 2000 };

export function getModelName(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

/** Resolve the actual API model name (strips "-direct" suffix etc.) */
export function getApiModelName(): string {
  const configKey = getModelName();
  const config = MODEL_CONFIGS[configKey];
  return config?.apiModelName ?? configKey;
}

export function getModelConfig(): ModelConfig {
  const model = getModelName();
  return MODEL_CONFIGS[model] || DEFAULT_CONFIG;
}
