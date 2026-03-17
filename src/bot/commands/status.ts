import type { AuthContext } from "../middleware/auth.js";
import { getMonthSummary, getPersonBreakdown } from "../../services/budget.js";
import { formatCurrency } from "../../utils/formatting.js";
import { getFamilyMemberIds } from "../../services/family.js";
import type { Lang } from "../../locales/index.js";
import { t } from "../../locales/index.js";

export async function statusCommand(ctx: AuthContext): Promise<void> {
  const lang = (ctx.dbUser.language || "ru") as Lang;
  const memberIds = await getFamilyMemberIds(ctx.dbUser.id);
  const isFamily = memberIds.length > 1;
  const queryIds = isFamily ? memberIds : ctx.dbUser.id;

  const summary = await getMonthSummary(queryIds);

  const monthName = new Date().toLocaleString(lang === "ru" ? "ru-RU" : "en-CA", {
    month: "long",
    year: "numeric",
  });

  const incomeTarget = ctx.dbUser.monthlyIncome;
  const incomePercent = incomeTarget > 0
    ? Math.round((summary.totalIncome / incomeTarget) * 100)
    : 0;

  let message = t("status.title", lang)(monthName);
  if (isFamily) message += ` 👨‍👩‍👧‍👦`;
  message += `\n\n`;
  message += `*${t("status.income", lang)()}:* ${formatCurrency(summary.totalIncome)}`;
  if (incomeTarget > 0) {
    message += ` / ${formatCurrency(incomeTarget)} (${incomePercent}%)`;
  }
  message += `\n`;
  message += `*${t("status.expenses", lang)()}:* ${formatCurrency(summary.totalExpenses)}\n`;
  message += `*${t("status.balance", lang)()}:* ${formatCurrency(summary.balance)}\n\n`;

  if (summary.totalFixed > 0) message += `${t("status.fixed", lang)()}: ${formatCurrency(summary.totalFixed)}\n`;
  if (summary.totalNeeds > 0) message += `${t("status.needs", lang)()}: ${formatCurrency(summary.totalNeeds)}\n`;
  if (summary.totalWants > 0) message += `${t("status.wants", lang)()}: ${formatCurrency(summary.totalWants)}\n`;
  if (summary.totalSavings > 0) message += `${t("status.savings", lang)()}: ${formatCurrency(summary.totalSavings)}\n`;

  // Family per-person breakdown
  if (isFamily) {
    const breakdown = await getPersonBreakdown(memberIds);
    if (breakdown.length > 0) {
      message += `\n*${t("status.by_person", lang)()}:*\n`;
      message += breakdown
        .map((p) => `${p.firstName}: ${formatCurrency(p.totalExpenses)}`)
        .join(" | ");
      message += `\n`;
    }
  }

  if (summary.categoryBreakdown.length > 0) {
    message += `\n*${t("status.top_categories", lang)()}:*\n`;
    for (const cat of summary.categoryBreakdown.slice(0, 5)) {
      message += `• ${cat.category}: ${formatCurrency(cat.amount)}\n`;
    }
  }

  message += `\n_${t("status.transactions_count", lang)(summary.transactionCount)}_`;

  await ctx.reply(message, { parse_mode: "Markdown" });
}
