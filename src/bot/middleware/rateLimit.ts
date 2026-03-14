import type { Context, NextFunction } from "grammy";

const userMessageCounts = new Map<number, { count: number; resetAt: number }>();

const MAX_MESSAGES_PER_HOUR = 30;

export async function rateLimitMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  if (!ctx.from) return;

  const userId = ctx.from.id;
  const now = Date.now();

  let record = userMessageCounts.get(userId);

  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + 60 * 60 * 1000 };
    userMessageCounts.set(userId, record);
  }

  record.count++;

  if (record.count > MAX_MESSAGES_PER_HOUR) {
    await ctx.reply("You've reached the message limit (30/hour). Please try again later.");
    return;
  }

  await next();
}
