import { prisma } from "../db/prisma.js";
import { getMonthRange, getLastMonthRange, getLastNMonthsRange } from "../utils/formatting.js";

/** Base filter to exclude soft-deleted transactions */
const notDeleted = { deletedAt: null };

interface CreateTransactionInput {
  userId: string;
  type: string;
  amount: number;
  category: string;
  subcategory?: string;
  description?: string;
  authorName?: string;
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
      authorName: input.authorName ?? null,
      date: input.date ?? new Date(),
      rawMessage: input.rawMessage ?? null,
    },
  });
}

export async function getMonthlyTransactions(userId: string | string[], date?: Date) {
  const { start, end } = getMonthRange(date);
  const userFilter = Array.isArray(userId) ? { in: userId } : userId;
  return prisma.transaction.findMany({
    where: {
      userId: userFilter,
      date: { gte: start, lte: end },
      ...notDeleted,
    },
    orderBy: { date: "desc" },
  });
}

export async function getLastMonthTransactions(userId: string | string[]) {
  const { start, end } = getLastMonthRange();
  const userFilter = Array.isArray(userId) ? { in: userId } : userId;
  return prisma.transaction.findMany({
    where: {
      userId: userFilter,
      date: { gte: start, lte: end },
      ...notDeleted,
    },
    orderBy: { date: "desc" },
  });
}

export async function getLastNMonthsTransactions(userId: string | string[], months: number) {
  const { start, end } = getLastNMonthsRange(months);
  const userFilter = Array.isArray(userId) ? { in: userId } : userId;
  return prisma.transaction.findMany({
    where: {
      userId: userFilter,
      date: { gte: start, lte: end },
      ...notDeleted,
    },
    orderBy: { date: "desc" },
  });
}

export async function getRecentTransactions(userId: string, limit = 10) {
  return prisma.transaction.findMany({
    where: { userId, ...notDeleted },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function deleteLastTransaction(userId: string) {
  const last = await prisma.transaction.findFirst({
    where: { userId, ...notDeleted },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return null;
  await prisma.transaction.update({
    where: { id: last.id },
    data: { deletedAt: new Date() },
  });
  return last;
}

/** Soft-delete a transaction by ID */
export async function softDeleteTransaction(transactionId: string) {
  return prisma.transaction.update({
    where: { id: transactionId },
    data: { deletedAt: new Date() },
  });
}

/** Restore a soft-deleted transaction */
export async function restoreTransaction(transactionId: string) {
  return prisma.transaction.update({
    where: { id: transactionId },
    data: { deletedAt: null },
  });
}

/** Get a transaction by ID */
export async function getTransactionById(transactionId: string) {
  return prisma.transaction.findUnique({ where: { id: transactionId } });
}

/** Update a transaction's fields */
export async function updateTransaction(
  transactionId: string,
  data: { amount?: number; category?: string; subcategory?: string | null; description?: string | null },
) {
  return prisma.transaction.update({
    where: { id: transactionId },
    data,
  });
}

/** Get recently deleted transactions for a user */
export async function getDeletedTransactions(userId: string, limit = 10) {
  return prisma.transaction.findMany({
    where: { userId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    take: limit,
  });
}

export async function deleteFileImportTransactions(userId: string): Promise<number> {
  const result = await prisma.transaction.deleteMany({
    where: {
      userId,
      rawMessage: { startsWith: "[file import]" },
    },
  });
  return result.count;
}

/** Count file-imported transactions for specific months */
export async function countFileImportsByMonth(
  userId: string,
  months: Array<{ start: Date; end: Date }>
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const { start, end } of months) {
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    const count = await prisma.transaction.count({
      where: {
        userId,
        rawMessage: { startsWith: "[file import]" },
        date: { gte: start, lte: end },
        ...notDeleted,
      },
    });
    if (count > 0) counts.set(key, count);
  }
  return counts;
}

/** Delete file-imported transactions for specific months */
export async function deleteFileImportsByMonth(
  userId: string,
  months: Array<{ start: Date; end: Date }>
): Promise<number> {
  let total = 0;
  for (const { start, end } of months) {
    const result = await prisma.transaction.deleteMany({
      where: {
        userId,
        rawMessage: { startsWith: "[file import]" },
        date: { gte: start, lte: end },
      },
    });
    total += result.count;
  }
  return total;
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
