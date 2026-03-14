import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";

interface ParsedRow {
  [key: string]: string | number | undefined;
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

export async function analyzeFileData(rows: ParsedRow[], headers: string[], currency: string): Promise<string> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Limit rows sent to Claude to avoid token overflow
  const sampleSize = Math.min(rows.length, 500);
  const sample = rows.slice(0, sampleSize);
  const totalRows = rows.length;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are a financial analyst assistant. The user uploaded a file with their financial history. Analyze the data and provide:
1. Total income and expenses found
2. Top spending categories
3. Monthly trends (if dates are present)
4. Key insights and recommendations
5. Any concerning patterns

Format your response in clean Markdown for Telegram (use *bold* and _italic_, not **bold**). Use ${currency} for amounts. Be concise but thorough. Respond in the same language as the data (if Russian data, respond in Russian).`,
    messages: [
      {
        role: "user",
        content: `Here is financial data from an uploaded file (${totalRows} total rows, showing ${sampleSize}).\n\nHeaders: ${headers.join(", ")}\n\nData:\n${JSON.stringify(sample, null, 1)}`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return text || "Could not analyze the file.";
}
