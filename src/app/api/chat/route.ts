import { createOpenAI } from "@ai-sdk/openai";
import { orchestrate } from "@/lib/agents/orchestrator";
import type { CoreMessage } from "ai";

// ─── Model Configuration Map ────────────────────────────────────────────────
// Add new models here. Select the active model via AI_MODEL env var.
// messageBudget: max tokens allocated to conversation history (excluding system prompt & tools)
// lastMessageLimit: max chars preserved from the latest user message
interface ModelConfig {
  messageBudget: number;
  lastMessageLimit: number;
  apiModelName?: string; // actual model name sent to the API (when config key differs)
}

// Budgets reflect actual platform token caps (not the model's native context window).
// GitHub Models free tier enforces 8K input / 4K output per request for all models.
// OpenAI direct API has no platform cap — models can use their full context window.
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // ── GitHub Models free tier (8K input cap → ~4K available after overhead) ──
  "gpt-4o-mini": { messageBudget: 4000,  lastMessageLimit: 2000 }, // 150 req/day
  "gpt-4o":      { messageBudget: 4000,  lastMessageLimit: 2000 }, // 50 req/day
  // ── GitHub Models Copilot Pro (4K input cap) ──
  "gpt-5-mini":  { messageBudget: 2000,  lastMessageLimit: 1500 }, // requires Copilot Pro
  // ── OpenAI direct API (128K+ context, no platform cap) ──
  "gpt-4o-mini-direct": { messageBudget: 16000, lastMessageLimit: 4000, apiModelName: "gpt-4o-mini" },
  "gpt-4o-direct":      { messageBudget: 32000, lastMessageLimit: 8000, apiModelName: "gpt-4o" },
};

// Default to gpt-4o-mini: same token limits as gpt-4o but 3× more requests/day.
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_CONFIG: ModelConfig = { messageBudget: 4000, lastMessageLimit: 2000 };

// ─── Provider Setup ─────────────────────────────────────────────────────────
const apiKey = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY || "";
const isGitHubModels = !!process.env.GITHUB_TOKEN;
const baseURL = isGitHubModels
  ? "https://models.inference.ai.azure.com"
  : undefined;

const openai = createOpenAI({
  apiKey,
  baseURL,
});

function getModelName(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

/** Resolve the actual API model name (strips "-direct" suffix etc.) */
function getApiModelName(): string {
  const configKey = getModelName();
  const config = MODEL_CONFIGS[configKey];
  return config?.apiModelName ?? configKey;
}

function getModelConfig(): ModelConfig {
  const model = getModelName();
  return MODEL_CONFIGS[model] || DEFAULT_CONFIG;
}

// Estimate tokens from the FULL serialized message including tool results.
function estimateTokens(msg: CoreMessage): number {
  const serialized = JSON.stringify(msg);
  return Math.ceil(serialized.length / 4) + 4;
}

// Compact an OLD message (not the last user message) to save tokens.
function compactOldMessage(msg: CoreMessage): CoreMessage | null {
  // Drop tool-role messages entirely — they contain huge JSON tool results
  if (msg.role === "tool") return null;

  if (msg.role === "user") {
    const content = typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content);
    return { role: "user", content: content.slice(0, 200) };
  }

  if (msg.role === "assistant") {
    const content = typeof msg.content === "string" ? msg.content : "";
    if (content) {
      return { role: "assistant", content: content.slice(0, 200) };
    }
    // Assistant messages with only tool calls (no text) — skip
    return null;
  }

  return null;
}

function trimMessages(messages: CoreMessage[]): CoreMessage[] {
  if (!messages.length) return [];

  const config = getModelConfig();

  // The LAST user message must be preserved fully — it contains order details,
  // product IDs, delivery info etc. that the agent needs.
  const lastIdx = messages.length - 1;
  const lastMsg = messages[lastIdx];

  // Preserve last user message content fully (up to model's lastMessageLimit)
  const preservedLast: CoreMessage = lastMsg.role === "user"
    ? { role: "user", content: (typeof lastMsg.content === "string" ? lastMsg.content : JSON.stringify(lastMsg.content)).slice(0, config.lastMessageLimit) }
    : compactOldMessage(lastMsg) ?? { role: "user" as const, content: "" };

  const lastCost = estimateTokens(preservedLast);
  let remaining = config.messageBudget - lastCost;

  // Walk backwards through older messages, compacting and fitting to budget
  const older: CoreMessage[] = [];
  for (let i = lastIdx - 1; i >= 0 && remaining > 50; i--) {
    const compacted = compactOldMessage(messages[i]);
    if (!compacted) continue;
    const cost = estimateTokens(compacted);
    if (cost <= remaining) {
      older.unshift(compacted);
      remaining -= cost;
    } else {
      break;
    }
  }

  older.push(preservedLast);
  return older;
}

function isRateLimitError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (e.statusCode === 429) return true;
    if (typeof e.message === "string" && /rate.?limit|too many requests/i.test(e.message)) return true;
  }
  return false;
}

function isBodyTooLargeError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (e.statusCode === 413) return true;
    if (typeof e.message === "string" && /too large|tokens_limit_reached/i.test(e.message)) return true;
  }
  return false;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 2;

export async function POST(req: Request) {
  try {
    const { messages: rawMessages, language = "en" } = await req.json();

    const apiModel = getApiModelName();
    let messages = trimMessages(rawMessages);

    const classifierModel = openai(apiModel);
    const agentModel = openai(apiModel);

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await orchestrate({
          classifierModel,
          agentModel,
          messages,
          language,
        });

        // Return the data stream response.
        // The orchestrate call itself will throw on 413/429 errors
        // during the initial model request before any streaming begins.
        return result.toDataStreamResponse();
      } catch (err) {
        lastError = err;
        console.error(`Chat API error (attempt ${attempt + 1}):`, err);

        if (isBodyTooLargeError(err)) {
          // Aggressively trim: keep only the last user message
          const lastUser = [...messages].reverse().find(m => m.role === "user");
          messages = lastUser
            ? [{ role: "user" as const, content: (typeof lastUser.content === "string" ? lastUser.content : "").slice(0, 200) }]
            : messages.slice(-1);
          continue;
        }

        if (isRateLimitError(err) && attempt < MAX_RETRIES) {
          const delay = 1000 * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }

        break;
      }
    }

    const isRateLimit = isRateLimitError(lastError);
    const isTokenLimit = isBodyTooLargeError(lastError);

    const errorMessages = {
      RATE_LIMITED: "429: Aura is getting a lot of requests right now. Please wait a moment and try again.",
      TOKEN_LIMIT: "413: The conversation got too long. Try starting a fresh chat or sending a shorter message.",
      UNKNOWN: "Something went wrong. Please try again.",
    };

    const code = isRateLimit ? "RATE_LIMITED" : isTokenLimit ? "TOKEN_LIMIT" : "UNKNOWN";
    const status = isRateLimit ? 429 : isTokenLimit ? 413 : 500;

    // Return plain text — ai/react useChat onError reads the response body as text
    return new Response(errorMessages[code], {
      status,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return new Response(message, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
