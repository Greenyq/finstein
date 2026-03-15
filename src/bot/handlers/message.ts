import type { AuthContext } from "../middleware/auth.js";
import { parseMessage } from "../../agents/parser.js";
import type { ParsedQuery } from "../../agents/parser.js";
import { createTransaction, getMonthlyTransactions, getLastMonthTransactions, getLastNMonthsTransactions } from "../../services/transaction.js";
import { formatCurrency } from "../../utils/formatting.js";
import { handleSetupMessage } from "../commands/setup.js";
import { clearReportCache } from "../commands/report.js";
import { isLikelyFinancial } from "../../utils/topicGuard.js";
import { checkBudgetLimits } from "../commands/limit.js";
import { getFamilyMemberIds } from "../../services/family.js";
import { respondToQuery } from "../../agents/responder.js";
import { upsertWalletAccount, getWalletAccounts } from "../../services/wallet.js";

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
      // Try to answer conversational financial messages using AI + current data
      try {
        const memberIds = await getFamilyMemberIds(ctx.dbUser.id);
        const queryIds = memberIds.length > 1 ? memberIds : ctx.dbUser.id;
        const transactions = await getMonthlyTransactions(queryIds);

        const walletAccounts = await getWalletAccounts(queryIds);

        if (transactions.length > 0 || walletAccounts.length > 0) {
          const byCategory = new Map<string, number>();
          let totalIncome = 0;
          let totalExpenses = 0;
          for (const t of transactions) {
            if (t.type === "income") totalIncome += t.amount;
            else {
              totalExpenses += t.amount;
              byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
            }
          }

          const periodLabel = new Date().toLocaleString(ru ? "ru-RU" : "en-CA", { month: "long" });
          const reply = await respondToQuery(text, {
            totalIncome,
            totalExpenses,
            balance: totalIncome - totalExpenses,
            transactionCount: transactions.length,
            categoryBreakdown: Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
            transactions: transactions.map((t) => ({
              type: t.type,
              amount: t.amount,
              category: t.category,
              subcategory: t.subcategory,
              description: t.description,
              authorName: t.authorName,
            })),
            walletAccounts: walletAccounts.map((a) => ({ name: a.name, balance: a.balance })),
          }, periodLabel, ru);

          await ctx.reply(reply, { parse_mode: "Markdown" });
          return;
        }
      } catch {
        // Fall through to default response
      }

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

    if (result.type === "wallet_update") {
      for (const account of result.accounts) {
        await upsertWalletAccount(ctx.dbUser.id, account.name, account.balance);
      }
      const lines = result.accounts.map((a) => `• ${a.name}: *${formatCurrency(a.balance)}*`);
      const total = result.accounts.reduce((sum, a) => sum + a.balance, 0);
      const reply = ru
        ? `💳 Балансы обновлены:\n${lines.join("\n")}\n\n_Итого: ${formatCurrency(total)}_`
        : `💳 Balances updated:\n${lines.join("\n")}\n\n_Total: ${formatCurrency(total)}_`;
      await ctx.reply(reply, { parse_mode: "Markdown" });
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

    // Check budget limits after recording an expense
    if (result.type === "expense") {
      const warning = await checkBudgetLimits(ctx.dbUser.id, result.category, result.amount);
      if (warning) {
        await ctx.reply(warning, { parse_mode: "Markdown" });
      }
    }
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
  const memberIds = await getFamilyMemberIds(userId);
  const queryIds = memberIds.length > 1 ? memberIds : userId;

  // Get transactions based on period
  let transactions;
  let periodLabel: string;

  if (query.months && query.months > 1) {
    transactions = await getLastNMonthsTransactions(queryIds, query.months);
    periodLabel = ru ? `${query.months} мес.` : `${query.months} months`;
  } else if (query.period === "last_month") {
    transactions = await getLastMonthTransactions(queryIds);
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    periodLabel = lastMonth.toLocaleString(ru ? "ru-RU" : "en-CA", { month: "long" });
  } else {
    transactions = await getMonthlyTransactions(queryIds);
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

  // Build category breakdown
  const byCategory = new Map<string, number>();
  for (const t of filtered.filter((t) => t.type === "expense")) {
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
  }
  const categoryBreakdown = Array.from(byCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Get wallet accounts for context
  const walletAccounts = await getWalletAccounts(queryIds);

  // Use AI to generate a smart, contextual response
  const reply = await respondToQuery(query.rawMessage, {
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    transactionCount: filtered.length,
    categoryBreakdown,
    transactions: filtered.map((t) => ({
      type: t.type,
      amount: t.amount,
      category: t.category,
      subcategory: t.subcategory,
      description: t.description,
      authorName: t.authorName,
    })),
    walletAccounts: walletAccounts.map((a) => ({ name: a.name, balance: a.balance })),
  }, periodLabel, ru);

  await ctx.reply(reply, { parse_mode: "Markdown" });
}
