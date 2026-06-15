import { describe, it, expect } from "vitest";
import { getAllTools, getShopperTools, getLogisticsTools, getOrderTools } from "@/lib/agents/tools";

describe("getAllTools", () => {
  it("returns all 7 tools", () => {
    const tools = getAllTools();
    const names = Object.keys(tools);
    expect(names).toHaveLength(7);
    expect(names).toContain("kapruka_search_products");
    expect(names).toContain("kapruka_get_product");
    expect(names).toContain("kapruka_list_categories");
    expect(names).toContain("kapruka_list_delivery_cities");
    expect(names).toContain("kapruka_check_delivery");
    expect(names).toContain("kapruka_create_order");
    expect(names).toContain("kapruka_track_order");
  });

  it("each tool has a description and parameters", () => {
    const tools = getAllTools();
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool, `${name} should be defined`).toBeDefined();
      expect(typeof (tool as { description?: string }).description).toBe("string");
      expect((tool as { parameters?: unknown }).parameters).toBeDefined();
    }
  });
});

describe("getShopperTools", () => {
  it("returns only shopping-related tools", () => {
    const tools = getShopperTools();
    const names = Object.keys(tools);
    expect(names).toHaveLength(3);
    expect(names).toContain("kapruka_search_products");
    expect(names).toContain("kapruka_get_product");
    expect(names).toContain("kapruka_list_categories");
  });

  it("does not include logistics or order tools", () => {
    const tools = getShopperTools();
    const names = Object.keys(tools);
    expect(names).not.toContain("kapruka_list_delivery_cities");
    expect(names).not.toContain("kapruka_check_delivery");
    expect(names).not.toContain("kapruka_create_order");
    expect(names).not.toContain("kapruka_track_order");
  });
});

describe("getLogisticsTools", () => {
  it("returns only logistics-related tools", () => {
    const tools = getLogisticsTools();
    const names = Object.keys(tools);
    expect(names).toHaveLength(2);
    expect(names).toContain("kapruka_list_delivery_cities");
    expect(names).toContain("kapruka_check_delivery");
  });

  it("does not include shopping or order tools", () => {
    const tools = getLogisticsTools();
    const names = Object.keys(tools);
    expect(names).not.toContain("kapruka_search_products");
    expect(names).not.toContain("kapruka_get_product");
    expect(names).not.toContain("kapruka_list_categories");
    expect(names).not.toContain("kapruka_create_order");
    expect(names).not.toContain("kapruka_track_order");
  });
});

describe("getOrderTools", () => {
  it("returns order and delivery tools", () => {
    const tools = getOrderTools();
    const names = Object.keys(tools);
    expect(names).toHaveLength(3);
    expect(names).toContain("kapruka_create_order");
    expect(names).toContain("kapruka_list_delivery_cities");
    expect(names).toContain("kapruka_check_delivery");
  });

  it("does not include shopping or tracking tools", () => {
    const tools = getOrderTools();
    const names = Object.keys(tools);
    expect(names).not.toContain("kapruka_search_products");
    expect(names).not.toContain("kapruka_track_order");
  });
});
