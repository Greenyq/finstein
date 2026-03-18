import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import {
  getTransactionById,
  softDeleteTransaction,
  restoreTransaction,
  updateTransaction,
} from "../../services/transaction.js";
import { formatCurrency } from "../../utils/formatting.js";
import { clearReportCache } from "../commands/report.js";
import { prisma } from "../../db/prisma.js";

/** Check if the Telegram user has access to a transaction (owns it or is in the same family) */
async function canAccessTransaction(telegramId: number, txUserId: string): Promise<boolean> {
  const caller = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (!caller) return false;

  // Direct owner
  if (caller.id === txUserId) return true;

  // Same family
  if (caller.familyId) {
    const txOwner = await prisma.user.findUnique({ where: { id: txUserId } });
    if (txOwner?.familyId === caller.familyId) return true;
  }

  return false;
}

/** In-memory store for pending edits: chatId -> { transactionId, step } */
const pendingEdits = new Map<number, { transactionId: string; field: string | null }>();

export function getPendingEdit(chatId: number) {
  return pendingEdits.get(chatId);
}

export function clearPendingEdit(chatId: number) {
  pendingEdits.delete(chatId);
}

/** Handle tx_del_<id> callback — soft-delete with restore button */
export async function handleTxDeleteCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const txId = data.replace("tx_del_", "");
  const tx = await getTransactionById(txId);
  if (!tx) {
    await ctx.answerCallbackQuery({ text: "Transaction not found" });
    return;
  }

  if (!ctx.from || !(await canAccessTransaction(ctx.from.id, tx.userId))) {
    await ctx.answerCallbackQuery({ text: "Access denied / Нет доступа" });
    return;
  }

  await softDeleteTransaction(txId);
  clearReportCache(tx.userId);

  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard().text("↩️ Restore / Восстановить", `tx_restore_${txId}`);

  const sign = tx.type === "income" ? "+" : "-";
  const msg = `🗑 ${sign}${formatCurrency(tx.amount)} — ${tx.category}${tx.description ? ` (${tx.description})` : ""}\n_Deleted / Удалено_`;
  await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: keyboard });
}

/** Handle tx_restore_<id> callback — restore soft-deleted transaction */
export async function handleTxRestoreCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const txId = data.replace("tx_restore_", "");
  const tx = await getTransactionById(txId);
  if (!tx) {
    await ctx.answerCallbackQuery({ text: "Transaction not found" });
    return;
  }

  if (!ctx.from || !(await canAccessTransaction(ctx.from.id, tx.userId))) {
    await ctx.answerCallbackQuery({ text: "Access denied / Нет доступа" });
    return;
  }

  await restoreTransaction(txId);
  clearReportCache(tx.userId);

  await ctx.answerCallbackQuery();

  const sign = tx.type === "income" ? "+" : "-";
  const msg = `✅ ${sign}${formatCurrency(tx.amount)} — ${tx.category}${tx.description ? ` (${tx.description})` : ""}\n_Restored / Восстановлено_`;
  await ctx.editMessageText(msg, { parse_mode: "Markdown" });
}

/** Handle tx_edit_<id> callback — show edit options */
export async function handleTxEditCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const txId = data.replace("tx_edit_", "");
  const tx = await getTransactionById(txId);
  if (!tx) {
    await ctx.answerCallbackQuery({ text: "Transaction not found" });
    return;
  }

  if (!ctx.from || !(await canAccessTransaction(ctx.from.id, tx.userId))) {
    await ctx.answerCallbackQuery({ text: "Access denied / Нет доступа" });
    return;
  }

  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard()
    .text("💵 Amount / Сумма", `tx_editfield_${txId}_amount`)
    .text("📂 Category / Категория", `tx_editfield_${txId}_category`)
    .row()
    .text("📝 Description / Описание", `tx_editfield_${txId}_description`)
    .text("❌ Cancel / Отмена", `tx_editcancel_${txId}`);

  const sign = tx.type === "income" ? "+" : "-";
  const msg = `✏️ *Edit / Редактирование:*\n${sign}${formatCurrency(tx.amount)} — ${tx.category}${tx.description ? ` (${tx.description})` : ""}\n\n_Choose what to change / Выберите что изменить:_`;
  await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: keyboard });
}

/** Handle tx_editfield_<id>_<field> — prompt user for new value */
export async function handleTxEditFieldCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // tx_editfield_<id>_<field>
  const match = data.match(/^tx_editfield_(.+)_(amount|category|description)$/);
  if (!match) return;

  const txId = match[1]!;
  const field = match[2]!;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const tx = await getTransactionById(txId);
  if (!tx) {
    await ctx.answerCallbackQuery({ text: "Transaction not found" });
    return;
  }

  if (!ctx.from || !(await canAccessTransaction(ctx.from.id, tx.userId))) {
    await ctx.answerCallbackQuery({ text: "Access denied / Нет доступа" });
    return;
  }

  pendingEdits.set(chatId, { transactionId: txId, field });

  await ctx.answerCallbackQuery();

  const fieldLabels: Record<string, string> = {
    amount: "💵 new amount / новую сумму",
    category: "📂 new category / новую категорию",
    description: "📝 new description / новое описание",
  };

  const sign = tx.type === "income" ? "+" : "-";
  const msg = `✏️ ${sign}${formatCurrency(tx.amount)} — ${tx.category}\n\n_Send ${fieldLabels[field]}:_`;
  await ctx.editMessageText(msg, { parse_mode: "Markdown" });
}

/** Handle tx_editcancel_<id> — cancel edit */
export async function handleTxEditCancelCallback(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId) clearPendingEdit(chatId);

  await ctx.answerCallbackQuery();
  await ctx.editMessageText("_Cancelled / Отменено_", { parse_mode: "Markdown" });
}

/** Process a pending edit (called from message handler when user sends new value) */
export async function processPendingEdit(
  ctx: AuthContext,
  text: string,
  pending: { transactionId: string; field: string | null },
): Promise<boolean> {
  const chatId = ctx.chat?.id;
  if (!chatId || !pending.field) return false;

  const tx = await getTransactionById(pending.transactionId);
  if (!tx) {
    await ctx.reply("Transaction not found.");
    clearPendingEdit(chatId);
    return true;
  }

  const data: Parameters<typeof updateTransaction>[1] = {};

  if (pending.field === "amount") {
    const num = parseFloat(text.replace(/[,$]/g, ""));
    if (isNaN(num) || num <= 0) {
      await ctx.reply("Invalid amount. Try again / Неверная сумма. Попробуйте ещё:");
      return true;
    }
    data.amount = num;
  } else if (pending.field === "category") {
    data.category = text.trim();
  } else if (pending.field === "description") {
    data.description = text.trim();
  }

  await updateTransaction(pending.transactionId, data);
  clearReportCache(tx.userId);
  clearPendingEdit(chatId);

  const updated = { ...tx, ...data };
  const sign = updated.type === "income" ? "+" : "-";
  const lang = ctx.dbUser.language === "en" ? "en" : "ru";
  const msg = lang === "ru"
    ? `✅ Обновлено: ${sign}${formatCurrency(updated.amount as number)} — ${updated.category}${updated.description ? ` (${updated.description})` : ""}`
    : `✅ Updated: ${sign}${formatCurrency(updated.amount as number)} — ${updated.category}${updated.description ? ` (${updated.description})` : ""}`;

  await ctx.reply(msg, { parse_mode: "Markdown" });
  return true;
}
