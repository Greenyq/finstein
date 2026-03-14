import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { getComparisonData, getFixedExpenses } from "./budget.js";
import { analyzeFinances } from "../agents/analyzer.js";
import { generateAdvice } from "../agents/advisor.js";
import { createTransaction } from "./transaction.js";
import type { Bot } from "grammy";

export function startScheduler(bot: Bot): void {
  // Monthly report: 1st of each month at 9:00 AM
  cron.schedule("0 9 1 * *", async () => {
    console.log("Running monthly report cron job...");
    try {
      const users = await prisma.user.findMany();

      for (const user of users) {
        try {
          await sendMonthlyReport(bot, user);
          await autoAddFixedExpenses(user.id);
        } catch (error) {
          console.error(`Monthly report failed for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Monthly cron job failed:", error);
    }
  });

  console.log("Scheduler started: monthly reports on the 1st at 9:00 AM");
}

async function sendMonthlyReport(
  bot: Bot,
  user: { id: string; telegramId: bigint; monthlyIncome: number }
): Promise<void> {
  const comparison = await getComparisonData(user.id);

  if (comparison.currentMonth.transactionCount === 0) return;

  const fixedExpenses = await getFixedExpenses(user.id);

  const analysis = await analyzeFinances({
    currentMonth: comparison.currentMonth,
    lastMonth: comparison.lastMonth,
    trends: comparison.trends,
    fixedExpenses: fixedExpenses.map((e) => ({
      name: e.name,
      amount: e.amount,
      category: e.category,
    })),
    monthlyIncome: user.monthlyIncome,
  });

  const advice = await generateAdvice(analysis);

  await bot.api.sendMessage(Number(user.telegramId), advice, {
    parse_mode: "Markdown",
  });
}

async function autoAddFixedExpenses(userId: string): Promise<void> {
  const fixedExpenses = await getFixedExpenses(userId);

  if (fixedExpenses.length === 0) return;

  const transactions = fixedExpenses.map((exp) => ({
    userId,
    type: "expense" as const,
    amount: exp.amount,
    category: exp.category,
    description: `${exp.name} (auto)`,
    rawMessage: "auto-added fixed expense",
  }));

  // Batch create
  await prisma.transaction.createMany({
    data: transactions.map((t) => ({
      ...t,
      date: new Date(),
    })),
  });
}
