import type { AuthContext } from "../bot/middleware/auth.js";

export function requirePremium(ctx: AuthContext, feature: string): boolean {
  const user = ctx.dbUser as AuthContext["dbUser"] & { isPremium: boolean };
  return user.isPremium === true;
}

export function requireFamilyPlan(ctx: AuthContext): boolean {
  const user = ctx.dbUser as AuthContext["dbUser"] & { familyPlan: boolean };
  return user.familyPlan === true;
}

export async function sendPremiumPrompt(ctx: AuthContext, feature: string): Promise<void> {
  const prices: Record<string, number> = {
    report: 50,
    family: 75,
  };
  const stars = prices[feature] ?? 50;

  await ctx.reply(
    `⭐ *${feature === "family" ? "Family Plan" : "Premium"} Feature*\n\n` +
      `This feature requires a ${feature === "family" ? "Family plan" : "Premium"} subscription.\n\n` +
      `Unlock with *${stars} Telegram Stars*.\n` +
      `Use /premium to subscribe.`,
    { parse_mode: "Markdown" }
  );
}
