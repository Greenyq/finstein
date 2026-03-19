import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { WEEKLY_PULSE_SYSTEM_PROMPT } from "../utils/prompts.js";

export interface WeeklyPulseInput {
  userName: string;
  weekExpenses: number;
  weekIncome: number;
  avgWeeklyExpenses: number;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    avgAmount: number; // average over the past 4 weeks for this category
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
  lang: string;
}

export async function generateWeeklyPulse(input: WeeklyPulseInput): Promise<string> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    system: WEEKLY_PULSE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("WeeklyPulse agent returned empty response");
  return text;
}
