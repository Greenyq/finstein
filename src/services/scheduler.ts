import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { getComparisonData, getFixedExpenses, getMonthSummary } from "./budget.js";
import { analyzeFinances } from "../agents/analyzer.js";
import { generateAdvice } from "../agents/advisor.js";
import { generateWeeklyPulse } from "../agents/weeklyPulse.js";
import { generateSavingsProjection } from "../agents/savingsProjection.js";
import { generateMemoryComparison } from "../agents/memoryComparison.js";
import { generateMilestoneCelebration, detectNewMilestones, type MilestoneKey } from "../agents/milestoneDetector.js";
import { getFamilyMemberIds } from "./family.js";
import { getLastNMonthsTransactions } from "./transaction.js";
import { searchBetterDeals } from "./webSearch.js";
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

  // Memory comparison: 5th of each month at 10:00 AM (only for users with 2+ months data)
  cron.schedule("0 10 5 * *", async () => {
    console.log("Running memory comparison cron job...");
    try {
      const users = await prisma.user.findMany();
      for (const user of users) {
        try {
          await sendMemoryComparison(bot, user);
        } catch (error) {
          console.error(`Memory comparison failed for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Memory comparison cron failed:", error);
    }
  });

  // Savings projection: every Tuesday at 10:00 AM
  cron.schedule("0 10 * * 2", async () => {
    console.log("Running savings projection cron job...");
    try {
      const users = await prisma.user.findMany();
      for (const user of users) {
        try {
          await sendSavingsProjection(bot, user);
        } catch (error) {
          console.error(`Savings projection failed for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Savings projection cron failed:", error);
    }
  });

  // Weekly Sunday pulse: every Sunday at 7:00 PM
  cron.schedule("0 19 * * 0", async () => {
    console.log("Running weekly Sunday pulse cron job...");
    try {
      const users = await prisma.user.findMany();
      for (const user of users) {
        try {
          await sendWeeklyPulse(bot, user);
        } catch (error) {
          console.error(`Weekly pulse failed for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Weekly pulse cron failed:", error);
    }
  });

  // Milestone check: 3rd of each month at 9:30 AM (after data settles from month-end)
  cron.schedule("30 9 3 * *", async () => {
    console.log("Running milestone detection cron job...");
    try {
      const users = await prisma.user.findMany();
      for (const user of users) {
        try {
          await checkAndSendMilestones(bot, user);
        } catch (error) {
          console.error(`Milestone check failed for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Milestone cron failed:", error);
    }
  });

  // Daily recurring expenses: every day at 8:00 AM, add expenses whose dayOfMonth matches today
  // Also backfills any missed expenses for the current month
  cron.schedule("0 8 * * *", async () => {
    const today = new Date().getDate();
    console.log(`Running daily recurring expenses for day ${today}...`);
    try {
      const users = await prisma.user.findMany();
      for (const user of users) {
        try {
          // First backfill any missed expenses from earlier in the month
          const backfilled = await backfillMonthlyRecurring(user.id);
          if (backfilled > 0) {
            console.log(`Backfilled ${backfilled} missed recurring expenses for user ${user.id}`);
          }
          // Then add today's expenses (backfill already covers today, but this is a safety net)
          await autoAddDailyRecurring(user.id, today);
        } catch (error) {
          console.error(`Recurring expense failed for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Daily recurring cron failed:", error);
    }
  });

  // On startup: backfill any missed recurring expenses for the current month
  console.log("Backfilling missed recurring expenses on startup...");
  prisma.user.findMany().then(async (users) => {
    for (const user of users) {
      try {
        const backfilled = await backfillMonthlyRecurring(user.id);
        if (backfilled > 0) {
          console.log(`Startup backfill: added ${backfilled} missed recurring expenses for user ${user.id}`);
        }
      } catch (error) {
        console.error(`Startup backfill failed for user ${user.id}:`, error);
      }
    }
    console.log("Startup backfill complete.");
  }).catch((error) => {
    console.error("Startup backfill failed:", error);
  });

  console.log(
    "Scheduler started: monthly reports on 1st at 9AM, memory comparison on 5th at 10AM, " +
    "savings projection every Tuesday at 10AM, weekly pulse every Sunday at 7PM, " +
    "milestone check on 3rd at 9:30AM, recurring expenses daily at 8AM (with backfill)",
  );
}

async function sendMonthlyReport(
  bot: Bot,
  user: { id: string; telegramId: bigint; monthlyIncome: number; language: string },
): Promise<void> {
  const memberIds = await getFamilyMemberIds(user.id);
  const queryIds = memberIds.length > 1 ? memberIds : user.id;

  const comparison = await getComparisonData(queryIds);

  if (comparison.currentMonth.transactionCount === 0) return;

  const fixedExpenses = await getFixedExpenses(queryIds);

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

  const lang = user.language === "en" ? "en" : "ru";
  const advice = await generateAdvice(analysis, lang);

  await bot.api.sendMessage(Number(user.telegramId), advice, {
    parse_mode: "Markdown",
  });
}

async function sendWeeklyPulse(
  bot: Bot,
  user: { id: string; telegramId: bigint; firstName: string; language: string; timezone: string },
): Promise<void> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  // Get last 5 weeks of transactions to compute 4-week averages
  const fiveWeeksAgo = new Date(now);
  fiveWeeksAgo.setDate(now.getDate() - 35);

  const allTx = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      type: "expense",
      date: { gte: fiveWeeksAgo },
      deletedAt: null,
    },
  });

  const thisWeekTx = allTx.filter((t) => t.date >= weekStart);
  const prevTx = allTx.filter((t) => t.date < weekStart);

  // Need at least 3 transactions this week
  if (thisWeekTx.length < 3) return;

  const weekExpenses = thisWeekTx.reduce((sum, t) => sum + t.amount, 0);
  const avgWeeklyExpenses = prevTx.length > 0 ? prevTx.reduce((sum, t) => sum + t.amount, 0) / 4 : weekExpenses;

  // Per-category breakdown for this week and avg
  const catMapThis = new Map<string, number>();
  for (const t of thisWeekTx) {
    catMapThis.set(t.category, (catMapThis.get(t.category) ?? 0) + t.amount);
  }

  const catMapPrev = new Map<string, number>();
  for (const t of prevTx) {
    catMapPrev.set(t.category, (catMapPrev.get(t.category) ?? 0) + t.amount);
  }

  const categoryBreakdown = Array.from(catMapThis.entries()).map(([category, amount]) => ({
    category,
    amount,
    avgAmount: (catMapPrev.get(category) ?? 0) / 4,
  }));

  const lang = user.language === "en" ? "en" : "ru";
  const weekIncome = await prisma.transaction
    .findMany({ where: { userId: user.id, type: "income", date: { gte: weekStart }, deletedAt: null } })
    .then((tx) => tx.reduce((s, t) => s + t.amount, 0));

  // Gather recurring/fixed expenses for savings tips
  const fixedExpenses = await prisma.fixedExpense.findMany({
    where: { userId: user.id, isActive: true },
    select: { name: true, amount: true, category: true },
  });

  // Gather budget limits for context
  const budgetLimits = await prisma.budgetLimit.findMany({
    where: { userId: user.id },
    select: { category: true, monthlyLimit: true },
  });

  // Web search for better deals — only on the first Sunday of the month
  // to avoid repeating the same tip every week
  const isFirstSundayOfMonth = now.getDate() <= 7;
  let dealSearchResult: string | undefined;
  if (isFirstSundayOfMonth && fixedExpenses.length > 0) {
    const searchable = ["Internet", "Phone", "Insurance", "Gym", "Subscriptions", "Utilities"];
    const topExpense = [...fixedExpenses]
      .filter((e) => searchable.some((s) => e.name.toLowerCase().includes(s.toLowerCase()) || e.category.toLowerCase().includes(s.toLowerCase())))
      .sort((a, b) => b.amount - a.amount)[0];

    if (topExpense) {
      // Derive city from timezone (e.g. "America/Winnipeg" -> "Winnipeg")
      const city = user.timezone.split("/").pop()?.replace(/_/g, " ") ?? "Canada";
      const result = await searchBetterDeals(topExpense.name, topExpense.amount, city);
      if (result) dealSearchResult = result;
    }
  }

  const message = await generateWeeklyPulse({
    userName: user.firstName,
    weekExpenses,
    weekIncome,
    avgWeeklyExpenses,
    categoryBreakdown,
    // Only include savings tip data on the first Sunday of the month
    ...(isFirstSundayOfMonth && {
      fixedExpenses,
      budgetLimits: budgetLimits.map((l) => ({ category: l.category, limit: l.monthlyLimit })),
      dealSearchResult,
    }),
    lang,
  });

  await bot.api.sendMessage(Number(user.telegramId), message, { parse_mode: "Markdown" });
}

async function sendMemoryComparison(
  bot: Bot,
  user: { id: string; telegramId: bigint; firstName: string; language: string },
): Promise<void> {
  // Need 14+ months of data for year comparison, else 4+ months for 3-month comparison
  const fourteenMonthsAgo = new Date();
  fourteenMonthsAgo.setMonth(fourteenMonthsAgo.getMonth() - 14);

  const oldestTx = await prisma.transaction.findFirst({
    where: { userId: user.id, deletedAt: null },
    orderBy: { date: "asc" },
  });

  if (!oldestTx) return;

  const monthsOfData =
    (new Date().getFullYear() - oldestTx.date.getFullYear()) * 12 +
    (new Date().getMonth() - oldestTx.date.getMonth());

  // Need at least 2 months of data to compare
  if (monthsOfData < 2) return;

  const now = new Date();
  const compareMonthsBack = monthsOfData >= 12 ? 12 : 3;

  const pastDate = new Date(now.getFullYear(), now.getMonth() - compareMonthsBack, 1);

  const memberIds = await getFamilyMemberIds(user.id);
  const queryIds = memberIds.length > 1 ? memberIds : user.id;

  const currentSummary = await getMonthSummary(queryIds);
  const pastSummary = await getMonthSummary(queryIds, pastDate);

  // Need data in both periods
  if (currentSummary.transactionCount === 0 || pastSummary.transactionCount === 0) return;

  const currentSavings = currentSummary.totalIncome - currentSummary.totalExpenses;
  const pastSavings = pastSummary.totalIncome - pastSummary.totalExpenses;

  // Find notable category changes
  const pastCatMap = new Map(pastSummary.categoryBreakdown.map((c) => [c.category, c.amount]));
  const notableChanges = currentSummary.categoryBreakdown
    .filter((c) => {
      const past = pastCatMap.get(c.category) ?? 0;
      return past > 0 && Math.abs(c.amount - past) / past > 0.3;
    })
    .sort((a, b) => {
      const diffA = Math.abs(a.amount - (pastCatMap.get(a.category) ?? 0));
      const diffB = Math.abs(b.amount - (pastCatMap.get(b.category) ?? 0));
      return diffB - diffA;
    })
    .slice(0, 2)
    .map((c) => ({ category: c.category, current: c.amount, past: pastCatMap.get(c.category) ?? 0 }));

  const monthNames: Record<number, string> = {
    0: "январе", 1: "феврале", 2: "марте", 3: "апреле", 4: "мае", 5: "июне",
    6: "июле", 7: "августе", 8: "сентябре", 9: "октябре", 10: "ноябре", 11: "декабре",
  };

  const currentMonthLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const pastMonthLabel = `${monthNames[pastDate.getMonth()]} ${pastDate.getFullYear()}`;

  const lang = user.language === "en" ? "en" : "ru";

  const message = await generateMemoryComparison({
    userName: user.firstName,
    currentMonthLabel,
    pastMonthLabel,
    currentSavings,
    pastSavings,
    currentExpenses: currentSummary.totalExpenses,
    pastExpenses: pastSummary.totalExpenses,
    currentIncome: currentSummary.totalIncome,
    pastIncome: pastSummary.totalIncome,
    notableChanges,
    lang,
  });

  await bot.api.sendMessage(Number(user.telegramId), message, { parse_mode: "Markdown" });
}

async function sendSavingsProjection(
  bot: Bot,
  user: { id: string; telegramId: bigint; firstName: string; language: string; monthlyIncome: number },
): Promise<void> {
  const memberIds = await getFamilyMemberIds(user.id);
  const queryIds = memberIds.length > 1 ? memberIds : user.id;
  const summary = await getMonthSummary(queryIds);

  // Need at least some data
  if (summary.transactionCount < 5) return;

  // Monthly savings rate
  const monthlyRate = summary.totalIncome - summary.totalExpenses;

  // Find top "wants" category
  const wantCategories = summary.categoryBreakdown.filter((c) => c.group === "wants");
  const topWant = wantCategories[0];
  if (!topWant) return;

  // Get active goal if any
  const goal = await prisma.goal.findFirst({
    where: { userId: user.id, isActive: true },
  });

  // Get total savings from wallet accounts
  const walletAccounts = await prisma.walletAccount.findMany({ where: { userId: user.id } });
  const currentSavings = walletAccounts.reduce((s, a) => s + a.balance, 0);

  const lang = user.language === "en" ? "en" : "ru";

  const message = await generateSavingsProjection({
    userName: user.firstName,
    monthlyIncome: summary.totalIncome || user.monthlyIncome,
    monthlyExpenses: summary.totalExpenses,
    currentSavings,
    topWantCategory: topWant.category,
    topWantAmount: topWant.amount,
    goalAmount: goal?.targetAmount,
    goalName: goal?.name,
    lang,
  });

  await bot.api.sendMessage(Number(user.telegramId), message, { parse_mode: "Markdown" });
}

async function checkAndSendMilestones(
  bot: Bot,
  user: { id: string; telegramId: bigint; firstName: string; language: string; milestonesCelebrated: string },
): Promise<void> {
  const memberIds = await getFamilyMemberIds(user.id);
  const queryIds = memberIds.length > 1 ? memberIds : user.id;

  const celebrated: MilestoneKey[] = JSON.parse(user.milestonesCelebrated || "[]");

  // Get last 4 months of summaries
  const now = new Date();
  const summaries = await Promise.all(
    [0, 1, 2, 3].map((i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return getMonthSummary(queryIds, d);
    }),
  );

  const current = summaries[0]!;
  const m1 = summaries[1]!;
  const m2 = summaries[2]!;
  const m3 = summaries[3]!;
  const balanceHistory = [m3, m2, m1].map((s) => s.totalIncome - s.totalExpenses);
  const currentBalance = current.totalIncome - current.totalExpenses;

  const positiveMonthsStreak = [currentBalance, ...balanceHistory].reduce((streak, b) => {
    if (b > 0) return streak + 1;
    return 0;
  }, 0);

  // All categories this month and all-time
  const categoriesThisMonth = current.categoryBreakdown
    .filter((c) => c.group === "savings")
    .map((c) => c.category);

  const allTimeTx = await prisma.transaction.findMany({
    where: { userId: user.id, type: "expense", deletedAt: null },
    select: { category: true, date: true },
  });

  // All categories before this month (for "first ever" detection)
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const categoriesAllTime: string[] = Array.from(
    new Set(
      allTimeTx
        .filter((t) => t.date < thisMonthStart)
        .map((t) => t.category as string),
    ),
  );

  // Immigration fee amounts
  const immigrationFeesThisMonth = current.categoryBreakdown
    .find((c) => c.category === "Immigration Fees")?.amount ?? 0;

  const immigrationTotals = await prisma.transaction.aggregate({
    where: {
      userId: user.id,
      category: "Immigration Fees",
      date: { lt: thisMonthStart },
      deletedAt: null,
    },
    _sum: { amount: true },
  });
  const immigrationFeesPrevTotal = immigrationTotals._sum.amount ?? 0;

  // Active goal progress
  const goal = await prisma.goal.findFirst({ where: { userId: user.id, isActive: true } });
  const goalProgress = goal
    ? { current: goal.currentAmount, target: goal.targetAmount }
    : undefined;

  const newMilestones = detectNewMilestones({
    celebratedMilestones: celebrated,
    currentBalance,
    balanceHistory,
    categoriesThisMonth,
    categoriesAllTime,
    immigrationFeesThisMonth,
    immigrationFeesPrevMonths: immigrationFeesPrevTotal,
    positiveMonthsStreak,
    goalProgress,
  });

  if (newMilestones.length === 0) return;

  const lang = user.language === "en" ? "en" : "ru";

  // Send one celebration per milestone (max 2 to avoid spam)
  for (const milestoneKey of newMilestones.slice(0, 2)) {
    const relevantAmount = current.categoryBreakdown.find((c) =>
      milestoneKey.includes("tfsa") ? c.category === "TFSA" :
      milestoneKey.includes("rrsp") ? c.category === "RRSP" :
      milestoneKey.includes("401k") ? c.category === "401(k)" :
      milestoneKey.includes("ira") ? c.category === "IRA" || c.category === "Roth IRA" :
      milestoneKey.includes("emergency") ? c.category === "Emergency Fund" :
      false,
    )?.amount;

    try {
      const message = await generateMilestoneCelebration({
        userName: user.firstName,
        milestoneKey,
        amount: relevantAmount,
        lang,
      });

      await bot.api.sendMessage(Number(user.telegramId), message, { parse_mode: "Markdown" });
    } catch (err) {
      console.error(`Milestone message failed for ${milestoneKey}:`, err);
    }
  }

  // Persist all newly celebrated milestones
  const updated = [...celebrated, ...newMilestones];
  await prisma.user.update({
    where: { id: user.id },
    data: { milestonesCelebrated: JSON.stringify(updated) },
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

/**
 * Backfill missed fixed expenses for the current month.
 * Checks all active fixed expenses where dayOfMonth <= today,
 * and creates transactions for any that are missing this month.
 */
export async function backfillMonthlyRecurring(userId: string): Promise<number> {
  const now = new Date();
  const todayDay = now.getDate();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Get all active fixed expenses whose day has already passed (or is today)
  const expenses = await prisma.fixedExpense.findMany({
    where: {
      userId,
      isActive: true,
      dayOfMonth: { lte: todayDay },
    },
  });

  if (expenses.length === 0) return 0;

  // Get all recurring transactions already added this month
  const existingTx = await prisma.transaction.findMany({
    where: {
      userId,
      rawMessage: { startsWith: "[recurring] " },
      date: { gte: monthStart, lte: monthEnd },
      deletedAt: null,
    },
    select: { rawMessage: true },
  });

  const existingNames = new Set(existingTx.map((t) => t.rawMessage));
  let added = 0;

  for (const exp of expenses) {
    const marker = `[recurring] ${exp.name}`;
    if (existingNames.has(marker)) continue; // already exists this month

    // Create the transaction on the correct day of this month
    const expDate = new Date(now.getFullYear(), now.getMonth(), exp.dayOfMonth ?? 1, 8, 0, 0);

    await prisma.transaction.create({
      data: {
        userId,
        type: "expense",
        amount: exp.amount,
        category: exp.category,
        description: `${exp.name} (авто)`,
        date: expDate,
        rawMessage: marker,
      },
    });
    added++;
  }

  return added;
}
