import type { AuthContext } from "../bot/middleware/auth.js";

export function requirePremium(ctx: AuthContext, feature: string): boolean {
  const user = ctx.dbUser;
  if (user.isPremium) return true;
  // Trial check
  if (user.trialEndsAt && new Date() < user.trialEndsAt) return true;
  return false;
}

export function requireFamilyPlan(ctx: AuthContext): boolean {
  const user = ctx.dbUser;
  if (user.familyPlan) return true;
  // Trial includes family features too
  if (user.trialEndsAt && new Date() < user.trialEndsAt) return true;
  return false;
}

export function getTrialDaysLeft(ctx: AuthContext): number {
  const user = ctx.dbUser;
  if (!user.trialEndsAt) return 0;
  const diff = user.trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export async function sendPremiumPrompt(ctx: AuthContext, feature: string): Promise<void> {
  const prices: Record<string, number> = {
    report: 50,
    family: 75,
  };
  const stars = prices[feature] ?? 50;

  await ctx.reply(
    `⭐ *${feature === "family" ? "Family Plan" : "Premium"} Feature*\n\n` +
      `Your free trial has ended.\n` +
      `This feature requires a ${feature === "family" ? "Family plan" : "Premium"} subscription.\n\n` +
      `Unlock with *${stars} Telegram Stars*.\n` +
      `Use /premium to subscribe.`,
    { parse_mode: "Markdown" }
  );
}
