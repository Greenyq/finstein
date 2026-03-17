import { InlineKeyboard } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import { getRecentTransactions } from "../../services/transaction.js";
import { formatCurrency } from "../../utils/formatting.js";
import type { Lang } from "../../locales/index.js";
import { t } from "../../locales/index.js";

export async function historyCommand(ctx: AuthContext): Promise<void> {
  const lang = (ctx.dbUser.language || "ru") as Lang;
  const ru = lang === "ru";
  const transactions = await getRecentTransactions(ctx.dbUser.id, 10);

  if (transactions.length === 0) {
    await ctx.reply(t("history.empty", lang)(), { parse_mode: "Markdown" });
    return;
  }

  let message = t("history.title", lang)() + "\n\n";

  const keyboard = new InlineKeyboard();

  for (const [i, tx] of transactions.entries()) {
    const sign = tx.type === "income" ? "+" : "-";
    const day = tx.date.getDate();
    const month = tx.date.toLocaleString(ru ? "ru-RU" : "en-CA", { month: "short" });

    // Line 1: amount and category
    message += `*${i + 1}.* ${sign}${formatCurrency(tx.amount)} — ${tx.category}`;
    // Line 2: description + date
    const parts: string[] = [];
    if (tx.description) parts.push(tx.description);
    if (tx.authorName) parts.push(tx.authorName);
    parts.push(`${day} ${month}`);
    message += `\n      _${parts.join(" · ")}_\n\n`;

    // One row per transaction: edit + delete
    keyboard
      .text(`✏️ ${i + 1}`, `tx_edit_${tx.id}`)
      .text(`🗑 ${i + 1}`, `tx_del_${tx.id}`)
      .row();
  }

  await ctx.reply(message, { parse_mode: "Markdown", reply_markup: keyboard });
}
