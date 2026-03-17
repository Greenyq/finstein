import type { AuthContext } from "../middleware/auth.js";
import { getRecentTransactions } from "../../services/transaction.js";
import { formatCurrency, formatDate } from "../../utils/formatting.js";
import type { Lang } from "../../locales/index.js";
import { t } from "../../locales/index.js";

export async function historyCommand(ctx: AuthContext): Promise<void> {
  const lang = (ctx.dbUser.language || "ru") as Lang;
  const transactions = await getRecentTransactions(ctx.dbUser.id, 10);

  if (transactions.length === 0) {
    await ctx.reply(t("history.empty", lang)(), { parse_mode: "Markdown" });
    return;
  }

  let message = t("history.title", lang)() + "\n\n";

  for (const tx of transactions) {
    const emoji = tx.type === "income" ? "💰" : "💸";
    const sign = tx.type === "income" ? "+" : "-";
    message += `${emoji} ${sign}${formatCurrency(tx.amount)} — ${tx.category}`;
    if (tx.description) message += ` _(${tx.description})_`;
    message += `\n   ${formatDate(tx.date)}\n`;
  }

  await ctx.reply(message, { parse_mode: "Markdown" });
}
