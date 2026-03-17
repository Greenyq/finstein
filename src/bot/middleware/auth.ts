import type { Context, NextFunction } from "grammy";
import { prisma } from "../../db/prisma.js";

export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  if (!ctx.from) return;

  const telegramId = BigInt(ctx.from.id);

  let user = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (!user && ctx.message?.text === "/start") {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);
    user = await prisma.user.create({
      data: {
        telegramId,
        firstName: ctx.from.first_name ?? "User",
        trialEndsAt,
      },
    });
  }

  if (!user) {
    await ctx.reply("Please use /start to set up your account first.");
    return;
  }

  (ctx as Context & { dbUser: typeof user }).dbUser = user;
  await next();
}

export type AuthContext = Context & {
  dbUser: {
    id: string;
    telegramId: bigint;
    firstName: string;
    language: string;
    currency: string;
    timezone: string;
    monthlyIncome: number;
    familyId: string | null;
    role: string;
    isPremium: boolean;
    familyPlan: boolean;
    trialEndsAt: Date | null;
  };
};
