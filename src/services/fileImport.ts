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
  const workbook = XLSX.read(buffer, { type: "buffer", codepage: 65001 });

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

/** Get a preview of first N rows for debugging */
export function getSheetPreview(sheet: SheetData, maxRows = 3): string {
  const lines = [`Headers: ${sheet.headers.join(" | ")}`];
  for (const row of sheet.rows.slice(0, maxRows)) {
    const vals = sheet.headers.map((h) => {
      const v = row[h];
      return v !== undefined && v !== null ? String(v) : "";
    });
    lines.push(vals.join(" | "));
  }
  return lines.join("\n");
}

/** Convert rows to compact CSV-like string instead of JSON to save tokens */
function rowsToCompactString(rows: ParsedRow[], headers: string[]): string {
  const lines = [headers.join("|")];
  for (const row of rows) {
    const vals = headers.map((h) => {
      const v = row[h];
      return v !== undefined && v !== null ? String(v) : "";
    });
    lines.push(vals.join("|"));
  }
  return lines.join("\n");
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
    const sampleSize = Math.min(sheet.rows.length, 100);
    const sample = sheet.rows.slice(0, sampleSize);

    // Convert to compact pipe-delimited format to save tokens
    const compactData = rowsToCompactString(sample, sheet.headers);

    let response;
    try {
      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: `You are a financial data parser. Extract transactions from pipe-delimited data.

Sheet: "${sheet.sheetName}" (this is the MONTH name, e.g. "Январь"=Jan, "Февраль"=Feb, "Март"=Mar). Year: ${year}.

Return ONLY a JSON array, no explanation:
[{"type":"income"|"expense","amount":number,"category":"...","description":"...","date":"YYYY-MM-DD"}]

Categories: ${JSON.stringify(categories)}

Rules: one row = one transaction. EXACT amounts from data. Skip totals/headers. Use sheet name for month. ${currency} currency.`,
        messages: [
          {
            role: "user",
            content: compactData,
          },
        ],
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Rate limit — wait and retry once
      if (errMsg.includes("rate_limit") || errMsg.includes("429")) {
        console.log(`Rate limited on sheet "${sheet.sheetName}", waiting 60s...`);
        await new Promise((r) => setTimeout(r, 60_000));
        try {
          response = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2048,
            system: `You are a financial data parser. Extract transactions from pipe-delimited data.

Sheet: "${sheet.sheetName}" (this is the MONTH name). Year: ${year}.

Return ONLY a JSON array:
[{"type":"income"|"expense","amount":number,"category":"...","description":"...","date":"YYYY-MM-DD"}]

Categories: ${JSON.stringify(categories)}

Rules: one row = one transaction. EXACT amounts. Skip totals. Use sheet name for month. ${currency}.`,
            messages: [{ role: "user", content: compactData }],
          });
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.error(`Retry failed for sheet "${sheet.sheetName}":`, retryMsg);
          throw new Error(`API error on sheet "${sheet.sheetName}": ${retryMsg}`);
        }
      } else {
        // Any other API error — stop immediately
        throw new Error(`API error on sheet "${sheet.sheetName}": ${errMsg}`);
      }
    }

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    console.log(`AI response for sheet "${sheet.sheetName}":`, text.substring(0, 500));
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch?.[0]) {
      console.warn(`No JSON array found in AI response for sheet "${sheet.sheetName}"`);
      continue;
    }

    const transactions = JSON.parse(jsonMatch[0]) as FileTransaction[];
    for (const t of transactions) {
      t.sheetName = sheet.sheetName;
      allTransactions.push(t);
    }

    // Small delay between sheets to avoid rate limits
    if (sheets.indexOf(sheet) < sheets.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return allTransactions;
}
