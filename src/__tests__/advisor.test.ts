import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/env.js", () => ({
  getEnv: () => ({
    ANTHROPIC_API_KEY: "test-key",
    TELEGRAM_BOT_TOKEN: "test-token",
    OPENAI_API_KEY: "test-key",
    DATABASE_URL: "file:./test.db",
    NODE_ENV: "test",
    LOG_LEVEL: "info",
  }),
}));

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { generateAdvice } from "../agents/advisor.js";
import type { AnalysisResult } from "../agents/analyzer.js";

describe("Advisor Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleAnalysis: AnalysisResult = {
    healthScore: 72,
    monthlyBalance: 1300,
    topSpendingCategories: [
      { category: "Mortgage", amount: 1200, trend: "stable" },
      { category: "Groceries", amount: 400, trend: "down" },
      { category: "Restaurant", amount: 214, trend: "up" },
    ],
    risks: [
      { severity: "medium", description: "Restaurant spending trending up" },
    ],
    opportunities: [
      { potentialSaving: 114, description: "Reduce restaurant spending from $214 to $100" },
    ],
    canadianTips: ["Maximize TFSA contributions before RRSP"],
    nextMonthForecast: {
      expectedIncome: 4500,
      expectedExpenses: 3300,
      recommendation: "Allocate extra $200 to emergency fund",
    },
  };

  it("should generate advice message", async () => {
    const adviceText =
      "Your finances are looking solid this month with a *$1,300* surplus.\n\n" +
      "• *Restaurant spending* hit $214 — cutting to $100 saves *$114/month*\n" +
      "• Put *$200* toward your emergency fund this month\n" +
      "• Consider a TFSA contribution with the surplus\n\n" +
      "This week: Skip eating out and cook at home.";

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: adviceText }],
    });

    const result = await generateAdvice(sampleAnalysis);
    expect(result).toContain("$1,300");
    expect(result).toContain("Restaurant");
    expect(result.length).toBeGreaterThan(50);
  });

  it("should throw on empty response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "" }],
    });

    await expect(generateAdvice(sampleAnalysis)).rejects.toThrow("Advisor returned empty response");
  });

  it("should use sonnet model", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Some advice" }],
    });

    await generateAdvice(sampleAnalysis);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-20250514",
      })
    );
  });
});
