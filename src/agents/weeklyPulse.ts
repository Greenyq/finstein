import { createMessage } from "../utils/anthropic.js";
import { WEEKLY_PULSE_SYSTEM_PROMPT } from "../utils/prompts.js";

export interface WeeklyPulseInput {
  userName: string;
  weekExpenses: number;
  weekIncome: number;
  monthlyIncome: number;
  avgWeeklyExpenses: number;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    avgAmount: number;
    pctChange: number | null; // pre-computed % change vs 4-week avg, null if no prior data
  }>;
  weekTransactions?: Array<{
    amount: number;
    category: string;
    description: string | null;
  }>;
  fixedExpenses?: Array<{
    name: string;
    amount: number;
    category: string;
  }>;
  budgetLimits?: Array<{
    category: string;
    limit: number;
  }>;
  dealSearchResult?: string; // web search results for better deals on recurring bills
  lang: string;
}

export async function generateWeeklyPulse(input: WeeklyPulseInput): Promise<string> {
  const response = await createMessage({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    system: WEEKLY_PULSE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("WeeklyPulse agent returned empty response");
  return text;
}
