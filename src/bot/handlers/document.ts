import type { AuthContext } from "../middleware/auth.js";
import { parseFileToRows, extractTransactionsFromFile } from "../../services/fileImport.js";
import { createTransaction } from "../../services/transaction.js";
import { clearReportCache } from "../commands/report.js";
import { formatCurrency } from "../../utils/formatting.js";
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

  await ctx.reply("📂 Processing your file...");

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

    await ctx.reply(`Found *${rows.length}* rows. Parsing transactions...`, { parse_mode: "Markdown" });

    // Extract transactions from file (one API call)
    const transactions = await extractTransactionsFromFile(rows, headers, ctx.dbUser.currency);

    if (transactions.length === 0) {
      await ctx.reply("No financial transactions found in this file.");
      return;
    }

    // Save all transactions to DB
    let saved = 0;
    let skipped = 0;
    let totalIncome = 0;
    let totalExpense = 0;

    for (const t of transactions) {
      try {
        const date = t.date && t.date !== "unknown" ? new Date(t.date) : new Date();
        // Skip if date is invalid
        if (isNaN(date.getTime())) continue;

        await createTransaction({
          userId: ctx.dbUser.id,
          type: t.type,
          amount: t.amount,
          category: t.category,
          description: t.description,
          authorName: ctx.dbUser.firstName,
          date,
          rawMessage: `[file import] ${fileName}`,
        });

        if (t.type === "income") totalIncome += t.amount;
        else totalExpense += t.amount;
        saved++;
      } catch {
        skipped++;
      }
    }

    // Clear cached report since data changed
    clearReportCache(ctx.dbUser.id);

    let reply = `✅ *File imported successfully!*\n\n`;
    reply += `📊 *${saved}* transactions saved`;
    if (skipped > 0) reply += ` (${skipped} skipped)`;
    reply += `\n`;
    reply += `💰 Total income: *${formatCurrency(totalIncome)}*\n`;
    reply += `💸 Total expenses: *${formatCurrency(totalExpense)}*\n\n`;
    reply += `Use /report to see your updated financial overview.`;

    await ctx.reply(reply, { parse_mode: "Markdown" });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("File import failed:", errMsg, error);
    await ctx.reply(`Sorry, I couldn't process this file. Error: ${errMsg}`);
  }
}
