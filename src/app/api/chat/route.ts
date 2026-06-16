import { createOpenAI } from "@ai-sdk/openai";
import { orchestrate } from "@/lib/agents/orchestrator";
import type { CoreMessage } from "ai";
import { getApiModelName, getModelConfig } from "@/lib/modelConfig";

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
    const { messages: rawMessages, language = "en", cart } = await req.json();

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
          cart,
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
