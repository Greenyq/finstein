import type { AuthContext } from "../middleware/auth.js";
import { getRecentTransactions } from "../../services/transaction.js";
import { formatCurrency, formatDate } from "../../utils/formatting.js";

export async function historyCommand(ctx: AuthContext): Promise<void> {
  const transactions = await getRecentTransactions(ctx.dbUser.id, 10);

  if (transactions.length === 0) {
    await ctx.reply("No transactions yet. Start tracking by sending a message like _\"spent 45 on groceries\"_.", {
      parse_mode: "Markdown",
    });
    return;
  }

  let message = "*Last transactions:*\n\n";

  for (const t of transactions) {
    const emoji = t.type === "income" ? "💰" : "💸";
    const sign = t.type === "income" ? "+" : "-";
    message += `${emoji} ${sign}${formatCurrency(t.amount)} — ${t.category}`;
    if (t.description) message += ` _(${t.description})_`;
    message += `\n   ${formatDate(t.date)}\n`;
  }

  await ctx.reply(message, { parse_mode: "Markdown" });
}
