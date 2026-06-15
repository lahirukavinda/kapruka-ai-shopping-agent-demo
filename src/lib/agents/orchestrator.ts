import { streamText } from "ai";
import type { LanguageModelV1, CoreMessage } from "ai";
import { getSystemPromptForLanguage, SHOPPER_ADDENDUM, LOGISTICS_ADDENDUM, ORDER_ADDENDUM, EMOTIONAL_SUPPORT_ADDENDUM } from "./concierge";
import { getAllTools, getShopperTools, getLogisticsTools, getOrderTools } from "./tools";
import { normalizeSlang, type SinhalaIntentTokens } from "../sinhalaSlangNormalizer";

type Intent = "shopping" | "logistics" | "order" | "emotional" | "general";

// Rule-based intent patterns to avoid an LLM call for common queries
const SHOPPING_PATTERNS =
  /\b(show me|search|find|browse|look for|products?|items?|cakes?|flowers?|chocolates?|gifts?|buy|shop|categories|catalog|compare|cheaper|expensive|price|similar|recommend|suggest|add to cart|add.*cart|cart.*add|cart ekata|cart eke)\b/i;
// Singlish/Sinhala cart & shopping action patterns — avoid LLM call for common follow-ups
// Split into Latin (\b works) and Sinhala (no \b — Unicode chars aren't \w)
const SINGLISH_CART_PATTERNS =
  /\b(cart ekata|cart eke|danna|ganna|add karanna|add karanawa|ekata danna|ekata ganna|checkout karanawa|order karanawa)\b/i;
const SINHALA_CART_PATTERNS =
  /(මේක ගන්න|කාට් එකට|එකට දාන්න)/;
// Comparison/indecision patterns — detect "X or Y" / "X vs Y" / "can't decide" requests
const COMPARISON_PATTERNS =
  /\b(compare|vs\.?|versus|or\b.*\bwhich|which.*\bor\b|can't decide|cant decide|hithaganna ba|hithaganna bari|hithaganna nehe|better|difference between|mokada honda|hoda)\b.*\b(apple|samsung|iphone|galaxy|huawei|oppo|vivo|xiaomi|nokia|phone|laptop|tablet|camera|tv|cake|chocolate|flower|gift|product)/i;
// "X da Y da" Tanglish pattern — matches any "word da word da" comparison structure
const TANGLISH_COMPARISON_PATTERN = /\w+\s+da\s+\w+\s+da\b/i;
// Sinhala/Tanglish shopping patterns — detect product requests in any language
const SINHALA_SHOPPING_PATTERNS =
  /\b(ganna|ganna one|one ekak|ekak one|ekak ganna|ගන්න|ඕනෙ|ඕන|ඕනෑ)\b.*\b(cake|phone|chocolate|gift|flower|laptop|saree|shirt|watch|toy|book|perfume|wine|grocery)\b|\b(cake|phone|chocolate|gift|flower|laptop|saree|shirt|watch|toy|book|perfume|wine|grocery)\b.*\b(ganna|ganna one|one ekak|ekak one|ekak ganna|ඕනෙ|ඕන|ඕනෑ|ගන්න)\b/i;
// Sinhala Unicode product keywords
const SINHALA_UNICODE_PRODUCT_PATTERNS =
  /මට.*(?:cake|phone|chocolate|gift|flower|saree|shirt|watch|toy|book|perfume|wine|grocery|කේක්|චොකලට්|මල්|ඇඳුම්|සපත්තු|පොත්|සුවඳ විලවුන්)/i;
const LOGISTICS_PATTERNS =
  /\b(deliver(y|ies)?|shipping|ship to|cities|city list|available.*(deliver|ship)|deliver.*(date|time|rate|cost|charge)|can you deliver|where.*(deliver|ship))\b/i;
const ORDER_PATTERNS =
  /\b(place.*(my|the)?\s*order|checkout|confirm.*order|complete.*purchase|cart.*order)\b/i;
const EMOTIONAL_PATTERNS =
  /\b(sad|happy|angry|stressed|broke up|breakup|break up|miss you|missing|lonely|loneliness|depressed|anxious|worried|scared|excited|celebration|celebrating|engaged|married|divorced|lost someone|passed away|grief|grieving|heartbroken|love|hate|frustrated|overwhelmed|burned out|burnout|promoted|promotion|grateful|thankful|nervous|hurt|crying|tears|died|death|funeral|wedding|anniversary|pregnant|baby born|got fired|laid off|failed|success|achievement|graduated|graduation|retire|retired)\b/i;
// Sri Lankan slang patterns for relationship/emotional context
const SL_EMOTIONAL_PATTERNS =
  /\b(gf|bf|girlfriend|boyfriend|crush|ex)\b.*\b(case|scene|problem|broke|cut|left|gone|fight)\b|\b(case|scene|problem|broke|cut|fight)\b.*\b(gf|bf|girlfriend|boyfriend|crush|ex)\b|\b(patch up|cut kala|case broke|propose kala|case karanawa|love ekak|podi aulk|podi aulak|aulk|aulak|gediya)\b/i;

/**
 * Fast rule-based intent detection. Returns null when uncertain so we can
 * fall back to the LLM classifier only when needed.
 */
export function classifyIntentByRules(message: string): Intent | null {
  const trimmed = message.trim();
  if (trimmed.length === 0) return "general";

  // Order patterns are very specific, check first
  if (ORDER_PATTERNS.test(trimmed)) return "order";
  if (LOGISTICS_PATTERNS.test(trimmed)) return "logistics";
  // Emotional patterns before shopping — empathy first
  if (EMOTIONAL_PATTERNS.test(trimmed)) return "emotional";
  if (SL_EMOTIONAL_PATTERNS.test(trimmed)) return "emotional";
  if (COMPARISON_PATTERNS.test(trimmed)) return "shopping";
  if (TANGLISH_COMPARISON_PATTERN.test(trimmed)) return "shopping";
  if (SHOPPING_PATTERNS.test(trimmed)) return "shopping";
  if (SINGLISH_CART_PATTERNS.test(trimmed)) return "shopping";
  if (SINHALA_CART_PATTERNS.test(trimmed)) return "shopping";
  // Sinhala/Tanglish product requests (e.g., "මට cake එකක් ඕනෙ")
  if (SINHALA_SHOPPING_PATTERNS.test(trimmed)) return "shopping";
  if (SINHALA_UNICODE_PRODUCT_PATTERNS.test(trimmed)) return "shopping";

  return null; // uncertain -> fall back to LLM
}

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a Sri Lankan e-commerce shopping assistant.
Given a user message, classify the intent into exactly one of these categories:
- "shopping": product search, browse, compare, view details, list categories
- "logistics": delivery cities, delivery check, shipping availability, delivery date/rate
- "order": placing an order, "place my order", checkout with items and delivery details
- "emotional": messages expressing emotions (sadness, joy, stress, loneliness, celebrations, grief, heartbreak, excitement, etc.)
- "general": order tracking, greetings, addressing preferences, anything else

IMPORTANT Sri Lankan slang context:
- "case" with gf/bf/girlfriend/boyfriend = relationship problem (NOT a phone case)
- "scene" with relationship words = drama/situation
- "cut kala" = got ghosted/ignored
- "case broke" = relationship ended
When relationship words appear with "case", "scene", "cut", "broke" → classify as "emotional"

Respond with ONLY the intent word, nothing else.`;

export async function classifyIntent(
  model: LanguageModelV1,
  lastMessage: string
): Promise<Intent> {
  // Try rule-based classification first to save an LLM call
  const ruleResult = classifyIntentByRules(lastMessage);
  if (ruleResult !== null) return ruleResult;

  try {
    const result = await streamText({
      model,
      system: INTENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: lastMessage }],
      maxTokens: 10,
    });

    let text = "";
    for await (const chunk of result.textStream) {
      text += chunk;
    }

    const cleaned = text.trim().toLowerCase();
    if (cleaned === "shopping" || cleaned === "logistics" || cleaned === "order" || cleaned === "emotional") {
      return cleaned;
    }
    return "general";
  } catch {
    return "general";
  }
}

interface OrchestrateParams {
  classifierModel: LanguageModelV1;
  agentModel: LanguageModelV1;
  messages: CoreMessage[];
  language: string;
}

/**
 * Build a context hint from normalized slang tokens to inject into the system prompt.
 */
function buildSlangContext(tokens: SinhalaIntentTokens, language: string): string {
  const parts: string[] = [];
  parts.push(`\n\n## Slang Context (auto-parsed from user's message)`);
  parts.push(`- English meaning: "${tokens.englishEquivalent}"`);
  parts.push(`- Detected intent: ${tokens.normalizedIntent}`);
  parts.push(`- Emotional tone: ${tokens.emotionalTone}`);
  if (tokens.slangDetected.length > 0) {
    parts.push(`- Slang terms found: ${tokens.slangDetected.join(", ")}`);
  }
  parts.push(`- Is this a product request? ${tokens.isProductRequest ? "Yes" : "No"}`);
  parts.push(`Use this context to respond appropriately. The user's ACTUAL meaning is: "${tokens.englishEquivalent}"`);
  if (language === "tanglish") {
    parts.push(`\nREMINDER: The user wrote in Tanglish. You MUST respond in Tanglish — mix actual Sinhala Unicode letters (සිංහල) with English. Do NOT respond in pure English.`);
  } else if (language === "si") {
    parts.push(`\nREMINDER: The user wrote in Sinhala. You MUST respond entirely in Sinhala Unicode script.`);
  }
  return parts.join("\n");
}

export async function orchestrate({
  classifierModel,
  agentModel,
  messages,
  language,
}: OrchestrateParams) {
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  const lastUserMsg = lastUserMessage
    ? typeof lastUserMessage.content === "string"
      ? lastUserMessage.content
      : ""
    : "";

  // For Sinhala/Tanglish messages, run slang normalizer in parallel with intent classification
  let slangTokens: SinhalaIntentTokens | null = null;
  let intent: Intent;

  if (language === "tanglish" || language === "si") {
    // If rule-based classification already resolved, skip the LLM classifier call
    const ruleIntent = classifyIntentByRules(lastUserMsg);

    if (ruleIntent !== null) {
      // Rule-based hit — only run slang normalizer (1 LLM call instead of 2)
      intent = ruleIntent;
      slangTokens = await normalizeSlang(classifierModel, lastUserMsg).catch(() => null);
    } else {
      // No rule-based match — run both in parallel
      const [normalizedResult, classifiedIntent] = await Promise.all([
        normalizeSlang(classifierModel, lastUserMsg).catch(() => null),
        classifyIntent(classifierModel, lastUserMsg).catch(() => "general" as Intent),
      ]);
      slangTokens = normalizedResult;
      // Override intent if slang normalizer detected a non-product emotional/relationship message
      if (slangTokens && !slangTokens.isProductRequest && 
          (slangTokens.normalizedIntent === "relationship_issue" || slangTokens.normalizedIntent === "emotional" ||
           slangTokens.emotionalTone === "sad" || slangTokens.emotionalTone === "angry" || slangTokens.emotionalTone === "stressed")) {
        intent = "emotional";
      } else {
        intent = classifiedIntent;
      }
    }
  } else {
    intent = await classifyIntent(classifierModel, lastUserMsg);
  }

  // Always use full CONCIERGE_SYSTEM_PROMPT as base (personality, Sinhala, gender greeting)
  // then append intent-specific tool instructions.
  let intentAddendum: string | undefined;
  let tools: ReturnType<typeof getAllTools>;

  switch (intent) {
    case "shopping":
      intentAddendum = SHOPPER_ADDENDUM;
      tools = getShopperTools() as ReturnType<typeof getAllTools>;
      break;
    case "logistics":
      intentAddendum = LOGISTICS_ADDENDUM;
      tools = getLogisticsTools() as ReturnType<typeof getAllTools>;
      break;
    case "order":
      intentAddendum = ORDER_ADDENDUM;
      tools = getOrderTools() as ReturnType<typeof getAllTools>;
      break;
    case "emotional":
      intentAddendum = EMOTIONAL_SUPPORT_ADDENDUM;
      tools = getAllTools();
      break;
    default:
      tools = getAllTools();
      break;
  }

  // Append slang context if we have normalized tokens
  const slangContext = slangTokens ? buildSlangContext(slangTokens, language) : "";
  const systemPrompt = getSystemPromptForLanguage(language, intentAddendum) + slangContext;

  return streamText({
    model: agentModel,
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 3,
    maxTokens: 1024,
  });
}
