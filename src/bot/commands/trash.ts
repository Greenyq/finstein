import { InlineKeyboard } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import { getDeletedTransactions } from "../../services/transaction.js";
import { formatCurrency, formatDate } from "../../utils/formatting.js";
import type { Lang } from "../../locales/index.js";
import { t } from "../../locales/index.js";

export async function trashCommand(ctx: AuthContext): Promise<void> {
  const lang = (ctx.dbUser.language || "ru") as Lang;
  const deleted = await getDeletedTransactions(ctx.dbUser.id, 10);

  if (deleted.length === 0) {
    const msg = lang === "ru" ? "Корзина пуста." : "Trash is empty.";
    await ctx.reply(msg);
    return;
  }

  const title = lang === "ru" ? "*Удалённые транзакции:*" : "*Deleted transactions:*";
  let message = title + "\n\n";

  for (const [i, tx] of deleted.entries()) {
    const emoji = tx.type === "income" ? "💰" : "💸";
    const sign = tx.type === "income" ? "+" : "-";
    message += `${i + 1}. ${emoji} ${sign}${formatCurrency(tx.amount)} — ${tx.category}`;
    if (tx.description) message += ` _(${tx.description})_`;
    message += `\n   ${formatDate(tx.date)}\n`;
  }

  const keyboard = new InlineKeyboard();
  for (const [i, tx] of deleted.entries()) {
    const short = `${i + 1}. ${formatCurrency(tx.amount)}`;
    keyboard.text(`↩️ ${short}`, `tx_restore_${tx.id}`).row();
  }

  message += `\n${lang === "ru" ? "_Нажмите чтобы восстановить:_" : "_Tap to restore:_"}`;

  await ctx.reply(message, { parse_mode: "Markdown", reply_markup: keyboard });
}
