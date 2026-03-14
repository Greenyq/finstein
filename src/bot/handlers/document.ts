import type { AuthContext } from "../middleware/auth.js";
import { parseFileToRows, analyzeFileData } from "../../services/fileImport.js";
import { requirePremium, sendPremiumPrompt } from "../../utils/premium.js";

const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function handleDocumentMessage(ctx: AuthContext): Promise<void> {
  if (!requirePremium(ctx, "report")) {
    await sendPremiumPrompt(ctx, "report");
    return;
  }

  const doc = ctx.message?.document;
  if (!doc) return;

  const fileName = doc.file_name ?? "unknown";
  const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    await ctx.reply(
      `Unsupported file format. Please send a *CSV* or *Excel* file (.csv, .xlsx, .xls).`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (doc.file_size && doc.file_size > MAX_FILE_SIZE) {
    await ctx.reply("File is too large. Maximum size is 5MB.");
    return;
  }

  await ctx.reply("Analyzing your financial file... This may take a moment.");

  try {
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const { rows, headers } = parseFileToRows(buffer, fileName);

    if (rows.length === 0) {
      await ctx.reply("The file appears to be empty or has no data rows.");
      return;
    }

    await ctx.reply(`Found *${rows.length}* rows. Analyzing...`, { parse_mode: "Markdown" });

    const analysis = await analyzeFileData(rows, headers, ctx.dbUser.currency);

    // Split long messages (Telegram limit is 4096 chars)
    if (analysis.length > 4000) {
      const parts = splitMessage(analysis, 4000);
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: "Markdown" });
      }
    } else {
      await ctx.reply(analysis, { parse_mode: "Markdown" });
    }
  } catch (error) {
    console.error("File import failed:", error);
    await ctx.reply("Sorry, I couldn't process this file. Make sure it's a valid CSV or Excel file with financial data.");
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }
    // Find a good split point (newline)
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = maxLength;
    }
    parts.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }
  return parts;
}
