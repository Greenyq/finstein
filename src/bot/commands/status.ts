import type { AuthContext } from "../middleware/auth.js";
import { getMonthSummary } from "../../services/budget.js";
import { formatCurrency } from "../../utils/formatting.js";

export async function statusCommand(ctx: AuthContext): Promise<void> {
  const summary = await getMonthSummary(ctx.dbUser.id);

  const monthName = new Date().toLocaleString("en-CA", { month: "long", year: "numeric" });

  const incomeTarget = ctx.dbUser.monthlyIncome;
  const incomePercent = incomeTarget > 0
    ? Math.round((summary.totalIncome / incomeTarget) * 100)
    : 0;

  let message = `*${monthName} — Status*\n\n`;
  message += `*Income:* ${formatCurrency(summary.totalIncome)}`;
  if (incomeTarget > 0) {
    message += ` / ${formatCurrency(incomeTarget)} (${incomePercent}%)`;
  }
  message += `\n`;
  message += `*Expenses:* ${formatCurrency(summary.totalExpenses)}\n`;
  message += `*Balance:* ${formatCurrency(summary.balance)}\n\n`;

  if (summary.totalFixed > 0) message += `Fixed: ${formatCurrency(summary.totalFixed)}\n`;
  if (summary.totalNeeds > 0) message += `Needs: ${formatCurrency(summary.totalNeeds)}\n`;
  if (summary.totalWants > 0) message += `Wants: ${formatCurrency(summary.totalWants)}\n`;
  if (summary.totalSavings > 0) message += `Savings: ${formatCurrency(summary.totalSavings)}\n`;

  if (summary.categoryBreakdown.length > 0) {
    message += `\n*Top categories:*\n`;
    for (const cat of summary.categoryBreakdown.slice(0, 5)) {
      message += `• ${cat.category}: ${formatCurrency(cat.amount)}\n`;
    }
  }

  message += `\n_${summary.transactionCount} transactions this month_`;

  await ctx.reply(message, { parse_mode: "Markdown" });
}
