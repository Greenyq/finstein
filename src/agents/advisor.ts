import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { ADVISOR_SYSTEM_PROMPT } from "../utils/prompts.js";
import type { AnalysisResult } from "./analyzer.js";

export async function generateAdvice(analysis: AnalysisResult): Promise<string> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 1024,
    system: ADVISOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate a monthly financial advice message based on this analysis:\n\n${JSON.stringify(analysis, null, 2)}`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  if (!text) {
    throw new Error("Advisor returned empty response");
  }

  return text;
}
