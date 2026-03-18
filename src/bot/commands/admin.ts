import type { Context } from "grammy";
import { prisma } from "../../db/prisma.js";
import { getEnv } from "../../utils/env.js";

function isAdmin(telegramId: bigint): boolean {
  const { ADMIN_IDS } = getEnv();
  if (!ADMIN_IDS) return false;
  const ids = ADMIN_IDS.split(",").map((id) => id.trim());
  return ids.includes(telegramId.toString());
}

export async function adminCommand(ctx: Context): Promise<void> {
  if (!ctx.from) return;

  const telegramId = BigInt(ctx.from.id);
  if (!isAdmin(telegramId)) {
    await ctx.reply("❌ Access denied.");
    return;
  }

  const now = new Date();
  const startOf30Days = new Date(now);
  startOf30Days.setDate(now.getDate() - 30);
  const startOf7Days = new Date(now);
  startOf7Days.setDate(now.getDate() - 7);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [total, premium, onTrial, newToday, newLast7, newLast30, families] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isPremium: true } }),
      prisma.user.count({ where: { trialEndsAt: { gt: now } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.user.count({ where: { createdAt: { gte: startOf7Days } } }),
      prisma.user.count({ where: { createdAt: { gte: startOf30Days } } }),
      prisma.user.count({ where: { familyId: { not: null } } }),
    ]);

  const message = [
    `📊 *Admin Stats*`,
    ``,
    `👥 Total users: *${total}*`,
    `💎 Premium: *${premium}*`,
    `⏳ On trial: *${onTrial}*`,
    `👨‍👩‍👧‍👦 In families: *${families}*`,
    ``,
    `📅 New today: *${newToday}*`,
    `📅 New last 7 days: *${newLast7}*`,
    `📅 New last 30 days: *${newLast30}*`,
  ].join("\n");

  await ctx.reply(message, { parse_mode: "Markdown" });
}
