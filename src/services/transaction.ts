import { prisma } from "../db/prisma.js";
import { getMonthRange, getLastMonthRange } from "../utils/formatting.js";

interface CreateTransactionInput {
  userId: string;
  type: string;
  amount: number;
  category: string;
  subcategory?: string;
  description?: string;
  date?: Date;
  rawMessage?: string;
}

export async function createTransaction(input: CreateTransactionInput) {
  return prisma.transaction.create({
    data: {
      userId: input.userId,
      type: input.type,
      amount: input.amount,
      category: input.category,
      subcategory: input.subcategory ?? null,
      description: input.description ?? null,
      date: input.date ?? new Date(),
      rawMessage: input.rawMessage ?? null,
    },
  });
}

export async function getMonthlyTransactions(userId: string, date?: Date) {
  const { start, end } = getMonthRange(date);
  return prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lte: end },
    },
    orderBy: { date: "desc" },
  });
}

export async function getLastMonthTransactions(userId: string) {
  const { start, end } = getLastMonthRange();
  return prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lte: end },
    },
    orderBy: { date: "desc" },
  });
}

export async function getRecentTransactions(userId: string, limit = 10) {
  return prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function deleteLastTransaction(userId: string) {
  const last = await prisma.transaction.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return null;
  await prisma.transaction.delete({ where: { id: last.id } });
  return last;
}

export async function getTransactionsByCategory(userId: string, date?: Date) {
  const transactions = await getMonthlyTransactions(userId, date);
  const grouped = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === "expense") {
      grouped.set(t.category, (grouped.get(t.category) ?? 0) + t.amount);
    }
  }
  return Array.from(grouped.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}
