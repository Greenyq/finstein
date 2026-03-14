import type { Context } from "grammy";
import { prisma } from "../../db/prisma.js";
import { CATEGORIES } from "../../utils/categories.js";
import { formatCurrency } from "../../utils/formatting.js";
import type { AuthContext } from "../middleware/auth.js";

type ConversationState = {
  step: "income" | "fixed_expenses" | "fixed_name" | "fixed_amount" | "fixed_category" | "done";
  fixedName?: string;
};

const setupSessions = new Map<string, ConversationState>();

export async function setupCommand(ctx: AuthContext): Promise<void> {
  const userId = ctx.dbUser.id;

  const fixedExpenses = await prisma.fixedExpense.findMany({
    where: { userId, isActive: true },
  });

  let message = `*Setup — Configure your finances*\n\n`;
  message += `*Current monthly income:* ${formatCurrency(ctx.dbUser.monthlyIncome)}\n\n`;

  if (fixedExpenses.length > 0) {
    message += `*Fixed expenses:*\n`;
    for (const exp of fixedExpenses) {
      message += `• ${exp.name}: ${formatCurrency(exp.amount)}`;
      if (exp.dayOfMonth) message += ` (due day ${exp.dayOfMonth})`;
      message += `\n`;
    }
    message += `\n`;
  }

  message += `To update, send one of:\n`;
  message += `• _"income 4500"_ — set monthly income\n`;
  message += `• _"add mortgage 1200"_ — add fixed expense\n`;
  message += `• _"remove mortgage"_ — remove fixed expense\n`;
  message += `\nSend /help to go back.`;

  setupSessions.set(userId, { step: "income" });

  await ctx.reply(message, { parse_mode: "Markdown" });
}

export async function handleSetupMessage(ctx: AuthContext): Promise<boolean> {
  const userId = ctx.dbUser.id;
  const session = setupSessions.get(userId);
  if (!session) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  // Set income: "income 4500"
  const incomeMatch = text.match(/^income\s+([\d.]+)$/i);
  if (incomeMatch?.[1]) {
    const amount = parseFloat(incomeMatch[1]);
    await prisma.user.update({
      where: { id: userId },
      data: { monthlyIncome: amount },
    });
    await ctx.reply(`Monthly income set to *${formatCurrency(amount)}*`, {
      parse_mode: "Markdown",
    });
    return true;
  }

  // Add fixed expense: "add mortgage 1200"
  const addMatch = text.match(/^add\s+(.+?)\s+([\d.]+)$/i);
  if (addMatch?.[1] && addMatch[2]) {
    const name = addMatch[1];
    const amount = parseFloat(addMatch[2]);
    const category = findFixedCategory(name);

    await prisma.fixedExpense.create({
      data: {
        userId,
        name,
        amount,
        category,
      },
    });

    await ctx.reply(
      `Added fixed expense: *${name}* — ${formatCurrency(amount)} (${category})`,
      { parse_mode: "Markdown" }
    );
    return true;
  }

  // Remove fixed expense: "remove mortgage"
  const removeMatch = text.match(/^remove\s+(.+)$/i);
  if (removeMatch?.[1]) {
    const name = removeMatch[1].trim();
    const expense = await prisma.fixedExpense.findFirst({
      where: {
        userId,
        name: { equals: name },
        isActive: true,
      },
    });
    if (expense) {
      await prisma.fixedExpense.update({
        where: { id: expense.id },
        data: { isActive: false },
      });
      await ctx.reply(`Removed fixed expense: *${name}*`, { parse_mode: "Markdown" });
    } else {
      await ctx.reply(`No active fixed expense found with name "${name}".`);
    }
    return true;
  }

  // Not a setup command
  setupSessions.delete(userId);
  return false;
}

function findFixedCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const cat of CATEGORIES.fixed) {
    if (lower.includes(cat.toLowerCase())) return cat;
  }
  return "Subscriptions";
}
