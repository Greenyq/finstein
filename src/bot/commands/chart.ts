import { InputFile } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import { getMonthSummary } from "../../services/budget.js";
import { getFamilyMemberIds } from "../../services/family.js";
import { formatCurrency } from "../../utils/formatting.js";
import type { Lang } from "../../locales/index.js";
import { t } from "../../locales/index.js";

// Pastel color palette for chart segments
const CHART_COLORS = [
  "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF",
  "#FF9F40", "#C9CBCF", "#7BC67E", "#E77C8E", "#55BFC7",
  "#FFB1C1", "#9AD0F5", "#FFE6AA", "#A5DFDF", "#C4B0FF",
];

export async function chartCommand(ctx: AuthContext): Promise<void> {
  const lang = (ctx.dbUser.language || "ru") as Lang;
  const memberIds = await getFamilyMemberIds(ctx.dbUser.id);
  const isFamily = memberIds.length > 1;
  const queryIds = isFamily ? memberIds : ctx.dbUser.id;

  const summary = await getMonthSummary(queryIds);

  // Filter only expense categories
  const expenseCategories = summary.categoryBreakdown.filter(
    (c) => c.group !== "income" && c.amount > 0
  );

  if (expenseCategories.length === 0) {
    await ctx.reply(t("chart.no_data", lang)(), { parse_mode: "Markdown" });
    return;
  }

  const monthName = new Date().toLocaleString(lang === "ru" ? "ru-RU" : "en-CA", {
    month: "long",
    year: "numeric",
  });

  try {
    // Build pie chart
    const pieUrl = buildPieChartUrl(expenseCategories, t("chart.title", lang)(monthName));

    // Build bar chart
    const barUrl = buildBarChartUrl(expenseCategories, t("chart.title", lang)(monthName));

    // Build text summary
    const total = expenseCategories.reduce((s, c) => s + c.amount, 0);
    let caption = `*${t("chart.title", lang)(monthName)}*`;
    if (isFamily) caption += ` (family)`;
    caption += `\n\n`;
    for (const cat of expenseCategories) {
      const pct = Math.round((cat.amount / total) * 100);
      caption += `• ${cat.category}: ${formatCurrency(cat.amount)} (${pct}%)\n`;
    }
    caption += `\n*Total:* ${formatCurrency(total)}`;

    // Send pie chart
    const pieResponse = await fetch(pieUrl);
    if (!pieResponse.ok) throw new Error("Chart API error");
    const pieBuffer = Buffer.from(await pieResponse.arrayBuffer());

    await ctx.replyWithPhoto(new InputFile(pieBuffer, "chart_pie.png"), {
      caption,
      parse_mode: "Markdown",
    });

    // Send bar chart
    const barResponse = await fetch(barUrl);
    if (barResponse.ok) {
      const barBuffer = Buffer.from(await barResponse.arrayBuffer());
      await ctx.replyWithPhoto(new InputFile(barBuffer, "chart_bar.png"));
    }
  } catch (error) {
    console.error("Chart generation failed:", error);
    await ctx.reply(t("chart.error", lang)());
  }
}

function buildPieChartUrl(
  categories: Array<{ category: string; amount: number }>,
  title: string
): string {
  const config = {
    type: "doughnut",
    data: {
      labels: categories.map((c) => c.category),
      datasets: [
        {
          data: categories.map((c) => Math.round(c.amount * 100) / 100),
          backgroundColor: CHART_COLORS.slice(0, categories.length),
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: title, font: { size: 18 } },
        legend: { position: "right", labels: { font: { size: 13 } } },
        datalabels: {
          display: true,
          formatter: (_val: number, ctx: { dataIndex: number; dataset: { data: number[] } }) => {
            const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const pct = Math.round((ctx.dataset.data[ctx.dataIndex]! / total) * 100);
            return pct >= 5 ? `${pct}%` : "";
          },
          color: "#fff",
          font: { weight: "bold", size: 14 },
        },
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&w=700&h=450&bkg=white&f=png`;
}

function buildBarChartUrl(
  categories: Array<{ category: string; amount: number }>,
  title: string
): string {
  const sorted = [...categories].sort((a, b) => b.amount - a.amount);

  const config = {
    type: "bar",
    data: {
      labels: sorted.map((c) => c.category),
      datasets: [
        {
          label: title,
          data: sorted.map((c) => Math.round(c.amount * 100) / 100),
          backgroundColor: CHART_COLORS.slice(0, sorted.length),
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: {
        title: { display: true, text: title, font: { size: 18 } },
        legend: { display: false },
        datalabels: {
          display: true,
          anchor: "end",
          align: "right",
          formatter: (val: number) => `$${val.toFixed(0)}`,
          font: { weight: "bold", size: 12 },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { callback: (v: number) => `$${v}` } },
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&w=700&h=${Math.max(300, sorted.length * 45 + 100)}&bkg=white&f=png`;
}
