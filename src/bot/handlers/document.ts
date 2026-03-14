import type { AuthContext } from "../middleware/auth.js";
import { parseFileToRows, extractTransactionsFromFile, type FileTransaction } from "../../services/fileImport.js";
import { createTransaction } from "../../services/transaction.js";
import { clearReportCache } from "../commands/report.js";
import { formatCurrency } from "../../utils/formatting.js";
import { requirePremium, sendPremiumPrompt } from "../../utils/premium.js";
import { InlineKeyboard } from "grammy";

const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Temporary storage for pending file imports (userId -> transactions)
// Entries expire after 10 minutes
const pendingImports = new Map<string, { transactions: FileTransaction[]; fileName: string; expiresAt: number }>();

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

    // Build preview of parsed transactions
    const byCategory = new Map<string, { count: number; total: number; type: string }>();
    let totalIncome = 0;
    let totalExpense = 0;

    for (const t of transactions) {
      const key = t.category;
      const existing = byCategory.get(key) ?? { count: 0, total: 0, type: t.type };
      existing.count++;
      existing.total += t.amount;
      byCategory.set(key, existing);

      if (t.type === "income") totalIncome += t.amount;
      else totalExpense += t.amount;
    }

    let preview = `📋 *Parsed ${transactions.length} transactions from file:*\n\n`;

    if (totalIncome > 0) {
      preview += `💰 *Income:* ${formatCurrency(totalIncome)}\n`;
      for (const [cat, data] of byCategory) {
        if (data.type === "income") {
          preview += `  • ${cat}: ${formatCurrency(data.total)} (${data.count}x)\n`;
        }
      }
      preview += "\n";
    }

    preview += `💸 *Expenses:* ${formatCurrency(totalExpense)}\n`;
    const sortedExpenses = Array.from(byCategory.entries())
      .filter(([, d]) => d.type === "expense")
      .sort((a, b) => b[1].total - a[1].total);

    for (const [cat, data] of sortedExpenses) {
      preview += `  • ${cat}: ${formatCurrency(data.total)} (${data.count}x)\n`;
    }

    preview += `\n⚠️ *Check the amounts above.* Save to database?`;

    // Store pending import (expires in 10 min)
    pendingImports.set(ctx.dbUser.id, {
      transactions,
      fileName,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    // Clean up expired entries
    for (const [key, val] of pendingImports) {
      if (val.expiresAt < Date.now()) pendingImports.delete(key);
    }

    const keyboard = new InlineKeyboard()
      .text("✅ Save", "file_import_confirm")
      .text("❌ Cancel", "file_import_cancel");

    await ctx.reply(preview, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("File import failed:", errMsg, error);
    await ctx.reply(`Sorry, I couldn't process this file. Error: ${errMsg}`);
  }
}

export async function handleFileImportConfirm(ctx: AuthContext): Promise<void> {
  const pending = pendingImports.get(ctx.dbUser.id);

  if (!pending || pending.expiresAt < Date.now()) {
    pendingImports.delete(ctx.dbUser.id);
    await ctx.answerCallbackQuery("Import expired. Please re-upload the file.");
    return;
  }

  await ctx.answerCallbackQuery("Saving...");

  const { transactions, fileName } = pending;
  pendingImports.delete(ctx.dbUser.id);

  let saved = 0;
  let skipped = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  for (const t of transactions) {
    try {
      const date = t.date && t.date !== "unknown" ? new Date(t.date) : new Date();
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

  clearReportCache(ctx.dbUser.id);

  let reply = `✅ *Imported ${saved} transactions!*\n`;
  if (skipped > 0) reply += `(${skipped} skipped)\n`;
  reply += `\n💰 Income: *${formatCurrency(totalIncome)}*`;
  reply += `\n💸 Expenses: *${formatCurrency(totalExpense)}*`;
  reply += `\n\nUse /report for your updated overview.`;

  await ctx.editMessageText(reply, { parse_mode: "Markdown" });
}

export async function handleFileImportCancel(ctx: AuthContext): Promise<void> {
  pendingImports.delete(ctx.dbUser.id);
  await ctx.answerCallbackQuery("Import cancelled.");
  await ctx.editMessageText("❌ File import cancelled. No data was saved.");
}
