import type { AuthContext } from "../middleware/auth.js";
import { getComparisonData, getFixedExpenses } from "../../services/budget.js";
import { analyzeFinances } from "../../agents/analyzer.js";
import { generateAdvice } from "../../agents/advisor.js";
import { getFamilyMemberIds } from "../../services/family.js";
import { requirePremium, sendPremiumPrompt } from "../../utils/premium.js";

const reportCache = new Map<string, { advice: string; cachedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function reportCommand(ctx: AuthContext): Promise<void> {
  if (!requirePremium(ctx, "report")) {
    await sendPremiumPrompt(ctx, "report");
    return;
  }

  const userId = ctx.dbUser.id;
  const memberIds = await getFamilyMemberIds(userId);
  const isFamily = memberIds.length > 1;
  const queryIds = isFamily ? memberIds : userId;

  // Check cache
  const cacheKey = isFamily ? `family:${ctx.dbUser.familyId}` : userId;
  const cached = reportCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    await ctx.reply(cached.advice, { parse_mode: "Markdown" });
    return;
  }

  await ctx.reply("Analyzing your finances... This takes a moment.");

  try {
    const comparison = await getComparisonData(queryIds);
    const fixedExpenses = await getFixedExpenses(userId);

    if (comparison.currentMonth.transactionCount === 0) {
      await ctx.reply(
        "No transactions recorded this month yet. Start tracking by sending messages like _\"spent 45 on groceries\"_.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const analysis = await analyzeFinances({
      currentMonth: comparison.currentMonth,
      lastMonth: comparison.lastMonth,
      trends: comparison.trends,
      fixedExpenses: fixedExpenses.map((e) => ({
        name: e.name,
        amount: e.amount,
        category: e.category,
      })),
      monthlyIncome: ctx.dbUser.monthlyIncome,
    });

    const advice = await generateAdvice(analysis);

    // Cache result
    reportCache.set(cacheKey, { advice, cachedAt: Date.now() });

    await ctx.reply(advice, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Report generation failed:", error);
    await ctx.reply("Sorry, I couldn't generate your report right now. Please try again later.");
  }
}

export function clearReportCache(userId: string): void {
  // Clear both individual and any family cache entries
  reportCache.delete(userId);
  // Also clear family entries that might contain this user
  for (const key of reportCache.keys()) {
    if (key.startsWith("family:")) {
      reportCache.delete(key);
    }
  }
}
