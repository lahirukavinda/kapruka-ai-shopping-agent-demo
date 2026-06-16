import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the streamText function before importing orchestrator
vi.mock("ai", () => ({
  streamText: vi.fn(),
  generateObject: vi.fn(),
}));

vi.mock("@/lib/agents/concierge", () => ({
  getSystemPromptForLanguage: vi.fn((lang: string, addendum?: string) => `system-prompt-${lang}${addendum ? addendum : ""}`),
  SHOPPER_ADDENDUM: "-shopper",
  LOGISTICS_ADDENDUM: "-logistics",
  ORDER_ADDENDUM: "-order",
  EMOTIONAL_SUPPORT_ADDENDUM: "-emotional",
}));

vi.mock("@/lib/sinhalaSlangNormalizer", () => ({
  normalizeSlang: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/agents/tools", () => ({
  getAllTools: vi.fn(() => ({ all: true })),
  getShopperTools: vi.fn(() => ({ shopper: true })),
  getLogisticsTools: vi.fn(() => ({ logistics: true })),
  getOrderTools: vi.fn(() => ({ order: true })),
}));

import { classifyIntent, classifyIntentByRules, orchestrate } from "@/lib/agents/orchestrator";
import { streamText } from "ai";
import type { LanguageModelV1 } from "ai";
import { getAllTools, getShopperTools, getLogisticsTools, getOrderTools } from "@/lib/agents/tools";

const mockStreamText = vi.mocked(streamText);

function createMockModel(): LanguageModelV1 {
  return {
    specificationVersion: "v1",
    provider: "test",
    modelId: "test-model",
    defaultObjectGenerationMode: "json" as const,
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  };
}

function makeTextStream(text: string): ReturnType<typeof streamText> {
  return {
    textStream: (async function* () {
      yield text;
    })(),
    text: Promise.resolve(text),
    toDataStreamResponse: vi.fn(),
  } as unknown as ReturnType<typeof streamText>;
}

describe("classifyIntentByRules", () => {
  it("detects shopping intent", () => {
    expect(classifyIntentByRules("show me birthday cakes")).toBe("shopping");
    expect(classifyIntentByRules("search for flowers")).toBe("shopping");
    expect(classifyIntentByRules("browse categories")).toBe("shopping");
    expect(classifyIntentByRules("find me a gift")).toBe("shopping");
    expect(classifyIntentByRules("compare prices")).toBe("shopping");
    expect(classifyIntentByRules("recommend something")).toBe("shopping");
  });

  it("detects logistics intent", () => {
    expect(classifyIntentByRules("can you deliver to Kandy?")).toBe("logistics");
    expect(classifyIntentByRules("check delivery to Colombo")).toBe("logistics");
    expect(classifyIntentByRules("show delivery cities")).toBe("logistics");
    expect(classifyIntentByRules("shipping cost to Galle")).toBe("logistics");
  });

  it("detects order intent", () => {
    expect(classifyIntentByRules("place my order")).toBe("order");
    expect(classifyIntentByRules("checkout")).toBe("order");
    expect(classifyIntentByRules("confirm order")).toBe("order");
  });

  it("detects Sri Lankan slang emotional patterns", () => {
    expect(classifyIntentByRules("gf case machan")).toBe("emotional");
    expect(classifyIntentByRules("my boyfriend scene is messed up")).toBe("emotional");
    expect(classifyIntentByRules("ex cut kala")).toBe("emotional");
    expect(classifyIntentByRules("case broke with my crush")).toBe("emotional");
    expect(classifyIntentByRules("patch up karanawa")).toBe("emotional");
    expect(classifyIntentByRules("podi aulk machan")).toBe("emotional");
    expect(classifyIntentByRules("aulak thamai")).toBe("emotional");
    expect(classifyIntentByRules("gediya wedi")).toBe("emotional");
  });

  it("detects comparison/indecision intent as shopping", () => {
    expect(classifyIntentByRules("apple da samsung da hithaganna ba mata phone")).toBe("shopping");
    expect(classifyIntentByRules("iPhone vs Samsung which is better phone")).toBe("shopping");
    expect(classifyIntentByRules("can't decide between apple and samsung phone")).toBe("shopping");
    expect(classifyIntentByRules("compare iPhone and Samsung phone")).toBe("shopping");
    expect(classifyIntentByRules("which is better iPhone or Samsung phone")).toBe("shopping");
    expect(classifyIntentByRules("hithaganna bari apple samsung phone")).toBe("shopping");
  });

  it("detects Tanglish 'X da Y da' comparison pattern", () => {
    expect(classifyIntentByRules("apple da samsung da hoda")).toBe("shopping");
    expect(classifyIntentByRules("cake da chocolate da")).toBe("shopping");
    expect(classifyIntentByRules("iphone da galaxy da mokada honda")).toBe("shopping");
  });

  it("detects Sinhala Unicode product requests", () => {
    expect(classifyIntentByRules("මට cake එකක් ඕනෙ")).toBe("shopping");
    expect(classifyIntentByRules("chocolate ekak ganna one")).toBe("shopping");
  });

  it("detects Singlish cart/shopping action patterns", () => {
    expect(classifyIntentByRules("cart ekata danna")).toBe("shopping");
    expect(classifyIntentByRules("Glitter Hearts eka cart ekata danna")).toBe("shopping");
    expect(classifyIntentByRules("meka add karanna")).toBe("shopping");
    expect(classifyIntentByRules("add karanawa")).toBe("shopping");
    expect(classifyIntentByRules("ekata danna")).toBe("shopping");
    expect(classifyIntentByRules("ekata ganna")).toBe("shopping");
  });

  it("detects Singlish checkout as order, order karanawa as order", () => {
    // "checkout karanawa" matches ORDER_PATTERNS via bare "checkout" word
    expect(classifyIntentByRules("checkout karanawa")).toBe("order");
    // "order karanna" matches ORDER_PATTERNS via "order.*karanna"
    expect(classifyIntentByRules("order karanna")).toBe("order");
    expect(classifyIntentByRules("order karanawa")).toBe("order");
    // "order eka place karanna" matches ORDER_PATTERNS via "order.*place"
    expect(classifyIntentByRules("ow, order eka place karanna. Springtime Birthday Ribbon Cake only")).toBe("order");
  });

  it("classifies recipient/sender details as order (not logistics)", () => {
    // Messages with "Recipient", "Sender", "Gift message" are providing order details,
    // even if they contain "Delivery" (which would otherwise match logistics)
    expect(classifyIntentByRules(
      "Recipient: Lahiru, Phone: 0713456789, Address: No 123 Galle Road Colombo 07, Delivery: June 18, Sender: Devin, Gift message: Happy Birthday machan!"
    )).toBe("order");
    expect(classifyIntentByRules("Sender: Devin, gift message: happy birthday")).toBe("order");
  });

  it("detects Sinhala Unicode cart patterns", () => {
    expect(classifyIntentByRules("මේක ගන්න")).toBe("shopping");
    expect(classifyIntentByRules("කාට් එකට දාන්න")).toBe("shopping");
    expect(classifyIntentByRules("එකට දාන්න")).toBe("shopping");
  });

  it("does NOT classify literal phone case as emotional", () => {
    // "phone case" has no relationship words nearby — should NOT match SL patterns
    expect(classifyIntentByRules("show me phone cases")).toBe("shopping");
    expect(classifyIntentByRules("buy a case for my iPhone")).toBe("shopping");
  });

  it("classifies short confirmations as general (preserves conversation flow)", () => {
    expect(classifyIntentByRules("ha")).toBe("general");
    expect(classifyIntentByRules("hari")).toBe("general");
    expect(classifyIntentByRules("ow")).toBe("general");
    expect(classifyIntentByRules("ok")).toBe("general");
    expect(classifyIntentByRules("yes")).toBe("general");
    expect(classifyIntentByRules("sure")).toBe("general");
    expect(classifyIntentByRules("hari machan")).toBe("general");
    expect(classifyIntentByRules("danna")).toBe("general");
    expect(classifyIntentByRules("ganna")).toBe("general");
    expect(classifyIntentByRules("go ahead")).toBe("general");
    expect(classifyIntentByRules("හරි")).toBe("general");
    expect(classifyIntentByRules("ඔව්")).toBe("general");
  });

  it("returns null for ambiguous messages", () => {
    expect(classifyIntentByRules("hello")).toBeNull();
    expect(classifyIntentByRules("how are you today")).toBeNull();
    expect(classifyIntentByRules("tell me a joke")).toBeNull();
  });

  it("returns general for empty input", () => {
    expect(classifyIntentByRules("")).toBe("general");
    expect(classifyIntentByRules("   ")).toBe("general");
  });
});

describe("classifyIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses rule-based detection for shopping without LLM call", async () => {
    const model = createMockModel();
    const result = await classifyIntent(model, "Show me birthday cakes");
    expect(result).toBe("shopping");
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("uses rule-based detection for logistics without LLM call", async () => {
    const model = createMockModel();
    const result = await classifyIntent(model, "Can you deliver to Kandy?");
    expect(result).toBe("logistics");
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("falls back to LLM for ambiguous messages", async () => {
    mockStreamText.mockReturnValue(makeTextStream("general"));
    const model = createMockModel();
    const result = await classifyIntent(model, "Hello!");
    expect(result).toBe("general");
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it("returns 'general' when LLM throws an error", async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error("API error");
    });
    const model = createMockModel();
    const result = await classifyIntent(model, "tell me something random");
    expect(result).toBe("general");
  });

  it("uses rule-based detection for order without LLM call", async () => {
    const model = createMockModel();
    const result = await classifyIntent(model, "Place my order with these items");
    expect(result).toBe("order");
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("falls back to LLM and trims/lowercases LLM output", async () => {
    mockStreamText.mockReturnValue(makeTextStream("  Shopping  "));
    const model = createMockModel();
    // This message doesn't match any rule patterns
    const result = await classifyIntent(model, "what do you have?");
    expect(result).toBe("shopping");
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });
});

describe("orchestrate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes shopping intent to shopper tools (rule-based, no LLM classifier call)", async () => {
    // "Show me cakes" matches rule-based shopping, so only 1 streamText call (agent)
    mockStreamText
      .mockReturnValueOnce(makeTextStream("Here are some products"));

    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "Show me cakes" }],
      language: "en",
    });

    expect(mockStreamText).toHaveBeenCalledTimes(1);
    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toBe("system-prompt-en-shopper");
    expect(getShopperTools).toHaveBeenCalled();
  });

  it("routes logistics intent to logistics tools (rule-based)", async () => {
    mockStreamText
      .mockReturnValueOnce(makeTextStream("Delivery info"));

    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "Check delivery to Colombo" }],
      language: "en",
    });

    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toBe("system-prompt-en-logistics");
    expect(getLogisticsTools).toHaveBeenCalled();
  });

  it("routes order intent to order tools (rule-based)", async () => {
    mockStreamText
      .mockReturnValueOnce(makeTextStream("Order placed!"));

    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "Place my order with cake ID: cake123" }],
      language: "en",
    });

    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toBe("system-prompt-en-order");
    expect(getOrderTools).toHaveBeenCalled();
  });

  it("routes general intent to all tools with language prompt (LLM fallback)", async () => {
    // "Hello there" doesn't match any rule patterns -> LLM classifier + agent = 2 calls
    mockStreamText
      .mockReturnValueOnce(makeTextStream("general"))
      .mockReturnValueOnce(makeTextStream("Hello!"));

    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "Hello there" }],
      language: "si",
    });

    expect(mockStreamText).toHaveBeenCalledTimes(2);
    const secondCall = mockStreamText.mock.calls[1][0];
    expect(secondCall.system).toBe("system-prompt-si");
    expect(getAllTools).toHaveBeenCalled();
  });

  it("skips LLM classifier for Singlish cart commands (rule-based hit)", async () => {
    // "cart ekata danna" matches SINGLISH_CART_PATTERNS -> rule-based shopping
    // For tanglish language: only 1 streamText call (the agent), no LLM classifier
    mockStreamText
      .mockReturnValueOnce(makeTextStream("Adding to cart!"));

    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "cart ekata danna" }],
      language: "tanglish",
    });

    // Only 1 streamText call (agent), NOT 2 (classifier + agent)
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toBe("system-prompt-tanglish-shopper");
    expect(getShopperTools).toHaveBeenCalled();
  });

  it("runs parallel LLM calls for ambiguous Sinhala input (no rule match)", async () => {
    // "kohomada" doesn't match any rule pattern -> needs LLM classifier
    // For si language: 1 streamText call for classifier + 1 for agent = 2
    mockStreamText
      .mockReturnValueOnce(makeTextStream("general"))
      .mockReturnValueOnce(makeTextStream("Kohomada machan!"));

    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "kohomada" }],
      language: "si",
    });

    // 2 streamText calls: LLM classifier + agent
    expect(mockStreamText).toHaveBeenCalledTimes(2);
    const agentCall = mockStreamText.mock.calls[1][0];
    expect(agentCall.system).toBe("system-prompt-si");
    expect(getAllTools).toHaveBeenCalled();
  });

  it("extracts the last user message correctly", async () => {
    // "second message" doesn't match rules -> LLM fallback
    mockStreamText
      .mockReturnValueOnce(makeTextStream("shopping"))
      .mockReturnValueOnce(makeTextStream("result"));

    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [
        { role: "user", content: "first message" },
        { role: "assistant", content: "response" },
        { role: "user", content: "second message" },
      ],
      language: "en",
    });

    // First call to streamText (classify) should use "second message"
    const classifyCall = mockStreamText.mock.calls[0][0];
    expect(classifyCall.messages).toEqual([{ role: "user", content: "second message" }]);
  });

  it("injects cart context into the system prompt when cart items are provided", async () => {
    mockStreamText
      .mockReturnValueOnce(makeTextStream("order"))
      .mockReturnValueOnce(makeTextStream("Placing your order!"));

    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "place my order" }],
      language: "en",
      cart: [
        { productId: "CAKE001", name: "Birthday Cake", price: 5000, currency: "LKR", quantity: 1 },
        { productId: "CHOC002", name: "Chocolate Box", price: 2500, currency: "LKR", quantity: 2 },
      ],
    });

    // The agent system prompt should contain cart context
    const agentCall = mockStreamText.mock.calls[0][0]; // rule-based order, so agent is first call
    expect(agentCall.system).toContain("Current Cart (2 items)");
    expect(agentCall.system).toContain("Birthday Cake");
    expect(agentCall.system).toContain("CAKE001");
    expect(agentCall.system).toContain("Chocolate Box");
    expect(agentCall.system).toContain("Subtotal");
  });

  it("does not inject cart context when cart is empty or undefined", async () => {
    mockStreamText
      .mockReturnValueOnce(makeTextStream("shopping"))
      .mockReturnValueOnce(makeTextStream("Here are some products"));

    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "show me cakes" }],
      language: "en",
      cart: [],
    });

    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).not.toContain("Current Cart");
  });
});
