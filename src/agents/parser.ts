import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { getParserSystemPrompt } from "../utils/prompts.js";
import { getTodayStringInTimezone } from "../utils/formatting.js";

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
  period: "today" | "yesterday" | "current_month" | "last_month" | "all";
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

export interface ParsedCompoundAction {
  type: "compound";
  actions: SingleParserResult[];
}

export interface UnknownMessage {
  type: "unknown";
  rawMessage: string;
}

export type SingleParserResult =
  | ParsedTransaction
  | ParsedQuery
  | ParsedWalletUpdate
  | ParsedEditTransaction
  | ParsedDeleteTransaction
  | UnknownMessage;

export type ParserResult =
  | SingleParserResult
  | ParsedCompoundAction;

export async function parseMessage(message: string, existingAccounts?: string[], timezone = "America/Winnipeg", messageDate = new Date()): Promise<ParserResult> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const today = getTodayStringInTimezone(timezone, messageDate);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system: getParserSystemPrompt(today, existingAccounts),
    messages: [{ role: "user", content: message }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  // Try to match an array first (compound actions), then a single object
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  const jsonMatch = arrayMatch ?? text.match(/\{[\s\S]*\}/);
  if (!jsonMatch?.[0]) {
    return { type: "unknown", rawMessage: message };
  }

  const rawParsed = JSON.parse(jsonMatch[0]) as unknown;

  // If the AI returned an array, parse each element
  if (Array.isArray(rawParsed) && rawParsed.length > 1) {
    const actions = rawParsed
      .map((item) => parseSingleResult(item as Record<string, unknown>, message, today))
      .filter((a) => a.type !== "unknown");
    if (actions.length > 1) {
      return { type: "compound", actions };
    }
    if (actions.length === 1) {
      return actions[0]!;
    }
    return { type: "unknown", rawMessage: message };
  }

  // Single object (or array with 1 element)
  const parsed = (Array.isArray(rawParsed) ? rawParsed[0] : rawParsed) as Record<string, unknown>;
  return parseSingleResult(parsed, message, today);
}

function parseSingleResult(
  parsed: Record<string, unknown>,
  message: string,
  today: string,
): SingleParserResult {
  if (parsed.type === "unknown" || !parsed.type) {
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
