import { describe, it, expect, afterEach } from "vitest";
import { getModelName, getApiModelName, getModelConfig, MODEL_CONFIGS, DEFAULT_MODEL, DEFAULT_CONFIG } from "@/lib/modelConfig";

describe("modelConfig", () => {
  const originalEnv = process.env.AI_MODEL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AI_MODEL = originalEnv;
    } else {
      delete process.env.AI_MODEL;
    }
  });

  describe("getModelName", () => {
    it("returns default model when AI_MODEL is not set", () => {
      delete process.env.AI_MODEL;
      expect(getModelName()).toBe(DEFAULT_MODEL);
    });

    it("returns AI_MODEL env var when set", () => {
      process.env.AI_MODEL = "gpt-4o-direct";
      expect(getModelName()).toBe("gpt-4o-direct");
    });
  });

  describe("getApiModelName", () => {
    it("resolves gpt-4o-direct to gpt-4o for OpenAI API", () => {
      process.env.AI_MODEL = "gpt-4o-direct";
      expect(getApiModelName()).toBe("gpt-4o");
    });

    it("resolves gpt-4o-mini-direct to gpt-4o-mini for OpenAI API", () => {
      process.env.AI_MODEL = "gpt-4o-mini-direct";
      expect(getApiModelName()).toBe("gpt-4o-mini");
    });

    it("returns config key as-is when no apiModelName mapping exists", () => {
      process.env.AI_MODEL = "gpt-4o-mini";
      expect(getApiModelName()).toBe("gpt-4o-mini");
    });

    it("returns config key as-is for unknown models", () => {
      process.env.AI_MODEL = "some-future-model";
      expect(getApiModelName()).toBe("some-future-model");
    });

    it("returns default model name when AI_MODEL is not set", () => {
      delete process.env.AI_MODEL;
      expect(getApiModelName()).toBe(DEFAULT_MODEL);
    });
  });

  describe("getModelConfig", () => {
    it("returns correct config for gpt-4o-direct (large context)", () => {
      process.env.AI_MODEL = "gpt-4o-direct";
      const config = getModelConfig();
      expect(config.messageBudget).toBe(32000);
      expect(config.lastMessageLimit).toBe(8000);
      expect(config.apiModelName).toBe("gpt-4o");
    });

    it("returns correct config for gpt-4o-mini-direct", () => {
      process.env.AI_MODEL = "gpt-4o-mini-direct";
      const config = getModelConfig();
      expect(config.messageBudget).toBe(16000);
      expect(config.lastMessageLimit).toBe(4000);
      expect(config.apiModelName).toBe("gpt-4o-mini");
    });

    it("returns correct config for GitHub Models gpt-4o-mini", () => {
      process.env.AI_MODEL = "gpt-4o-mini";
      const config = getModelConfig();
      expect(config.messageBudget).toBe(4000);
      expect(config.lastMessageLimit).toBe(2000);
      expect(config.apiModelName).toBeUndefined();
    });

    it("returns default config for unknown models", () => {
      process.env.AI_MODEL = "unknown-model";
      const config = getModelConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe("MODEL_CONFIGS", () => {
    it("has direct API configs with higher budgets than GitHub Models configs", () => {
      expect(MODEL_CONFIGS["gpt-4o-direct"].messageBudget).toBeGreaterThan(
        MODEL_CONFIGS["gpt-4o"].messageBudget
      );
      expect(MODEL_CONFIGS["gpt-4o-mini-direct"].messageBudget).toBeGreaterThan(
        MODEL_CONFIGS["gpt-4o-mini"].messageBudget
      );
    });

    it("all direct API configs have apiModelName set", () => {
      for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
        if (key.endsWith("-direct")) {
          expect(config.apiModelName).toBeDefined();
          expect(config.apiModelName).not.toContain("-direct");
        }
      }
    });
  });
});
