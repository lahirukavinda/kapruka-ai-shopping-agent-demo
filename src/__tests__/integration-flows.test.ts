import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration tests for checkout, delivery, and tracking flows.
 * Tests the full pipeline: intent classification → tool routing → response parsing → UI rendering data.
 */

// ─── Mock setup ──────────────────────────────────────────────────────────────

vi.mock("ai", () => ({
  streamText: vi.fn(),
  generateObject: vi.fn(),
}));

vi.mock("@/lib/agents/concierge", () => ({
  getSystemPromptForLanguage: vi.fn(
    (lang: string, addendum?: string) =>
      `system-prompt-${lang}${addendum ?? ""}`
  ),
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

import {
  classifyIntentByRules,
  orchestrate,
} from "@/lib/agents/orchestrator";
import {
  parseOrder,
  parseDelivery,
  parseTracking,
  parseCities,
} from "@/lib/parsers";
import { parseResponseActions } from "@/lib/parseResponseActions";
import { streamText } from "ai";
import type { LanguageModelV1 } from "ai";
import {
  getOrderTools,
  getLogisticsTools,
  getAllTools,
} from "@/lib/agents/tools";

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

// ─── Checkout Flow Integration Tests ─────────────────────────────────────────

describe("Checkout Flow Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies 'checkout' as order intent via rules (no LLM call)", () => {
    expect(classifyIntentByRules("checkout")).toBe("order");
    expect(classifyIntentByRules("I want to checkout")).toBe("order");
    expect(classifyIntentByRules("proceed to checkout")).toBe("order");
  });

  it("classifies 'place my order' as order intent via rules", () => {
    expect(classifyIntentByRules("place my order")).toBe("order");
    expect(classifyIntentByRules("place the order now")).toBe("order");
    expect(classifyIntentByRules("confirm order")).toBe("order");
  });

  it("classifies Singlish order patterns as order intent", () => {
    expect(classifyIntentByRules("order karanna")).toBe("order");
    expect(classifyIntentByRules("order karanawa")).toBe("order");
    expect(classifyIntentByRules("order eka place karanna")).toBe("order");
    expect(classifyIntentByRules("checkout karanawa")).toBe("order");
  });

  it("classifies order details (recipient/sender) as order, not logistics", () => {
    const orderDetailsMsg =
      "Recipient: Lahiru, Phone: 0713456789, Address: 123 Galle Road Colombo 07, Delivery: June 18, Sender: Devin";
    expect(classifyIntentByRules(orderDetailsMsg)).toBe("order");
  });

  it("routes checkout to order tools with order addendum", async () => {
    mockStreamText.mockReturnValueOnce(makeTextStream("Order placed!"));
    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "checkout" }],
      language: "en",
    });
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toContain("order");
    expect(getOrderTools).toHaveBeenCalled();
  });

  it("routes checkout with cart context — model knows cart items", async () => {
    mockStreamText.mockReturnValueOnce(
      makeTextStream("Placing order for Birthday Cake!")
    );
    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "place my order" }],
      language: "en",
      cart: [
        {
          productId: "CAKE001",
          name: "Birthday Cake",
          price: 5000,
          currency: "LKR",
          quantity: 1,
        },
      ],
    });
    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toContain("Current Cart (1 item)");
    expect(agentCall.system).toContain("Birthday Cake");
    expect(agentCall.system).toContain("CAKE001");
    expect(agentCall.system).toContain("5,000");
  });

  it("parses real Kapruka create_order API response shape", () => {
    const apiResponse = {
      summary: {
        items_total: 4200,
        delivery_fee: 300,
        grand_total: 4500,
        currency: "LKR",
      },
      checkout_url:
        "https://www.kapruka.com/tools/continue_order.jsp?id=8BJ7PGQMEQ65",
      expires_at: "2026-06-15T23:25:55+05:30",
      order_ref: "ORD-20260615-EQ65",
    };
    const result = parseOrder(apiResponse);
    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("ORD-20260615-EQ65");
    expect(result!.orderRef).toBe("ORD-20260615-EQ65");
    expect(result!.payUrl).toBe(
      "https://www.kapruka.com/tools/continue_order.jsp?id=8BJ7PGQMEQ65"
    );
    expect(result!.checkoutUrl).toBe(
      "https://www.kapruka.com/tools/continue_order.jsp?id=8BJ7PGQMEQ65"
    );
    expect(result!.total).toBe(4500);
    expect(result!.currency).toBe("LKR");
    expect(result!.summary).toBeDefined();
    expect(result!.summary!.items_total).toBe(4200);
    expect(result!.summary!.delivery_fee).toBe(300);
    expect(result!.summary!.grand_total).toBe(4500);
  });

  it("parses order without order_id (only checkout_url)", () => {
    const data = {
      checkout_url: "https://kapruka.com/checkout/abc123",
      expires_at: "2026-06-16T00:00:00Z",
    };
    const result = parseOrder(data);
    expect(result).not.toBeNull();
    expect(result!.payUrl).toBe("https://kapruka.com/checkout/abc123");
  });

  it("parses order from MCP content wrapper with summary", () => {
    const data = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            order_ref: "ORD-TEST-001",
            checkout_url: "https://kapruka.com/pay/test",
            summary: {
              items_total: 10000,
              delivery_fee: 500,
              grand_total: 10500,
              currency: "LKR",
            },
          }),
        },
      ],
    };
    const result = parseOrder(data);
    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("ORD-TEST-001");
    expect(result!.total).toBe(10500);
    expect(result!.summary!.delivery_fee).toBe(500);
  });

  it("does not parse order confirmation items as clickable chips", () => {
    const orderText = `Order confirmed! 🎉
• Cake: Springtime Birthday Ribbon Cake
• Total: LKR 5,770
• Delivery Fee: LKR 300
• Payment: [මෙතනින්](https://kapruka.com/pay)`;
    const actions = parseResponseActions(orderText);
    expect(actions).toHaveLength(0);
  });

  it("filters out LKR/price/URL items from action chips", () => {
    const text = `Here are your options:
- Birthday Cake LKR 5,000
- Checkout at https://kapruka.com
- Subtotal: LKR 10,000`;
    const actions = parseResponseActions(text);
    expect(actions).toHaveLength(0);
  });
});

// ─── Delivery Check Flow Integration Tests ───────────────────────────────────

describe("Delivery Check Flow Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies delivery queries as logistics intent via rules", () => {
    expect(classifyIntentByRules("check delivery to Colombo")).toBe(
      "logistics"
    );
    expect(classifyIntentByRules("can you deliver to Kandy?")).toBe(
      "logistics"
    );
    expect(classifyIntentByRules("show delivery cities")).toBe("logistics");
    expect(classifyIntentByRules("shipping cost to Galle")).toBe("logistics");
    expect(classifyIntentByRules("delivery date for Matara")).toBe("logistics");
    expect(classifyIntentByRules("where do you deliver?")).toBe("logistics");
  });

  it("classifies Singlish delivery patterns as logistics", () => {
    expect(
      classifyIntentByRules("Colombo walata delivery check karanna")
    ).toBe("logistics");
    expect(classifyIntentByRules("delivery rate kiyanawa")).toBe("logistics");
  });

  it("routes delivery check to logistics tools with logistics addendum", async () => {
    mockStreamText.mockReturnValueOnce(
      makeTextStream("Delivery available to Colombo 07!")
    );
    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "check delivery to Colombo" }],
      language: "en",
    });
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toContain("logistics");
    expect(getLogisticsTools).toHaveBeenCalled();
  });

  it("parses delivery available response", () => {
    const data = {
      city: "Colombo 07",
      available: true,
      delivery_date: "2026-06-18",
      rate: 300,
      currency: "LKR",
    };
    const result = parseDelivery(data);
    expect(result).not.toBeNull();
    expect(result!.city).toBe("Colombo 07");
    expect(result!.available).toBe(true);
    expect(result!.deliveryDate).toBe("2026-06-18");
    expect(result!.rate).toBe(300);
    expect(result!.currency).toBe("LKR");
  });

  it("parses delivery unavailable response", () => {
    const data = {
      city: "Remote Village",
      available: false,
      delivery_date: "",
      rate: 0,
    };
    const result = parseDelivery(data);
    expect(result).not.toBeNull();
    expect(result!.available).toBe(false);
    expect(result!.rate).toBe(0);
  });

  it("parses delivery with perishable warning", () => {
    const data = {
      city: "Kandy",
      available: true,
      delivery_date: "2026-06-19",
      rate: 500,
      perishable_warning: "Perishable items require cold storage",
    };
    const result = parseDelivery(data);
    expect(result).not.toBeNull();
    expect(result!.perishableWarning).toBe(
      "Perishable items require cold storage"
    );
  });

  it("parses delivery from MCP content wrapper", () => {
    const data = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            city: "Galle",
            available: true,
            delivery_date: "2026-06-20",
            rate: 400,
          }),
        },
      ],
    };
    const result = parseDelivery(data);
    expect(result).not.toBeNull();
    expect(result!.city).toBe("Galle");
    expect(result!.available).toBe(true);
  });

  it("parses Colombo sub-area cities list", () => {
    const data = {
      cities: [
        { name: "Colombo 01", aliases: ["Fort"] },
        { name: "Colombo 03", aliases: ["Kollupitiya"] },
        { name: "Colombo 07", aliases: ["Cinnamon Gardens"] },
        { name: "Colombo 10", aliases: ["Maradana"] },
        { name: "Colombo 15", aliases: ["Mutwal"] },
      ],
    };
    const result = parseCities(data);
    expect(result).toHaveLength(5);
    expect(result[0].name).toBe("Colombo 01");
    expect(result[0].aliases).toEqual(["Fort"]);
    expect(result[2].name).toBe("Colombo 07");
    expect(result[2].aliases).toEqual(["Cinnamon Gardens"]);
  });

  it("parses cities from MCP content wrapper", () => {
    const data = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            cities: [
              { name: "Kandy" },
              { name: "Galle" },
              { name: "Matara" },
            ],
          }),
        },
      ],
    };
    const result = parseCities(data);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.name)).toEqual(["Kandy", "Galle", "Matara"]);
  });

  it("generates delivery sub-area options as action chips", () => {
    const text = `Colombo has several delivery zones:
1. Colombo 01 (Fort)
2. Colombo 03 (Kollupitiya)
3. Colombo 07 (Cinnamon Gardens)
4. Colombo 10 (Maradana)`;
    const actions = parseResponseActions(text);
    expect(actions.length).toBeGreaterThanOrEqual(4);
    expect(actions[0].label).toContain("Colombo 01");
    expect(actions[2].label).toContain("Colombo 07");
  });
});

// ─── Tracking Flow Integration Tests ─────────────────────────────────────────

describe("Order Tracking Flow Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies tracking queries as general (uses all tools)", () => {
    // Tracking is classified as "general" so the model gets all tools
    // and can call kapruka_track_order
    expect(classifyIntentByRules("track my order")).toBeNull();
    expect(classifyIntentByRules("where is my order?")).toBeNull();
  });

  it("routes tracking queries to all tools via LLM fallback", async () => {
    mockStreamText
      .mockReturnValueOnce(makeTextStream("general"))
      .mockReturnValueOnce(makeTextStream("Tracking your order..."));
    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "track my order ORD-12345" }],
      language: "en",
    });
    expect(mockStreamText).toHaveBeenCalledTimes(2);
    expect(getAllTools).toHaveBeenCalled();
  });

  it("parses tracking response with all steps", () => {
    const data = {
      order_id: "ORD-20260615-EQ65",
      status: "shipped",
      steps: [
        {
          title: "Order Placed",
          completed: true,
          current: false,
          timestamp: "2026-06-15T10:00:00Z",
        },
        {
          title: "Payment Confirmed",
          completed: true,
          current: false,
          timestamp: "2026-06-15T10:05:00Z",
        },
        {
          title: "Shipped",
          completed: true,
          current: true,
          timestamp: "2026-06-15T14:00:00Z",
        },
        {
          title: "Out for Delivery",
          completed: false,
          current: false,
        },
        {
          title: "Delivered",
          completed: false,
          current: false,
        },
      ],
      estimated_delivery: "2026-06-18",
    };
    const result = parseTracking(data);
    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("ORD-20260615-EQ65");
    expect(result!.status).toBe("shipped");
    expect(result!.steps).toHaveLength(5);
    expect(result!.steps[2].title).toBe("Shipped");
    expect(result!.steps[2].current).toBe(true);
    expect(result!.estimatedDelivery).toBe("2026-06-18");
  });

  it("parses tracking response with delivered status", () => {
    const data = {
      order_id: "ORD-DELIVERED-001",
      status: "delivered",
      steps: [
        { title: "Order Placed", completed: true, current: false },
        { title: "Shipped", completed: true, current: false },
        { title: "Delivered", completed: true, current: true },
      ],
      estimated_delivery: "2026-06-16",
    };
    const result = parseTracking(data);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("delivered");
    expect(result!.steps[2].completed).toBe(true);
    expect(result!.steps[2].current).toBe(true);
  });

  it("parses tracking from MCP content wrapper", () => {
    const data = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            order_id: "ORD-MCP-001",
            status: "processing",
            steps: [
              { title: "Order Placed", completed: true, current: true },
            ],
            estimated_delivery: "2026-06-20",
          }),
        },
      ],
    };
    const result = parseTracking(data);
    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("ORD-MCP-001");
    expect(result!.status).toBe("processing");
  });

  it("returns null for order_not_found tracking response", () => {
    const data = { error: "order_not_found" };
    const result = parseTracking(data);
    expect(result).toBeNull();
  });

  it("returns null for empty tracking response", () => {
    expect(parseTracking({})).toBeNull();
    expect(parseTracking(null)).toBeNull();
  });
});

// ─── End-to-End Flow Integration Tests ───────────────────────────────────────

describe("E2E Flow: Search \u2192 Checkout \u2192 Delivery \u2192 Order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("search → add to cart → checkout routes correctly with cart context", async () => {
    // Step 1: Search (shopping intent)
    expect(classifyIntentByRules("show me birthday cakes")).toBe("shopping");

    // Step 2: Add to cart (shopping intent)
    expect(classifyIntentByRules("add the first cake to my cart")).toBe(
      "shopping"
    );

    // Step 3: Checkout (order intent) with cart items
    mockStreamText.mockReturnValueOnce(
      makeTextStream("Order placed successfully!")
    );
    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [
        { role: "user", content: "show me birthday cakes" },
        { role: "assistant", content: "Here are 7 cakes..." },
        { role: "user", content: "add the first one to cart" },
        { role: "assistant", content: "Added to cart!" },
        { role: "user", content: "checkout" },
      ],
      language: "en",
      cart: [
        {
          productId: "SPRING001",
          name: "Springtime Birthday Ribbon Cake",
          price: 5770,
          currency: "LKR",
          quantity: 1,
        },
      ],
    });

    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toContain("Current Cart (1 item)");
    expect(agentCall.system).toContain("Springtime Birthday Ribbon Cake");
    expect(agentCall.system).toContain("5,770");
    expect(getOrderTools).toHaveBeenCalled();
  });

  it("multi-item cart shows correct subtotal in system prompt", async () => {
    mockStreamText.mockReturnValueOnce(
      makeTextStream("Placing your order!")
    );
    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "place my order" }],
      language: "en",
      cart: [
        {
          productId: "CAKE001",
          name: "Springtime Birthday Ribbon Cake",
          price: 5770,
          currency: "LKR",
          quantity: 1,
        },
        {
          productId: "COMIC001",
          name: "Candle Deco Comic Ribbon Cake",
          price: 3930,
          currency: "LKR",
          quantity: 1,
        },
      ],
    });

    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toContain("Current Cart (2 items)");
    expect(agentCall.system).toContain("Springtime Birthday Ribbon Cake");
    expect(agentCall.system).toContain("Candle Deco Comic Ribbon Cake");
    expect(agentCall.system).toContain("9,700");
  });

  it("delivery check → Colombo sub-areas → select area flow", () => {
    // Step 1: Delivery check classified as logistics
    expect(classifyIntentByRules("check delivery to Colombo")).toBe(
      "logistics"
    );

    // Step 2: Sub-area selection (Colombo 07) — classified as logistics
    expect(classifyIntentByRules("Colombo 07")).toBeNull(); // Falls to LLM (which is fine)

    // Step 3: Parse the delivery result
    const deliveryResult = parseDelivery({
      city: "Colombo 07",
      available: true,
      delivery_date: "2026-06-18",
      rate: 300,
      currency: "LKR",
    });
    expect(deliveryResult!.available).toBe(true);
    expect(deliveryResult!.rate).toBe(300);
  });

  it("confirmation after delivery check routes to general (all tools)", () => {
    // After model asks "Should I proceed with the order?",
    // user says "ha" (Sinhala yes) — should get all tools
    expect(classifyIntentByRules("ha")).toBe("general");
    expect(classifyIntentByRules("hari")).toBe("general");
    expect(classifyIntentByRules("yes")).toBe("general");
    expect(classifyIntentByRules("ok")).toBe("general");
    expect(classifyIntentByRules("ow")).toBe("general");
    expect(classifyIntentByRules("sure")).toBe("general");
  });

  it("logistics intent does not get order tools", async () => {
    mockStreamText.mockReturnValueOnce(
      makeTextStream("Delivery available for June 18!")
    );
    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [
        { role: "user", content: "check delivery to Colombo 07" },
      ],
      language: "en",
    });

    expect(getLogisticsTools).toHaveBeenCalled();
    expect(getOrderTools).not.toHaveBeenCalled();
  });
});

// ─── Tanglish/Sinhala Flow Tests ─────────────────────────────────────────────

describe("Tanglish/Sinhala Checkout & Delivery Flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies Tanglish checkout patterns correctly", () => {
    expect(classifyIntentByRules("checkout karanawa")).toBe("order");
    expect(classifyIntentByRules("order karanna")).toBe("order");
    expect(classifyIntentByRules("order eka place karanna machan")).toBe(
      "order"
    );
  });

  it("classifies Tanglish delivery patterns correctly", () => {
    expect(
      classifyIntentByRules("Colombo walata delivery check karanna")
    ).toBe("logistics");
    expect(classifyIntentByRules("delivery rate kiyanawa")).toBe("logistics");
    expect(classifyIntentByRules("delivery available da?")).toBe("logistics");
  });

  it("classifies Sinhala confirmations correctly", () => {
    expect(classifyIntentByRules("හරි")).toBe("general");
    expect(classifyIntentByRules("ඔව්")).toBe("general");
    expect(classifyIntentByRules("දෙන්න")).toBe("general");
    expect(classifyIntentByRules("ගන්න")).toBe("general");
  });

  it("Tanglish checkout routes to order tools", async () => {
    mockStreamText.mockReturnValueOnce(
      makeTextStream("ඔයාගේ order එක confirm කරා!")
    );
    const model = createMockModel();
    await orchestrate({
      classifierModel: model,
      agentModel: model,
      messages: [{ role: "user", content: "checkout karanawa" }],
      language: "tanglish",
    });

    // Should route to order tools (not logistics/shopping)
    expect(getOrderTools).toHaveBeenCalled();
    const agentCall = mockStreamText.mock.calls[0][0];
    expect(agentCall.system).toBe("system-prompt-tanglish-order");
  });
});

// ─── Payment Button Graceful Degradation Tests ──────────────────────────────

describe("Payment Button Graceful Degradation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("payment URLs in order confirmation are not parsed as action chips", () => {
    const orderText = `Order confirmed! 🎉
Reference: ORD-20260616-G7IV
Total: LKR 4,500
Payment: [මෙතනින්](https://www.kapruka.com/tools/continue_order.jsp?id=TEST123)`;
    const actions = parseResponseActions(orderText);
    expect(actions).toHaveLength(0);
  });

  it("payment link with kapruka.com/tools/continue_order is filtered from chips", () => {
    const text = `Pay here: [Click to pay](https://www.kapruka.com/tools/continue_order.jsp?id=ABC)`;
    const actions = parseResponseActions(text);
    expect(actions).toHaveLength(0);
  });

  it("order flow response with payment link does not generate clickable actions", () => {
    const responseText = `Ela! ඔයාගේ order එක confirm කරා! 🎉 Total එක LKR 4,500.
ඔයාට payment කරන්න [මෙතනින්](https://www.kapruka.com/tools/continue_order.jsp?id=XYZ) යන්න පුළුවන්.
Order එක ගැන තවත් දෙයක් ඕනෙ නම් කියන්න!`;
    const actions = parseResponseActions(responseText);
    expect(actions).toHaveLength(0);
  });

  it("checkout with recipient details classifies as order intent", () => {
    expect(classifyIntentByRules("checkout karanawa")).toBe("order");
    // Recipient/Sender prefixed format also classifies as order
    const orderDetails =
      "Recipient: Lahiru, Phone: 0771234567, Address: 45 Galle Road Colombo 07, Delivery: June 25";
    expect(classifyIntentByRules(orderDetails)).toBe("order");
  });

  it("parseOrder extracts payment URL for client-side PaymentButton rendering", () => {
    const apiResponse = {
      order_ref: "ORD-20260616-G7IV",
      checkout_url:
        "https://www.kapruka.com/tools/continue_order.jsp?id=TESTPAY",
      summary: {
        items_total: 4200,
        delivery_fee: 300,
        grand_total: 4500,
        currency: "LKR",
      },
      expires_at: "2026-06-16T12:00:00+05:30",
    };
    const result = parseOrder(apiResponse);
    expect(result).not.toBeNull();
    expect(result!.payUrl).toContain("continue_order");
    expect(result!.orderId).toBe("ORD-20260616-G7IV");
    expect(result!.total).toBe(4500);
  });
});

// ─── Action Chip Generation Tests ────────────────────────────────────────────

describe("Post-Action Chip Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates action chips from numbered list of Colombo sub-areas", () => {
    const text = `Here are the Colombo delivery zones:
1. Colombo 01 (Fort)
2. Colombo 03 (Kollupitiya)
3. Colombo 04 (Bambalapitiya)
4. Colombo 07 (Cinnamon Gardens)
5. Colombo 10 (Maradana)`;
    const actions = parseResponseActions(text);
    expect(actions.length).toBe(5);
    expect(actions[0].label).toContain("Colombo 01");
  });

  it("does not generate chips from order confirmation bullets", () => {
    const text = `ඔයාගේ order එක confirm කරා! 🎉
• Cake: LKR 5,770
• Delivery Fee: LKR 300
• Total: LKR 6,070`;
    const actions = parseResponseActions(text);
    expect(actions).toHaveLength(0);
  });

  it("generates product view chips from product list", () => {
    const text = `Here are some cakes:
1. Springtime Birthday Ribbon Cake — A pastel ribbon cake
2. Design Birthday Cake — Exquisite artistry
3. Happy Birthday Symphony Ribbon Cake — A centerpiece`;
    const actions = parseResponseActions(text);
    expect(actions.length).toBe(3);
    // Labels are truncated to 30 chars by parseResponseActions
    expect(actions[0].label).toContain("Springtime Birthday Ribbon Cak");
  });

  it("does not generate chips from payment URLs", () => {
    const text = `Order confirmed! Pay here:
- https://kapruka.com/pay/abc123
- මෙතනින් pay karanna`;
    const actions = parseResponseActions(text);
    expect(actions).toHaveLength(0);
  });
});
