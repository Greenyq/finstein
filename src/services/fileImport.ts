import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";
import { getAllCategories } from "../utils/categories.js";

interface ParsedRow {
  [key: string]: string | number | undefined;
}

export interface SheetData {
  sheetName: string;
  rows: ParsedRow[];
  headers: string[];
}

export interface FileTransaction {
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string; // YYYY-MM-DD
  sheetName?: string; // which sheet it came from
}

export function parseFileToSheets(buffer: Buffer, fileName: string): SheetData[] {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true, codepage: 65001 });

  if (workbook.SheetNames.length === 0) {
    throw new Error("File has no sheets");
  }

  const sheets: SheetData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet);
    if (rows.length === 0) continue;

    const headers = Object.keys(rows[0]!);
    sheets.push({ sheetName, rows, headers });
  }

  return sheets;
}

// Keep backward compat for tests
export function parseFileToRows(buffer: Buffer, fileName: string): { rows: ParsedRow[]; headers: string[] } {
  const sheets = parseFileToSheets(buffer, fileName);
  if (sheets.length === 0) return { rows: [], headers: [] };
  return { rows: sheets[0]!.rows, headers: sheets[0]!.headers };
}

export async function extractTransactionsFromSheets(
  sheets: SheetData[],
  currency: string,
  year: number = new Date().getFullYear()
): Promise<FileTransaction[]> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const categories = getAllCategories();

  const allTransactions: FileTransaction[] = [];

  // Process each sheet separately — each sheet is typically a month
  for (const sheet of sheets) {
    const sampleSize = Math.min(sheet.rows.length, 200);
    const sample = sheet.rows.slice(0, sampleSize);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: `You are a financial data parser. Extract transactions from the uploaded file data.

The data comes from a sheet named "${sheet.sheetName}". The sheet name usually indicates the MONTH (e.g. "Январь" = January, "Февраль" = February, "Март" = March, "March", "Mar", etc.). Use this to determine the month for dates. Year: ${year}.

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
- Map each row to EXACTLY ONE transaction — do NOT combine or split rows
- Use the EXACT amount from the data — do NOT calculate, sum, or modify amounts
- Skip rows that are headers, totals, subtotals, summaries, or non-financial
- Use the closest matching category from the list
- For dates: use the sheet name to determine the month, and row data for the day if available. If no day, use the 1st of the month.
- If type is unclear, assume "expense" for negative/debit amounts and "income" for positive/credit amounts
- Amount must always be positive
- Currency: ${currency}
- Support both English and Russian data
- CRITICAL: Each transaction amount must match a single value from the original data`,
      messages: [
        {
          role: "user",
          content: `Sheet: "${sheet.sheetName}"\nHeaders: ${sheet.headers.join(", ")}\n\nData (${sample.length} rows):\n${JSON.stringify(sample, null, 1)}`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch?.[0]) continue;

    const transactions = JSON.parse(jsonMatch[0]) as FileTransaction[];
    for (const t of transactions) {
      t.sheetName = sheet.sheetName;
      allTransactions.push(t);
    }
  }

  return allTransactions;
}
