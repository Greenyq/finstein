import type { Context } from "grammy";

export async function helpCommand(ctx: Context): Promise<void> {
  await ctx.reply(
    `*FinAdvisor — Commands*\n\n` +
      `/start — Welcome & onboarding\n` +
      `/status — Current month snapshot\n` +
      `/report — Full AI analysis & recommendations ⭐\n` +
      `/setup — Configure income & fixed expenses\n` +
      `/history — Last 10 transactions\n` +
      `/undo — Remove last transaction\n` +
      `/family — Create family budget & invite code ⭐\n` +
      `/join CODE — Join a family budget\n` +
      `/leave — Leave family budget\n` +
      `/help — Show this message\n\n` +
      `*How to track:*\n` +
      `Just send a message naturally:\n` +
      `• _"spent 45 on groceries"_\n` +
      `• _"got paycheck 2180"_\n` +
      `• _"restaurant 35"_\n` +
      `• Or send a voice message!`,
    { parse_mode: "Markdown" }
  );
}
