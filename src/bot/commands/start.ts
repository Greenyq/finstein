import type { Context } from "grammy";
import { prisma } from "../../db/prisma.js";

export async function startCommand(ctx: Context): Promise<void> {
  if (!ctx.from) return;

  const telegramId = BigInt(ctx.from.id);

  let user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        firstName: ctx.from.first_name ?? "User",
      },
    });
  }

  await ctx.reply(
    `Welcome to *FinAdvisor*, ${user.firstName}! 🎉\n\n` +
      `I'm your AI-powered financial assistant for Canadian families.\n\n` +
      `*Here's what I can do:*\n` +
      `• Track income & expenses — just tell me naturally\n` +
      `  _"spent 45 on groceries"_ or _"got paycheck 2180"_\n` +
      `• Send voice messages — I understand those too\n` +
      `• Monthly AI-powered financial advice\n\n` +
      `*Commands:*\n` +
      `/status — Current month snapshot\n` +
      `/report — Full AI analysis with recommendations\n` +
      `/setup — Set up fixed expenses & income\n` +
      `/history — Last 10 transactions\n` +
      `/undo — Remove last transaction\n` +
      `/help — Show this message\n\n` +
      `🎁 *You have a 7-day free trial* of all premium features!\n\n` +
      `*Let's start!* Set your monthly income with /setup, or just start tracking by sending a message like _"paycheck 2500"_.`,
    { parse_mode: "Markdown" }
  );
}
