import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { MEMORY_COMPARISON_SYSTEM_PROMPT } from "../utils/prompts.js";

export interface MemoryComparisonInput {
  userName: string;
  currentMonthLabel: string; // e.g. "март 2026"
  pastMonthLabel: string;    // e.g. "март 2025"
  currentSavings: number;
  pastSavings: number;
  currentExpenses: number;
  pastExpenses: number;
  currentIncome: number;
  pastIncome: number;
  notableChanges: Array<{
    category: string;
    current: number;
    past: number;
  }>;
  lang: string;
}

export async function generateMemoryComparison(input: MemoryComparisonInput): Promise<string> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: MEMORY_COMPARISON_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("MemoryComparison agent returned empty response");
  return text;
}
