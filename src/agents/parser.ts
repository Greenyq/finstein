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
  /** Number of months to include (e.g. 2 = current + last month). Defaults to 1. */
  months?: number;
  queryType: "spending" | "income" | "balance" | "summary";
  rawMessage: string;
}

export interface ParsedWalletUpdate {
  type: "wallet_update";
  accounts: Array<{ name: string; balance: number }>;
}

export interface ParsedEditTransaction {
  type: "edit_transaction";
  /** What to search for — description, category, amount, or "last" */
  target: string;
  changes: { amount?: number; category?: string; description?: string };
}

export interface ParsedDeleteTransaction {
  type: "delete_transaction";
  /** What to search for — description, category, amount, or "last" */
  target: string;
}

export interface UnknownMessage {
  type: "unknown";
  rawMessage: string;
}

export type ParserResult =
  | ParsedTransaction
  | ParsedQuery
  | ParsedWalletUpdate
  | ParsedEditTransaction
  | ParsedDeleteTransaction
  | UnknownMessage;

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

  if (parsed.type === "wallet_update") {
    const accounts = Array.isArray(parsed.accounts)
      ? (parsed.accounts as Array<{ name: string; balance: number }>).map((a) => ({
          name: String(a.name),
          balance: Number(a.balance),
        }))
      : [];
    return { type: "wallet_update", accounts };
  }

  if (parsed.type === "edit_transaction") {
    return {
      type: "edit_transaction",
      target: String(parsed.target ?? "last"),
      changes: {
        amount: parsed.changes && typeof parsed.changes === "object" && "amount" in parsed.changes ? Number((parsed.changes as Record<string, unknown>).amount) : undefined,
        category: parsed.changes && typeof parsed.changes === "object" && "category" in parsed.changes ? String((parsed.changes as Record<string, unknown>).category) : undefined,
        description: parsed.changes && typeof parsed.changes === "object" && "description" in parsed.changes ? String((parsed.changes as Record<string, unknown>).description) : undefined,
      },
    };
  }

  if (parsed.type === "delete_transaction") {
    return {
      type: "delete_transaction",
      target: String(parsed.target ?? "last"),
    };
  }

  if (parsed.type === "query") {
    return {
      type: "query",
      category: parsed.category ? String(parsed.category) : null,
      period: (parsed.period as ParsedQuery["period"]) ?? "current_month",
      months: parsed.months ? Number(parsed.months) : undefined,
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
