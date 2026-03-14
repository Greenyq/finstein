import type { AuthContext } from "../middleware/auth.js";
import { parseMessage } from "../../agents/parser.js";
import type { ParsedQuery } from "../../agents/parser.js";
import { createTransaction, getMonthlyTransactions, getLastMonthTransactions } from "../../services/transaction.js";
import { formatCurrency } from "../../utils/formatting.js";
import { handleSetupMessage } from "../commands/setup.js";
import { clearReportCache } from "../commands/report.js";
import { isLikelyFinancial } from "../../utils/topicGuard.js";

export async function handleTextMessage(ctx: AuthContext, textOverride?: string): Promise<void> {
  const text = (textOverride ?? ctx.message?.text)?.trim();
  if (!text) return;

  // Skip commands
  if (text.startsWith("/")) return;

  // Check if we're in a setup session
  const handled = await handleSetupMessage(ctx);
  if (handled) return;

  // Pre-filter: skip obviously non-financial messages to save API tokens
  if (!isLikelyFinancial(text)) {
    await ctx.reply(
      "I'm your finance assistant — send me expenses or income.\n" +
        '_Example: "spent 45 on groceries"_\n\n' +
        "Use /help to see all commands.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  try {
    const result = await parseMessage(text);

    if (result.type === "unknown") {
      await ctx.reply(
        "I didn't catch that — try something like:\n" +
          '_"spent 45 on groceries"_\n' +
          '_"got paycheck 2180"_\n' +
          '_"restaurant 35"_',
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (result.type === "query") {
      await handleQuery(ctx, result);
      return;
    }

    const transaction = await createTransaction({
      userId: ctx.dbUser.id,
      type: result.type,
      amount: result.amount,
      category: result.category,
      subcategory: result.subcategory ?? undefined,
      description: result.description,
      authorName: ctx.dbUser.firstName,
      date: new Date(result.date),
      rawMessage: text,
    });

    // Clear cached report since data changed
    clearReportCache(ctx.dbUser.id);

    const emoji = result.type === "income" ? "💰" : "✅";

    let reply = `${emoji} Recorded: *${formatCurrency(result.amount)}* — ${result.category}`;
    if (result.description) {
      reply += `\n_${result.description}_`;
    }

    if (result.confidence < 0.7) {
      reply += `\n\n⚠️ I wasn't fully sure about this. Use /undo if it's wrong.`;
    }

    await ctx.reply(reply, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Message handling failed:", {
      userId: ctx.dbUser.id,
      message: text,
      error,
    });
    await ctx.reply(
      "Sorry, something went wrong processing your message. Please try again."
    );
  }
}

async function handleQuery(ctx: AuthContext, query: ParsedQuery): Promise<void> {
  const userId = ctx.dbUser.id;

  // Get transactions based on period
  let transactions;
  let periodLabel: string;

  if (query.period === "last_month") {
    transactions = await getLastMonthTransactions(userId);
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    periodLabel = lastMonth.toLocaleString("ru-RU", { month: "long" });
  } else {
    transactions = await getMonthlyTransactions(userId);
    periodLabel = new Date().toLocaleString("ru-RU", { month: "long" });
  }

  if (transactions.length === 0) {
    await ctx.reply(`No transactions found for ${periodLabel}. Start by recording some expenses!`);
    return;
  }

  // Filter by category if specified
  let filtered = transactions;
  if (query.category) {
    const catLower = query.category.toLowerCase();
    filtered = transactions.filter(
      (t) => t.category.toLowerCase() === catLower
    );
  }

  // Calculate totals
  const totalExpenses = filtered
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = filtered
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  let reply = "";

  if (query.queryType === "income") {
    reply = `💰 *Income for ${periodLabel}*: ${formatCurrency(totalIncome)}`;
    if (query.category) reply += ` (${query.category})`;
    reply += `\n_${filtered.filter((t) => t.type === "income").length} transactions_`;
  } else if (query.queryType === "balance") {
    const balance = totalIncome - totalExpenses;
    reply = `📊 *Balance for ${periodLabel}*\n`;
    reply += `💰 Income: ${formatCurrency(totalIncome)}\n`;
    reply += `💸 Expenses: ${formatCurrency(totalExpenses)}\n`;
    reply += `${balance >= 0 ? "✅" : "⚠️"} Net: *${formatCurrency(balance)}*`;
  } else {
    // spending or summary
    reply = `💸 *Expenses for ${periodLabel}*`;
    if (query.category) reply += ` — ${query.category}`;
    reply += `: *${formatCurrency(totalExpenses)}*\n`;

    // Show category breakdown if no specific category filter
    if (!query.category) {
      const byCategory = new Map<string, number>();
      for (const t of filtered.filter((t) => t.type === "expense")) {
        byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
      }
      const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        reply += "\n";
        for (const [cat, amount] of sorted.slice(0, 8)) {
          reply += `• ${cat}: ${formatCurrency(amount)}\n`;
        }
      }
    } else {
      // Show individual transactions for specific category
      const items = filtered.filter((t) => t.type === "expense").slice(0, 10);
      if (items.length > 0) {
        reply += "\n";
        for (const t of items) {
          const desc = t.description ? ` — _${t.description}_` : "";
          reply += `• ${formatCurrency(t.amount)}${desc}\n`;
        }
      }
    }

    reply += `\n_${filtered.filter((t) => t.type === "expense").length} transactions_`;
  }

  await ctx.reply(reply, { parse_mode: "Markdown" });
}
