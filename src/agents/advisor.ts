import { createMessage } from "../utils/anthropic.js";
import { ADVISOR_SYSTEM_PROMPT } from "../utils/prompts.js";
import type { AnalysisResult } from "./analyzer.js";

export async function generateAdvice(analysis: AnalysisResult, lang: string = "en"): Promise<string> {
  const langInstruction = lang === "ru"
    ? "IMPORTANT: Respond entirely in Russian."
    : "IMPORTANT: Respond entirely in English.";

  const response = await createMessage({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: ADVISOR_SYSTEM_PROMPT + "\n\n" + langInstruction,
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
