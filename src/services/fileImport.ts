import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { getAllCategories } from "../utils/categories.js";

interface ParsedRow {
  [key: string]: string | number | undefined;
}

export interface FileTransaction {
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string; // YYYY-MM-DD
}

export function parseFileToRows(buffer: Buffer, fileName: string): { rows: ParsedRow[]; headers: string[] } {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true, codepage: 65001 });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("File has no sheets");
  }
  const sheet = workbook.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet);
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];

  return { rows, headers };
}

export async function extractTransactionsFromFile(
  rows: ParsedRow[],
  headers: string[],
  currency: string
): Promise<FileTransaction[]> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Limit rows to avoid token overflow
  const sampleSize = Math.min(rows.length, 500);
  const sample = rows.slice(0, sampleSize);
  const categories = getAllCategories();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: `You are a financial data parser. Extract transactions from the uploaded file data.

Return ONLY a JSON array of transactions, no explanation:
[
  {
    "type": "income" | "expense",
    "amount": number (positive),
    "category": string (must match one of: ${JSON.stringify(categories)}),
    "description": string (brief),
    "date": "YYYY-MM-DD"
  }
]

Rules:
- Map each row to a transaction if it contains financial data
- Skip rows that are headers, totals, or non-financial
- Use the closest matching category from the list
- If date is missing, use "unknown"
- If type is unclear, assume "expense" for negative/debit amounts and "income" for positive/credit amounts
- Amount must always be positive
- Currency: ${currency}
- Support both English and Russian data`,
    messages: [
      {
        role: "user",
        content: `Headers: ${headers.join(", ")}\n\nData (${sample.length} rows):\n${JSON.stringify(sample, null, 1)}`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch?.[0]) {
    throw new Error("Could not parse transactions from file");
  }

  return JSON.parse(jsonMatch[0]) as FileTransaction[];
}
