import { createMessage, CLAUDE_MODEL } from "../utils/anthropic.js";
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
  const response = await createMessage({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    system: MEMORY_COMPARISON_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("MemoryComparison agent returned empty response");
  return text;
}
