import type { AuthContext } from "../middleware/auth.js";
import { getComparisonData, getFixedExpenses } from "../../services/budget.js";
import { analyzeFinances } from "../../agents/analyzer.js";
import { generateAdvice } from "../../agents/advisor.js";
import { getFamilyMemberIds } from "../../services/family.js";
import type { Lang } from "../../locales/index.js";
import { t } from "../../locales/index.js";

const reportCache = new Map<string, { advice: string; cachedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function reportCommand(ctx: AuthContext): Promise<void> {
  const lang = (ctx.dbUser.language || "ru") as Lang;
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

  await ctx.reply(t("report.analyzing", lang)());

  try {
    const comparison = await getComparisonData(queryIds);
    const fixedExpenses = await getFixedExpenses(queryIds);

    if (comparison.currentMonth.transactionCount === 0) {
      await ctx.reply(t("report.no_data", lang)(), { parse_mode: "Markdown" });
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

    const advice = await generateAdvice(analysis, lang);

    // Cache result
    reportCache.set(cacheKey, { advice, cachedAt: Date.now() });

    await ctx.reply(advice, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Report generation failed:", error);
    await ctx.reply(t("report.error", lang)());
  }
}

export function clearReportCache(userId: string): void {
  reportCache.delete(userId);
  for (const key of reportCache.keys()) {
    if (key.startsWith("family:")) {
      reportCache.delete(key);
    }
  }
}
