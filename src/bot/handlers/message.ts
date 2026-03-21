import { InlineKeyboard } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import { parseMessage } from "../../agents/parser.js";
import type { ParsedQuery, SingleParserResult } from "../../agents/parser.js";
import { createTransaction, getMonthlyTransactions, getLastMonthTransactions, getLastNMonthsTransactions, getTodayTransactions, getRecentTransactions, softDeleteTransaction, updateTransaction } from "../../services/transaction.js";
import { formatCurrency } from "../../utils/formatting.js";
import { handleSetupMessage } from "../commands/setup.js";
import { clearReportCache } from "../commands/report.js";
import { isLikelyFinancial } from "../../utils/topicGuard.js";
import { checkBudgetLimits } from "../commands/limit.js";
import { getFamilyMemberIds } from "../../services/family.js";
import { respondToQuery } from "../../agents/responder.js";
import { upsertWalletAccount, getWalletAccounts } from "../../services/wallet.js";
import { getPendingEdit, processPendingEdit } from "./transaction.js";
import type { Lang } from "../../locales/index.js";
import { t, detectLang } from "../../locales/index.js";

export async function handleTextMessage(ctx: AuthContext, textOverride?: string): Promise<void> {
  const text = (textOverride ?? ctx.message?.text)?.trim();
  if (!text) return;

  // Skip commands
  if (text.startsWith("/")) return;

  // Check if there's a pending edit waiting for user input
  const chatId = ctx.chat?.id;
  if (chatId) {
    const pending = getPendingEdit(chatId);
    if (pending) {
      const handled = await processPendingEdit(ctx, text, pending);
      if (handled) return;
    }
  }

  // Check if we're in a setup session
  const handled = await handleSetupMessage(ctx);
  if (handled) return;

  // Use user's saved language preference, with fallback to detection
  const lang = (ctx.dbUser.language || detectLang(text)) as Lang;
  const ru = lang === "ru";

  // Pre-filter: skip obviously non-financial messages to save API tokens
  if (!isLikelyFinancial(text)) {
    await ctx.reply(t("msg.not_financial", lang)(), { parse_mode: "Markdown" });
    return;
  }

  try {
    // Resolve family member IDs for searching transactions across the family
    const memberIds = await getFamilyMemberIds(ctx.dbUser.id);
    const queryIds = memberIds.length > 1 ? memberIds : ctx.dbUser.id;

    // Fetch existing wallet accounts so the parser can match by name
    const existingAccounts = await getWalletAccounts(queryIds);
    const accountNames = existingAccounts.map((a) => a.name);

    const result = await parseMessage(text, accountNames.length > 0 ? accountNames : undefined);

    // Handle compound (multi-action) messages
    if (result.type === "compound") {
      const replies: string[] = [];
      for (const action of result.actions) {
        const reply = await executeSingleAction(ctx, action, queryIds, ru, lang, text);
        if (reply) replies.push(reply);
      }
      if (replies.length > 0) {
        await ctx.reply(replies.join("\n\n"), { parse_mode: "Markdown" });
      }
      return;
    }

    if (result.type === "unknown") {
      // Fallback: detect edit/delete intent that the parser missed
      const fallbackResult = detectEditDeleteFallback(text);
      if (fallbackResult) {
        if (fallbackResult.action === "edit" && fallbackResult.newAmount !== null) {
          const tx = await findTransactionByTarget(queryIds, fallbackResult.target);
          if (tx) {
            await updateTransaction(tx.id, { amount: fallbackResult.newAmount });
            clearReportCache(ctx.dbUser.id);
            const sign = tx.type === "income" ? "+" : "-";
            const msg = ru
              ? `✅ Обновлено: ${formatCurrency(tx.amount)} → *${formatCurrency(fallbackResult.newAmount)}* — ${tx.category}`
              : `✅ Updated: ${formatCurrency(tx.amount)} → *${formatCurrency(fallbackResult.newAmount)}* — ${tx.category}`;
            await ctx.reply(msg, { parse_mode: "Markdown" });
            return;
          }
        } else if (fallbackResult.action === "delete") {
          const tx = await findTransactionByTarget(queryIds, fallbackResult.target);
          if (tx) {
            await softDeleteTransaction(tx.id);
            clearReportCache(ctx.dbUser.id);
            const keyboard = new InlineKeyboard().text("↩️ Restore / Восстановить", `tx_restore_${tx.id}`);
            const sign = tx.type === "income" ? "+" : "-";
            const msg = ru
              ? `🗑 Удалено: ${sign}${formatCurrency(tx.amount)} — ${tx.category}`
              : `🗑 Deleted: ${sign}${formatCurrency(tx.amount)} — ${tx.category}`;
            await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
            return;
          }
        }
      }

      // Try to answer conversational financial messages using AI + current data
      try {
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

      await ctx.reply(t("msg.not_understood", lang)(), { parse_mode: "Markdown" });
      return;
    }

    if (result.type === "query") {
      await handleQuery(ctx, result, ru);
      return;
    }

    // Execute single action and reply
    const reply = await executeSingleAction(ctx, result, queryIds, ru, lang, text);
    if (reply) {
      await ctx.reply(reply, { parse_mode: "Markdown" });
    }
  } catch (error) {
    console.error("Message handling failed:", {
      userId: ctx.dbUser.id,
      message: text,
      error,
    });
    await ctx.reply(t("msg.error", lang)());
  }
}

/**
 * Execute a single parsed action and return the reply text (without sending it).
 * Used both for standalone messages and as part of compound actions.
 */
async function executeSingleAction(
  ctx: AuthContext,
  result: SingleParserResult,
  queryIds: string | string[],
  ru: boolean,
  lang: Lang,
  rawText: string,
): Promise<string | null> {
  if (result.type === "wallet_update") {
    for (const account of result.accounts) {
      await upsertWalletAccount(ctx.dbUser.id, account.name, account.balance);
    }
    const lines = result.accounts.map((a) => `• ${a.name}: *${formatCurrency(a.balance)}*`);
    const total = result.accounts.reduce((sum, a) => sum + a.balance, 0);
    clearReportCache(ctx.dbUser.id);
    return `💳 ${lines.join("\n")}\n\n${t("msg.wallet_updated", lang)(formatCurrency(total))}`;
  }

  if (result.type === "edit_transaction") {
    const tx = await findTransactionByTarget(queryIds, result.target);
    if (!tx) {
      return ru ? "Не нашёл такую транзакцию." : "Transaction not found.";
    }
    const changes = result.changes;
    if (changes.amount || changes.category || changes.description) {
      await updateTransaction(tx.id, {
        amount: changes.amount ?? undefined,
        category: changes.category ?? undefined,
        description: changes.description !== undefined ? changes.description : undefined,
      });
      clearReportCache(ctx.dbUser.id);
      const updated = { ...tx, ...changes };
      const sign = updated.type === "income" ? "+" : "-";
      return ru
        ? `✅ Обновлено: ${sign}${formatCurrency(updated.amount ?? tx.amount)} — ${updated.category ?? tx.category}`
        : `✅ Updated: ${sign}${formatCurrency(updated.amount ?? tx.amount)} — ${updated.category ?? tx.category}`;
    }
    return null;
  }

  if (result.type === "delete_transaction") {
    const tx = await findTransactionByTarget(queryIds, result.target);
    if (!tx) {
      return ru ? "Не нашёл такую транзакцию." : "Transaction not found.";
    }
    await softDeleteTransaction(tx.id);
    clearReportCache(ctx.dbUser.id);
    const sign = tx.type === "income" ? "+" : "-";
    return ru
      ? `🗑 Удалено: ${sign}${formatCurrency(tx.amount)} — ${tx.category}${tx.description ? ` (${tx.description})` : ""}`
      : `🗑 Deleted: ${sign}${formatCurrency(tx.amount)} — ${tx.category}${tx.description ? ` (${tx.description})` : ""}`;
  }

  if (result.type === "income" || result.type === "expense") {
    await createTransaction({
      userId: ctx.dbUser.id,
      type: result.type,
      amount: result.amount,
      category: result.category,
      subcategory: result.subcategory ?? undefined,
      description: result.description,
      authorName: ctx.dbUser.firstName,
      date: new Date(result.date),
      rawMessage: rawText,
    });
    clearReportCache(ctx.dbUser.id);

    const emoji = result.type === "income" ? "💰" : "✅";
    const txDate = new Date(result.date);
    const formattedDate = txDate.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-CA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    let reply = `${emoji} ${t("msg.recorded", lang)(formatCurrency(result.amount), result.category, formattedDate)}`;
    if (result.description) reply += `\n_${result.description}_`;
    if (result.confidence < 0.7) reply += `\n\n⚠️ ${t("msg.low_confidence", lang)()}`;

    // Check budget limits after recording an expense
    if (result.type === "expense") {
      const warning = await checkBudgetLimits(ctx.dbUser.id, result.category, result.amount);
      if (warning) reply += `\n\n${warning}`;
    }

    return reply;
  }

  return null;
}

async function handleQuery(ctx: AuthContext, query: ParsedQuery, ru = false): Promise<void> {
  const lang: Lang = ru ? "ru" : "en";
  const userId = ctx.dbUser.id;
  const memberIds = await getFamilyMemberIds(userId);
  const queryIds = memberIds.length > 1 ? memberIds : userId;

  // Get transactions based on period
  let transactions;
  let periodLabel: string;

  if (query.months && query.months > 1) {
    transactions = await getLastNMonthsTransactions(queryIds, query.months);
    periodLabel = ru ? `${query.months} мес.` : `${query.months} months`;
  } else if (query.period === "today") {
    transactions = await getTodayTransactions(queryIds);
    periodLabel = ru ? "сегодня" : "today";
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
    await ctx.reply(t("msg.no_transactions", lang)(periodLabel));
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

/**
 * Fallback detector for edit/delete intent when parser returns "unknown".
 * Catches conversational messages like "no, it was 58 not 78", "delete it", "wrong, should be 50".
 */
function detectEditDeleteFallback(text: string): { action: "edit" | "delete"; target: string; newAmount: number | null } | null {
  const lower = text.toLowerCase();

  // Edit patterns: messages with correction intent + two amounts (old → new)
  const editKeywords = /\b(change|edit|fix|correct|wrong|should be|not|wasn't|от|на|а не|неправильно|измени|поменяй|исправь|было|должно быть|не \d|это не)\b/i;
  const deleteKeywords = /\b(delete|remove|удали|убери|сотри|kill|drop)\b/i;

  // Extract all dollar amounts from the text
  const amounts = [...text.matchAll(/\$?\d+(?:[.,]\d{1,2})?/g)].map((m) =>
    parseFloat(m[0].replace("$", "").replace(",", "."))
  ).filter((n) => n > 0);

  if (editKeywords.test(lower) && amounts.length >= 2) {
    // "from $78 to $58.36" or "not 78 but 58" — first is old, last is new
    const oldAmount = amounts[0]!;
    const newAmount = amounts[amounts.length - 1]!;
    return { action: "edit", target: String(oldAmount), newAmount };
  }

  if (editKeywords.test(lower) && amounts.length === 1) {
    // "wrong, should be 58" — one amount is the new value, target is "last"
    return { action: "edit", target: "last", newAmount: amounts[0]! };
  }

  if (deleteKeywords.test(lower)) {
    const target = amounts.length > 0 ? String(amounts[0]) : "last";
    return { action: "delete", target, newAmount: null };
  }

  return null;
}

/** Find a transaction by target string — "last" or keyword match on description/category/amount */
async function findTransactionByTarget(userId: string | string[], target: string) {
  const recent = await getRecentTransactions(userId, 20);
  if (recent.length === 0) return null;

  const t = target.toLowerCase().trim();

  // "last" / "последняя" / "последнюю" — return the most recent
  if (t === "last" || t.startsWith("послед")) {
    return recent[0]!;
  }

  // Try to match by description, category, or amount
  const amountMatch = t.match(/\d+(\.\d+)?/);
  const amountNum = amountMatch ? parseFloat(amountMatch[0]) : null;

  for (const tx of recent) {
    const desc = (tx.description ?? "").toLowerCase();
    const cat = tx.category.toLowerCase();
    const sub = (tx.subcategory ?? "").toLowerCase();

    // Exact amount match
    if (amountNum && tx.amount === amountNum) return tx;

    // Keyword match in description, category, or subcategory
    if (desc.includes(t) || cat.includes(t) || sub.includes(t)) return tx;

    // Partial match — target words in description/category
    const words = t.split(/\s+/).filter((w) => w.length > 2);
    if (words.length > 0 && words.every((w) => desc.includes(w) || cat.includes(w) || sub.includes(w))) {
      return tx;
    }
  }

  // Fallback: return the most recent
  return recent[0]!;
}
