import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { getComparisonData, getFixedExpenses } from "./budget.js";
import { analyzeFinances } from "../agents/analyzer.js";
import { generateAdvice } from "../agents/advisor.js";
import { getFamilyMemberIds } from "./family.js";
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
        } catch (error) {
          console.error(`Monthly report failed for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Monthly cron job failed:", error);
    }
  });

  // Daily recurring expenses: every day at 8:00 AM, add expenses whose dayOfMonth matches today
  cron.schedule("0 8 * * *", async () => {
    const today = new Date().getDate();
    console.log(`Running daily recurring expenses for day ${today}...`);
    try {
      const users = await prisma.user.findMany();
      for (const user of users) {
        try {
          await autoAddDailyRecurring(user.id, today);
        } catch (error) {
          console.error(`Recurring expense failed for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Daily recurring cron failed:", error);
    }
  });

  console.log("Scheduler started: monthly reports on 1st at 9AM, recurring expenses daily at 8AM");
}

async function sendMonthlyReport(
  bot: Bot,
  user: { id: string; telegramId: bigint; monthlyIncome: number }
): Promise<void> {
  const memberIds = await getFamilyMemberIds(user.id);
  const queryIds = memberIds.length > 1 ? memberIds : user.id;

  const comparison = await getComparisonData(queryIds);

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

async function autoAddDailyRecurring(userId: string, dayOfMonth: number): Promise<void> {
  // Find recurring expenses for today's day
  const expenses = await prisma.fixedExpense.findMany({
    where: {
      userId,
      isActive: true,
      dayOfMonth: dayOfMonth,
    },
  });

  if (expenses.length === 0) return;

  // Check if already added today (prevent duplicates on restart)
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  for (const exp of expenses) {
    const existing = await prisma.transaction.findFirst({
      where: {
        userId,
        rawMessage: `[recurring] ${exp.name}`,
        date: { gte: todayStart, lte: todayEnd },
      },
    });

    if (existing) continue; // already added today

    await prisma.transaction.create({
      data: {
        userId,
        type: "expense",
        amount: exp.amount,
        category: exp.category,
        description: `${exp.name} (авто)`,
        date: today,
        rawMessage: `[recurring] ${exp.name}`,
      },
    });
  }
}
