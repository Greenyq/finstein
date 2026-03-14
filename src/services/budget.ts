import { prisma } from "../db/prisma.js";
import { getMonthlyTransactions, getLastMonthTransactions } from "./transaction.js";
import { findCategoryGroup } from "../utils/categories.js";
import { getMonthRange } from "../utils/formatting.js";

export interface MonthSummary {
  totalIncome: number;
  totalExpenses: number;
  totalFixed: number;
  totalNeeds: number;
  totalWants: number;
  totalSavings: number;
  balance: number;
  transactionCount: number;
  categoryBreakdown: Array<{ category: string; amount: number; group: string }>;
}

export async function getMonthSummary(userId: string | string[], date?: Date): Promise<MonthSummary> {
  const transactions = await getMonthlyTransactions(userId, date);

  let totalIncome = 0;
  let totalExpenses = 0;
  let totalFixed = 0;
  let totalNeeds = 0;
  let totalWants = 0;
  let totalSavings = 0;
  const categoryMap = new Map<string, number>();

  for (const t of transactions) {
    if (t.type === "income") {
      totalIncome += t.amount;
    } else {
      totalExpenses += t.amount;
      const group = findCategoryGroup(t.category);
      if (group === "fixed") totalFixed += t.amount;
      else if (group === "needs") totalNeeds += t.amount;
      else if (group === "wants") totalWants += t.amount;
      else if (group === "savings") totalSavings += t.amount;
    }
    categoryMap.set(t.category, (categoryMap.get(t.category) ?? 0) + t.amount);
  }

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      group: findCategoryGroup(category) ?? "other",
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalIncome,
    totalExpenses,
    totalFixed,
    totalNeeds,
    totalWants,
    totalSavings,
    balance: totalIncome - totalExpenses,
    transactionCount: transactions.length,
    categoryBreakdown,
  };
}

export async function getComparisonData(userId: string | string[]) {
  const currentMonth = await getMonthSummary(userId);
  const lastMonthTransactions = await getLastMonthTransactions(userId);

  let lastMonthIncome = 0;
  let lastMonthExpenses = 0;
  const lastMonthCategories = new Map<string, number>();

  for (const t of lastMonthTransactions) {
    if (t.type === "income") {
      lastMonthIncome += t.amount;
    } else {
      lastMonthExpenses += t.amount;
      lastMonthCategories.set(t.category, (lastMonthCategories.get(t.category) ?? 0) + t.amount);
    }
  }

  const trends = currentMonth.categoryBreakdown.map((cat) => {
    const lastAmount = lastMonthCategories.get(cat.category) ?? 0;
    let trend: "up" | "down" | "stable" = "stable";
    if (cat.amount > lastAmount * 1.1) trend = "up";
    else if (cat.amount < lastAmount * 0.9) trend = "down";
    return { ...cat, trend, lastMonthAmount: lastAmount };
  });

  return {
    currentMonth,
    lastMonth: {
      totalIncome: lastMonthIncome,
      totalExpenses: lastMonthExpenses,
      balance: lastMonthIncome - lastMonthExpenses,
    },
    trends,
  };
}

export async function getPersonBreakdown(userIds: string[], date?: Date): Promise<Array<{ userId: string; firstName: string; totalExpenses: number }>> {
  const { start, end } = getMonthRange(date);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true },
  });

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: { in: userIds },
      type: "expense",
      date: { gte: start, lte: end },
    },
    select: { userId: true, amount: true },
  });

  const totals = new Map<string, number>();
  for (const t of transactions) {
    totals.set(t.userId, (totals.get(t.userId) ?? 0) + t.amount);
  }

  return users.map((u) => ({
    userId: u.id,
    firstName: u.firstName,
    totalExpenses: totals.get(u.id) ?? 0,
  }));
}

export async function getFixedExpenses(userId: string) {
  return prisma.fixedExpense.findMany({
    where: { userId, isActive: true },
    orderBy: { amount: "desc" },
  });
}

export async function getFixedExpensesTotal(userId: string): Promise<number> {
  const expenses = await getFixedExpenses(userId);
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}
