import type { AuthContext } from "../middleware/auth.js";
import { parseFileToSheets, extractTransactionsFromSheets, getSheetPreview, type FileTransaction, type SheetData } from "../../services/fileImport.js";
import { createTransaction } from "../../services/transaction.js";
import { clearReportCache } from "../commands/report.js";
import { formatCurrency } from "../../utils/formatting.js";
import { requirePremium, sendPremiumPrompt } from "../../utils/premium.js";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";

const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Skip sheets that are clearly not monthly data
const SKIP_SHEETS = /dashboard|summary|total|итого|сводка|overview/i;

interface PendingImport {
  transactions: FileTransaction[];
  fileName: string;
  expiresAt: number;
}

interface PendingSheets {
  sheets: SheetData[];
  selectedNames: Set<string>; // which sheets are toggled on
  fileName: string;
  currency: string;
  userId: string;
  chatId: number;
  authorName: string;
  expiresAt: number;
}

// Temporary storage
const pendingImports = new Map<string, PendingImport>();
const pendingSheets = new Map<string, PendingSheets>();

// We need bot reference for background messaging
let botInstance: Bot | null = null;

export function setDocumentBotInstance(bot: Bot): void {
  botInstance = bot;
}

function buildSheetKeyboard(pending: PendingSheets): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  let col = 0;
  for (const s of pending.sheets) {
    const selected = pending.selectedNames.has(s.sheetName);
    const label = selected ? `✅ ${s.sheetName}` : s.sheetName;
    keyboard.text(label, `sheet_toggle_${s.sheetName}`);
    col++;
    if (col >= 3) {
      keyboard.row();
      col = 0;
    }
  }
  keyboard.row();
  keyboard.text("📥 All sheets", "sheet_toggle_ALL");
  keyboard.row();
  if (pending.selectedNames.size > 0) {
    keyboard.text(`▶️ Import (${pending.selectedNames.size})`, "sheet_import_go");
  }
  keyboard.text("❌ Cancel", "file_import_cancel");
  return keyboard;
}

function buildSheetMessage(pending: PendingSheets): string {
  let msg = `📂 *${pending.fileName}*\nFound *${pending.sheets.length}* data sheets:\n\n`;
  for (const s of pending.sheets) {
    const check = pending.selectedNames.has(s.sheetName) ? "✅" : "⬜";
    msg += `${check} *${s.sheetName}* — ${s.rowCount} rows\n`;
  }
  if (pending.selectedNames.size > 0) {
    msg += `\n*${pending.selectedNames.size}* sheet(s) selected. Tap *Import* to start.`;
  } else {
    msg += `\nTap sheets to select, then *Import*.`;
  }
  return msg;
}

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

  try {
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const sheets = parseFileToSheets(buffer, fileName);

    if (sheets.length === 0) {
      await ctx.reply("The file appears to be empty or has no data rows.");
      return;
    }

    // Filter out dashboard/summary sheets
    const dataSheets = sheets.filter((s) => !SKIP_SHEETS.test(s.sheetName));

    if (dataSheets.length === 0) {
      await ctx.reply("No data sheets found (only dashboards/summaries).");
      return;
    }

    // If only 1 sheet (or CSV), process it directly
    if (dataSheets.length === 1) {
      pendingSheets.set(ctx.dbUser.id, {
        sheets: dataSheets,
        selectedNames: new Set([dataSheets[0]!.sheetName]),
        fileName,
        currency: ctx.dbUser.currency,
        userId: ctx.dbUser.id,
        chatId: ctx.chat!.id,
        authorName: ctx.dbUser.firstName,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      await ctx.reply(`📂 Found *${dataSheets[0]!.rowCount}* rows in "${dataSheets[0]!.sheetName}". Parsing...`, { parse_mode: "Markdown" });

      processInBackground(ctx.dbUser.id).catch((err) => {
        console.error("Background processing failed:", err);
      });
      return;
    }

    // Multiple sheets — let user toggle which to import
    const pending: PendingSheets = {
      sheets: dataSheets,
      selectedNames: new Set<string>(),
      fileName,
      currency: ctx.dbUser.currency,
      userId: ctx.dbUser.id,
      chatId: ctx.chat!.id,
      authorName: ctx.dbUser.firstName,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    pendingSheets.set(ctx.dbUser.id, pending);

    const msg = buildSheetMessage(pending);
    const keyboard = buildSheetKeyboard(pending);

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("File upload failed:", errMsg);
    await ctx.reply(`Error reading file: ${errMsg}`);
  }
}

export async function handleSheetToggle(ctx: AuthContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const pending = pendingSheets.get(ctx.dbUser.id);
  if (!pending || pending.expiresAt < Date.now()) {
    pendingSheets.delete(ctx.dbUser.id);
    await ctx.answerCallbackQuery("Session expired. Please re-upload the file.");
    return;
  }

  const name = data.replace("sheet_toggle_", "");

  if (name === "ALL") {
    // Toggle all: if all selected, deselect all; otherwise select all
    if (pending.selectedNames.size === pending.sheets.length) {
      pending.selectedNames.clear();
    } else {
      for (const s of pending.sheets) {
        pending.selectedNames.add(s.sheetName);
      }
    }
  } else {
    // Toggle individual sheet
    if (pending.selectedNames.has(name)) {
      pending.selectedNames.delete(name);
    } else {
      pending.selectedNames.add(name);
    }
  }

  await ctx.answerCallbackQuery();

  const msg = buildSheetMessage(pending);
  const keyboard = buildSheetKeyboard(pending);

  await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: keyboard });
}

export async function handleSheetImportGo(ctx: AuthContext): Promise<void> {
  const pending = pendingSheets.get(ctx.dbUser.id);
  if (!pending || pending.expiresAt < Date.now()) {
    pendingSheets.delete(ctx.dbUser.id);
    await ctx.answerCallbackQuery("Session expired. Please re-upload the file.");
    return;
  }

  if (pending.selectedNames.size === 0) {
    await ctx.answerCallbackQuery("Select at least one sheet first.");
    return;
  }

  await ctx.answerCallbackQuery();

  // Filter to selected sheets only
  pending.sheets = pending.sheets.filter((s) => pending.selectedNames.has(s.sheetName));

  const names = pending.sheets.map((s) => s.sheetName).join(", ");
  const totalRows = pending.sheets.reduce((s, sh) => s + sh.rowCount, 0);
  await ctx.editMessageText(
    `📂 Parsing *${names}* (${totalRows} rows)...\nThis may take a moment.`,
    { parse_mode: "Markdown" }
  );

  processInBackground(ctx.dbUser.id).catch((err) => {
    console.error("Background processing failed:", err);
  });
}

async function processInBackground(userId: string): Promise<void> {
  const pending = pendingSheets.get(userId);
  if (!pending || !botInstance) return;

  const { sheets, fileName, currency, chatId } = pending;
  pendingSheets.delete(userId);

  try {
    const transactions = await extractTransactionsFromSheets(sheets, currency);

    if (transactions.length === 0) {
      let debug = "No financial transactions found.\n\n";
      debug += "🔍 *Here's what I see in the file:*\n\n";
      for (const s of sheets) {
        const preview = getSheetPreview(s, 3);
        debug += `📄 *${s.sheetName}* (${s.rowCount} rows):\n\`\`\`\n${preview}\n\`\`\`\n`;
      }
      debug += "\nPlease check if this looks right. The file format may not be recognized.";
      await botInstance.api.sendMessage(chatId, debug, { parse_mode: "Markdown" });
      return;
    }

    // Build preview grouped by sheet
    let preview = `📋 *Parsed ${transactions.length} transactions:*\n`;

    const bySheet = new Map<string, FileTransaction[]>();
    for (const t of transactions) {
      const key = t.sheetName ?? "Unknown";
      const list = bySheet.get(key) ?? [];
      list.push(t);
      bySheet.set(key, list);
    }

    for (const [sheet, txns] of bySheet) {
      const income = txns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expense = txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

      preview += `\n📅 *${sheet}* (${txns.length} txns)\n`;
      if (income > 0) preview += `  💰 Income: ${formatCurrency(income)}\n`;
      if (expense > 0) {
        preview += `  💸 Expenses: ${formatCurrency(expense)}\n`;

        const byCategory = new Map<string, number>();
        for (const t of txns.filter((t) => t.type === "expense")) {
          byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
        }
        const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
        for (const [cat, amount] of sorted.slice(0, 5)) {
          preview += `    • ${cat}: ${formatCurrency(amount)}\n`;
        }
      }
    }

    preview += `\n⚠️ *Check the amounts above.* Save to database?`;

    pendingImports.set(userId, {
      transactions,
      fileName,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const keyboard = new InlineKeyboard()
      .text("✅ Save", "file_import_confirm")
      .text("❌ Cancel", "file_import_cancel");

    await botInstance.api.sendMessage(chatId, preview, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("File import processing failed:", errMsg);
    await botInstance.api.sendMessage(chatId, `❌ Import failed: ${errMsg}`);
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
  pendingSheets.delete(ctx.dbUser.id);
  await ctx.answerCallbackQuery("Import cancelled.");
  await ctx.editMessageText("❌ File import cancelled. No data was saved.");
}
