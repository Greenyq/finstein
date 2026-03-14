import type { AuthContext } from "../middleware/auth.js";
import { parseMessage } from "../../agents/parser.js";
import type { ParsedQuery } from "../../agents/parser.js";
import { createTransaction, getMonthlyTransactions, getLastMonthTransactions, getLastNMonthsTransactions } from "../../services/transaction.js";
import { formatCurrency } from "../../utils/formatting.js";
import { handleSetupMessage } from "../commands/setup.js";
import { clearReportCache } from "../commands/report.js";
import { isLikelyFinancial } from "../../utils/topicGuard.js";

/** Detect if text is primarily Russian (has Cyrillic chars) */
function isRussian(text: string): boolean {
  const cyrillic = text.match(/[\u0400-\u04FF]/g);
  return !!cyrillic && cyrillic.length > text.replace(/\s/g, "").length * 0.3;
}

export async function handleTextMessage(ctx: AuthContext, textOverride?: string): Promise<void> {
  const text = (textOverride ?? ctx.message?.text)?.trim();
  if (!text) return;

  // Skip commands
  if (text.startsWith("/")) return;

  // Check if we're in a setup session
  const handled = await handleSetupMessage(ctx);
  if (handled) return;

  const ru = isRussian(text);

  // Pre-filter: skip obviously non-financial messages to save API tokens
  if (!isLikelyFinancial(text)) {
    if (ru) {
      await ctx.reply(
        "Я ваш финансовый помощник — отправьте мне расходы или доходы.\n" +
          '_Например: "потратил 45 на продукты"_\n\n' +
          "Используйте /help для списка команд.",
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(
        "I'm your finance assistant — send me expenses or income.\n" +
          '_Example: "spent 45 on groceries"_\n\n' +
          "Use /help to see all commands.",
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  try {
    const result = await parseMessage(text);

    if (result.type === "unknown") {
      if (ru) {
        await ctx.reply(
          "Не понял — попробуйте что-то вроде:\n" +
            '_"потратил 45 на продукты"_\n' +
            '_"зарплата 2180"_\n' +
            '_"ресторан 35"_',
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.reply(
          "I didn't catch that — try something like:\n" +
            '_"spent 45 on groceries"_\n' +
            '_"got paycheck 2180"_\n' +
            '_"restaurant 35"_',
          { parse_mode: "Markdown" }
        );
      }
      return;
    }

    if (result.type === "query") {
      await handleQuery(ctx, result, ru);
      return;
    }

    await createTransaction({
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

    let reply: string;
    if (ru) {
      reply = `${emoji} Записано: *${formatCurrency(result.amount)}* — ${result.category}`;
      if (result.description) reply += `\n_${result.description}_`;
      if (result.confidence < 0.7) reply += `\n\n⚠️ Не совсем уверен. Используйте /undo если ошибка.`;
    } else {
      reply = `${emoji} Recorded: *${formatCurrency(result.amount)}* — ${result.category}`;
      if (result.description) reply += `\n_${result.description}_`;
      if (result.confidence < 0.7) reply += `\n\n⚠️ I wasn't fully sure about this. Use /undo if it's wrong.`;
    }

    await ctx.reply(reply, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Message handling failed:", {
      userId: ctx.dbUser.id,
      message: text,
      error,
    });
    await ctx.reply(
      ru
        ? "Произошла ошибка. Попробуйте ещё раз."
        : "Sorry, something went wrong processing your message. Please try again."
    );
  }
}

async function handleQuery(ctx: AuthContext, query: ParsedQuery, ru = false): Promise<void> {
  const userId = ctx.dbUser.id;

  // Get transactions based on period
  let transactions;
  let periodLabel: string;

  if (query.months && query.months > 1) {
    transactions = await getLastNMonthsTransactions(userId, query.months);
    periodLabel = ru ? `${query.months} мес.` : `${query.months} months`;
  } else if (query.period === "last_month") {
    transactions = await getLastMonthTransactions(userId);
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    periodLabel = lastMonth.toLocaleString(ru ? "ru-RU" : "en-CA", { month: "long" });
  } else {
    transactions = await getMonthlyTransactions(userId);
    periodLabel = new Date().toLocaleString(ru ? "ru-RU" : "en-CA", { month: "long" });
  }

  if (transactions.length === 0) {
    await ctx.reply(
      ru
        ? `Нет транзакций за ${periodLabel}. Начните с записи расходов!`
        : `No transactions found for ${periodLabel}. Start by recording some expenses!`
    );
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
    reply = ru
      ? `💰 *Доход за ${periodLabel}*: ${formatCurrency(totalIncome)}`
      : `💰 *Income for ${periodLabel}*: ${formatCurrency(totalIncome)}`;
    if (query.category) reply += ` (${query.category})`;
    const count = filtered.filter((t) => t.type === "income").length;
    reply += ru ? `\n_${count} транзакций_` : `\n_${count} transactions_`;
  } else if (query.queryType === "balance") {
    const balance = totalIncome - totalExpenses;
    reply = ru
      ? `📊 *Баланс за ${periodLabel}*\n`
      : `📊 *Balance for ${periodLabel}*\n`;
    reply += ru
      ? `💰 Доход: ${formatCurrency(totalIncome)}\n💸 Расходы: ${formatCurrency(totalExpenses)}\n`
      : `💰 Income: ${formatCurrency(totalIncome)}\n💸 Expenses: ${formatCurrency(totalExpenses)}\n`;
    reply += `${balance >= 0 ? "✅" : "⚠️"} ${ru ? "Итого" : "Net"}: *${formatCurrency(balance)}*`;
  } else {
    // spending or summary
    reply = ru
      ? `💸 *Расходы за ${periodLabel}*`
      : `💸 *Expenses for ${periodLabel}*`;
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

    const count = filtered.filter((t) => t.type === "expense").length;
    reply += ru ? `\n_${count} транзакций_` : `\n_${count} transactions_`;
  }

  await ctx.reply(reply, { parse_mode: "Markdown" });
}
