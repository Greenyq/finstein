import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { SAVINGS_PROJECTION_SYSTEM_PROMPT } from "../utils/prompts.js";

export interface SavingsProjectionInput {
  userName: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  currentSavings: number;
  topWantCategory: string;
  topWantAmount: number;
  goalAmount?: number;
  goalName?: string;
  lang: string;
}

export async function generateSavingsProjection(input: SavingsProjectionInput): Promise<string> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: SAVINGS_PROJECTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("SavingsProjection agent returned empty response");
  return text;
}
