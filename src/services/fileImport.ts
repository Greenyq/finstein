import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { createMessage, CLAUDE_MODEL } from "../utils/anthropic.js";
import { getAllCategories } from "../utils/categories.js";

interface ParsedRow {
  [key: string]: string | number | undefined;
}

export interface SheetData {
  sheetName: string;
  rows: ParsedRow[];
  headers: string[];
  /** Raw CSV text of the entire sheet — preserves grid layout for AI */
  rawCsv: string;
  rowCount: number;
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

    // Get raw CSV — preserves full grid layout including merged cells
    const rawCsv = XLSX.utils.sheet_to_csv(sheet);
    if (!rawCsv.trim()) continue;

    // Also get JSON for backward compat (used by parseFileToRows)
    const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet);
    const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];

    // Count non-empty lines for row count
    const lines = rawCsv.split("\n").filter((l) => l.trim());

    sheets.push({ sheetName, rows, headers, rawCsv, rowCount: lines.length });
  }

  return sheets;
}

// Keep backward compat for tests
export function parseFileToRows(buffer: Buffer, fileName: string): { rows: ParsedRow[]; headers: string[] } {
  const sheets = parseFileToSheets(buffer, fileName);
  if (sheets.length === 0) return { rows: [], headers: [] };
  return { rows: sheets[0]!.rows, headers: sheets[0]!.headers };
}

/** Get a preview of the raw CSV for debugging */
export function getSheetPreview(sheet: SheetData, maxLines = 5): string {
  const lines = sheet.rawCsv.split("\n").filter((l) => l.trim());
  const preview = lines.slice(0, maxLines);
  return preview.join("\n");
}

export async function extractTransactionsFromSheets(
  sheets: SheetData[],
  currency: string,
  year: number = new Date().getFullYear()
): Promise<FileTransaction[]> {
  const categories = getAllCategories();

  const allTransactions: FileTransaction[] = [];

  // Process each sheet separately — each sheet is typically a month
  for (const sheet of sheets) {
    // Use raw CSV — preserves full grid layout for complex spreadsheets
    // Limit to ~150 lines to stay within token budget
    const lines = sheet.rawCsv.split("\n");
    const limitedCsv = lines.slice(0, 150).join("\n");

    let response;
    try {
      response = await createMessage({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: `You are a financial data parser. Extract ALL individual transactions from spreadsheet data.

Sheet name: "${sheet.sheetName}" — this may indicate the month (e.g. "JAN"=January, "FEB"=February, "MAR"=March, "Январь"=January, etc.). Year: ${year}.

The data is CSV from a spreadsheet. It may have:
- Header/title rows (skip these)
- Summary/total rows (skip these)
- Complex layouts with merged cells (look for the actual transaction data)
- Multiple sections (income section, expense section, etc.)

Return ONLY a JSON array of individual transactions:
[{"type":"income"|"expense","amount":number,"category":"...","description":"...","date":"YYYY-MM-DD"}]

Available categories: ${JSON.stringify(categories)}

Rules:
- Extract EVERY individual transaction row, not summaries or totals
- Use EXACT amounts from the data
- For dates: if specific dates are in the data, use them. Otherwise use the sheet name as month + day 1
- Classify each as income or expense based on context
- IMPORTANT: "description" must contain the original item name/comment from the data (e.g. "Walmart", "Netflix", "молоко хлеб"). Never leave description empty — use the row text.
- ${currency} currency`,
        messages: [
          {
            role: "user",
            content: limitedCsv,
          },
        ],
      });
    } catch (err: unknown) {
      // Rate limit — wait 60s and retry once with a leaner prompt
      const isRateLimit = err instanceof Anthropic.APIError && err.status === 429;
      if (isRateLimit) {
        console.log(`Rate limited on sheet "${sheet.sheetName}", waiting 60s...`);
        await new Promise((r) => setTimeout(r, 60_000));
        try {
          response = await createMessage({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system: `You are a financial data parser. Extract ALL individual transactions from CSV spreadsheet data.

Sheet: "${sheet.sheetName}" (month name). Year: ${year}.

Return ONLY a JSON array:
[{"type":"income"|"expense","amount":number,"category":"...","description":"...","date":"YYYY-MM-DD"}]

Categories: ${JSON.stringify(categories)}

Rules: extract every individual transaction. EXACT amounts. Skip totals/headers. ${currency} currency.`,
            messages: [{ role: "user", content: limitedCsv }],
          });
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.error(`Retry failed for sheet "${sheet.sheetName}":`, retryMsg);
          throw new Error(`API error on sheet "${sheet.sheetName}": ${retryMsg}`);
        }
      } else {
        // Any other API error — stop immediately
        const errMsg = err instanceof Error ? err.message : String(err);
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
