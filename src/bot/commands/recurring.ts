import type { AuthContext } from "../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { formatCurrency } from "../../utils/formatting.js";

export async function recurringCommand(ctx: AuthContext): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/recurring\s*/i, "").trim();

  // No args — show list
  if (!args) {
    const expenses = await prisma.fixedExpense.findMany({
      where: { userId: ctx.dbUser.id, isActive: true },
      orderBy: { amount: "desc" },
    });

    if (expenses.length === 0) {
      await ctx.reply(
        `*Автоматические расходы*\n\n` +
          `У вас пока нет повторяющихся расходов.\n\n` +
          `Добавить:\n` +
          `\`/recurring add Mortgage 1200 1\`\n` +
          `_(название, сумма, день месяца)_\n\n` +
          `Примеры:\n` +
          `\`/recurring add Netflix 15 15\`\n` +
          `\`/recurring add Rent 1500 1\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    let msg = `*Автоматические расходы:*\n\n`;
    let total = 0;
    for (const e of expenses) {
      const day = e.dayOfMonth ? ` (${e.dayOfMonth}-го числа)` : " (1-го числа)";
      msg += `• *${e.name}* — ${formatCurrency(e.amount)}${day}\n`;
      total += e.amount;
    }
    msg += `\n*Итого:* ${formatCurrency(total)}/мес.\n\n`;
    msg += `Добавить: \`/recurring add Name Amount Day\`\n`;
    msg += `Удалить: \`/recurring remove Name\``;

    await ctx.reply(msg, { parse_mode: "Markdown" });
    return;
  }

  // Add: /recurring add Name Amount Day
  const addMatch = args.match(/^add\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(\d+)?\s*$/i);
  if (addMatch) {
    const name = addMatch[1]!.trim();
    const amount = parseFloat(addMatch[2]!);
    const dayOfMonth = addMatch[3] ? parseInt(addMatch[3]) : 1;

    if (dayOfMonth < 1 || dayOfMonth > 28) {
      await ctx.reply("День должен быть от 1 до 28.");
      return;
    }

    // Use name as category or infer
    const category = inferCategory(name);

    await prisma.fixedExpense.create({
      data: {
        userId: ctx.dbUser.id,
        name,
        amount,
        category,
        dayOfMonth,
        isActive: true,
      },
    });

    await ctx.reply(
      `✅ Добавлено: *${name}* — ${formatCurrency(amount)} (каждый ${dayOfMonth}-й)`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Remove: /recurring remove Name
  const removeMatch = args.match(/^(?:remove|delete|del|rm)\s+(.+)$/i);
  if (removeMatch) {
    const name = removeMatch[1]!.trim();

    const expense = await prisma.fixedExpense.findFirst({
      where: {
        userId: ctx.dbUser.id,
        name: { equals: name, mode: "insensitive" },
        isActive: true,
      },
    });

    if (!expense) {
      await ctx.reply(`Не найдено: "${name}". Используйте /recurring для списка.`);
      return;
    }

    await prisma.fixedExpense.update({
      where: { id: expense.id },
      data: { isActive: false },
    });

    await ctx.reply(
      `❌ Удалено: *${expense.name}* — ${formatCurrency(expense.amount)}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Unknown subcommand
  await ctx.reply(
    `Использование:\n` +
      `\`/recurring\` — список\n` +
      `\`/recurring add Name Amount Day\`\n` +
      `\`/recurring remove Name\``,
    { parse_mode: "Markdown" }
  );
}

function inferCategory(name: string): string {
  const lower = name.toLowerCase();
  if (/mortgage|ипотека|rent|аренда/.test(lower)) return "Mortgage/Rent";
  if (/insurance|страхов/.test(lower)) return "Insurance";
  if (/netflix|spotify|youtube|подписк/.test(lower)) return "Subscriptions";
  if (/internet|интернет|phone|телефон|mobile/.test(lower)) return "Utilities";
  if (/hydro|electric|газ|свет|вода/.test(lower)) return "Utilities";
  if (/gym|зал|sport|спорт/.test(lower)) return "Health & Fitness";
  if (/car|авто|машин/.test(lower)) return "Car";
  if (/loan|кредит/.test(lower)) return "Debt";
  return "Other";
}
