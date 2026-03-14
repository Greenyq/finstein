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

import { analyzeFinances, type AnalysisResult } from "../agents/analyzer.js";

describe("Analyzer Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleInput = {
    currentMonth: {
      totalIncome: 4500,
      totalExpenses: 3200,
      totalFixed: 1800,
      totalNeeds: 600,
      totalWants: 500,
      totalSavings: 300,
      balance: 1300,
      transactionCount: 25,
      categoryBreakdown: [
        { category: "Mortgage", amount: 1200, group: "fixed" },
        { category: "Groceries", amount: 400, group: "needs" },
        { category: "Restaurant", amount: 214, group: "wants" },
      ],
    },
    lastMonth: {
      totalIncome: 4200,
      totalExpenses: 3500,
      balance: 700,
    },
    trends: [
      { category: "Mortgage", amount: 1200, group: "fixed", trend: "stable" as const, lastMonthAmount: 1200 },
      { category: "Groceries", amount: 400, group: "needs", trend: "down" as const, lastMonthAmount: 450 },
      { category: "Restaurant", amount: 214, group: "wants", trend: "up" as const, lastMonthAmount: 150 },
    ],
    fixedExpenses: [
      { name: "Mortgage", amount: 1200, category: "Mortgage" },
      { name: "Car Insurance", amount: 150, category: "Car Insurance" },
    ],
    monthlyIncome: 4500,
  };

  it("should return a valid analysis", async () => {
    const mockAnalysis: AnalysisResult = {
      healthScore: 72,
      monthlyBalance: 1300,
      topSpendingCategories: [
        { category: "Mortgage", amount: 1200, trend: "stable" },
        { category: "Groceries", amount: 400, trend: "down" },
      ],
      risks: [
        { severity: "medium", description: "Restaurant spending trending up" },
      ],
      opportunities: [
        { potentialSaving: 114, description: "Reduce restaurant spending" },
      ],
      canadianTips: ["Maximize TFSA contributions before RRSP"],
      nextMonthForecast: {
        expectedIncome: 4500,
        expectedExpenses: 3300,
        recommendation: "Allocate extra $200 to emergency fund",
      },
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(mockAnalysis) }],
    });

    const result = await analyzeFinances(sampleInput);
    expect(result.healthScore).toBe(72);
    expect(result.monthlyBalance).toBe(1300);
    expect(result.risks).toHaveLength(1);
    expect(result.opportunities).toHaveLength(1);
    expect(result.canadianTips).toHaveLength(1);
  });

  it("should throw on invalid response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "invalid response" }],
    });

    await expect(analyzeFinances(sampleInput)).rejects.toThrow("Analyzer returned invalid response");
  });

  it("should call Claude with sonnet model", async () => {
    const mockAnalysis: AnalysisResult = {
      healthScore: 80,
      monthlyBalance: 1300,
      topSpendingCategories: [],
      risks: [],
      opportunities: [],
      canadianTips: [],
      nextMonthForecast: {
        expectedIncome: 4500,
        expectedExpenses: 3200,
        recommendation: "Keep up the good work",
      },
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(mockAnalysis) }],
    });

    await analyzeFinances(sampleInput);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6-20250514",
      })
    );
  });
});
