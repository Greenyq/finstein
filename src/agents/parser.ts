import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { getParserSystemPrompt } from "../utils/prompts.js";

export interface ParsedTransaction {
  type: "income" | "expense";
  amount: number;
  category: string;
  subcategory: string | null;
  description: string;
  date: string;
  confidence: number;
}

export interface ParsedQuery {
  type: "query";
  category: string | null;
  period: "current_month" | "last_month" | "all";
  queryType: "spending" | "income" | "balance" | "summary";
  rawMessage: string;
}

export interface UnknownMessage {
  type: "unknown";
  rawMessage: string;
}

export type ParserResult = ParsedTransaction | ParsedQuery | UnknownMessage;

export async function parseMessage(message: string): Promise<ParserResult> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const today = new Date().toISOString().split("T")[0]!;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: getParserSystemPrompt(today),
    messages: [{ role: "user", content: message }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch?.[0]) {
    return { type: "unknown", rawMessage: message };
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  if (parsed.type === "unknown") {
    return { type: "unknown", rawMessage: message };
  }

  if (parsed.type === "query") {
    return {
      type: "query",
      category: parsed.category ? String(parsed.category) : null,
      period: (parsed.period as ParsedQuery["period"]) ?? "current_month",
      queryType: (parsed.queryType as ParsedQuery["queryType"]) ?? "summary",
      rawMessage: String(parsed.rawMessage ?? message),
    };
  }

  return {
    type: parsed.type as "income" | "expense",
    amount: Number(parsed.amount),
    category: String(parsed.category),
    subcategory: parsed.subcategory ? String(parsed.subcategory) : null,
    description: String(parsed.description ?? ""),
    date: String(parsed.date ?? today),
    confidence: Number(parsed.confidence ?? 0.5),
  };
}
