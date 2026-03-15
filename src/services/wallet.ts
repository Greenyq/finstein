import { prisma } from "../db/prisma.js";

export async function upsertWalletAccount(
  userId: string,
  name: string,
  balance: number,
) {
  return prisma.walletAccount.upsert({
    where: { userId_name: { userId, name } },
    update: { balance },
    create: { userId, name, balance },
  });
}

export async function getWalletAccounts(userId: string | string[]) {
  const userFilter = Array.isArray(userId) ? { in: userId } : userId;
  return prisma.walletAccount.findMany({
    where: { userId: userFilter },
    orderBy: { balance: "desc" },
  });
}
