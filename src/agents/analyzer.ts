import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { ANALYZER_SYSTEM_PROMPT } from "../utils/prompts.js";
import type { MonthSummary } from "../services/budget.js";

export interface AnalysisResult {
  healthScore: number;
  monthlyBalance: number;
  topSpendingCategories: Array<{
    category: string;
    amount: number;
    trend: "up" | "down" | "stable";
  }>;
  risks: Array<{ severity: "high" | "medium" | "low"; description: string }>;
  opportunities: Array<{ potentialSaving: number; description: string }>;
  canadianTips: string[];
  nextMonthForecast: {
    expectedIncome: number;
    expectedExpenses: number;
    recommendation: string;
  };
}

interface AnalyzerInput {
  currentMonth: MonthSummary;
  lastMonth: { totalIncome: number; totalExpenses: number; balance: number };
  trends: Array<{
    category: string;
    amount: number;
    group: string;
    trend: "up" | "down" | "stable";
    lastMonthAmount: number;
  }>;
  fixedExpenses: Array<{ name: string; amount: number; category: string }>;
  monthlyIncome: number;
}

export async function analyzeFinances(input: AnalyzerInput): Promise<AnalysisResult> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: ANALYZER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the financial data to analyze:\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch?.[0]) {
    throw new Error("Analyzer returned invalid response");
  }

  return JSON.parse(jsonMatch[0]) as AnalysisResult;
}
