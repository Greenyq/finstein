import type { AuthContext } from "../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { formatCurrency } from "../../utils/formatting.js";
import { getAllCategories } from "../../utils/categories.js";

export async function limitCommand(ctx: AuthContext): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/limit\s*/i, "").trim();

  // No args — show current limits
  if (!args) {
    const limits = await prisma.budgetLimit.findMany({
      where: { userId: ctx.dbUser.id },
      orderBy: { category: "asc" },
    });

    if (limits.length === 0) {
      await ctx.reply(
        `*Лимиты бюджета*\n\n` +
          `У вас пока нет лимитов.\n\n` +
          `Установите лимит:\n` +
          `\`/limit Restaurants 200\`\n` +
          `\`/limit Groceries 500\`\n\n` +
          `Удалить лимит:\n` +
          `\`/limit Restaurants 0\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Show limits with current spending
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    let msg = `*Лимиты бюджета:*\n\n`;

    for (const limit of limits) {
      const spent = await getCategorySpending(ctx.dbUser.id, limit.category, monthStart, monthEnd);
      const pct = Math.round((spent / limit.monthlyLimit) * 100);
      const bar = progressBar(pct);
      const icon = pct >= 100 ? "🔴" : pct >= 80 ? "🟡" : "🟢";

      msg += `${icon} *${limit.category}*\n`;
      msg += `${bar} ${pct}%\n`;
      msg += `${formatCurrency(spent)} / ${formatCurrency(limit.monthlyLimit)}\n\n`;
    }

    msg += `Изменить: \`/limit Category Amount\``;

    await ctx.reply(msg, { parse_mode: "Markdown" });
    return;
  }

  // Parse: /limit Category Amount
  const match = args.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*$/);
  if (!match) {
    await ctx.reply(
      `Формат: \`/limit Category Amount\`\n` +
        `Пример: \`/limit Restaurants 200\`\n\n` +
        `Доступные категории:\n` +
        `${getAllCategories().join(", ")}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const category = match[1]!.trim();
  const amount = parseFloat(match[2]!);

  // Delete limit if amount is 0
  if (amount === 0) {
    await prisma.budgetLimit.deleteMany({
      where: { userId: ctx.dbUser.id, category },
    });
    await ctx.reply(`Лимит для *${category}* удалён.`, { parse_mode: "Markdown" });
    return;
  }

  // Upsert limit
  await prisma.budgetLimit.upsert({
    where: {
      userId_category: { userId: ctx.dbUser.id, category },
    },
    update: { monthlyLimit: amount },
    create: {
      userId: ctx.dbUser.id,
      category,
      monthlyLimit: amount,
    },
  });

  await ctx.reply(
    `✅ Лимит установлен: *${category}* — ${formatCurrency(amount)}/мес.`,
    { parse_mode: "Markdown" }
  );
}

async function getCategorySpending(
  userId: string,
  category: string,
  start: Date,
  end: Date
): Promise<number> {
  const result = await prisma.transaction.aggregate({
    where: {
      userId,
      type: "expense",
      category,
      date: { gte: start, lte: end },
    },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

function progressBar(pct: number): string {
  const filled = Math.min(Math.round(pct / 10), 10);
  const empty = 10 - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

/** Check limits after a new expense and return warning if needed */
export async function checkBudgetLimits(
  userId: string,
  category: string,
  newAmount: number
): Promise<string | null> {
  const limit = await prisma.budgetLimit.findUnique({
    where: { userId_category: { userId, category } },
  });

  if (!limit) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const spent = await getCategorySpending(userId, category, monthStart, monthEnd);
  const pct = Math.round((spent / limit.monthlyLimit) * 100);

  if (pct >= 100) {
    return `🔴 *Лимит превышен!* ${category}: ${formatCurrency(spent)} / ${formatCurrency(limit.monthlyLimit)} (${pct}%)`;
  } else if (pct >= 80) {
    return `🟡 *Внимание:* ${category} — ${pct}% лимита (${formatCurrency(spent)} / ${formatCurrency(limit.monthlyLimit)})`;
  }

  return null;
}
