import type { AuthContext } from "../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import * as XLSX from "xlsx";
import { InputFile } from "grammy";

export async function exportCommand(ctx: AuthContext): Promise<void> {
  const transactions = await prisma.transaction.findMany({
    where: { userId: ctx.dbUser.id },
    orderBy: { date: "asc" },
  });

  if (transactions.length === 0) {
    await ctx.reply("Нет транзакций для экспорта. Начните с записи расходов!");
    return;
  }

  // Convert to spreadsheet format
  const rows = transactions.map((t) => ({
    Date: t.date.toISOString().split("T")[0],
    Type: t.type,
    Amount: t.amount,
    Category: t.category,
    Subcategory: t.subcategory ?? "",
    Description: t.description ?? "",
    Author: t.authorName ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws["!cols"] = [
    { wch: 12 }, // Date
    { wch: 8 },  // Type
    { wch: 12 }, // Amount
    { wch: 16 }, // Category
    { wch: 16 }, // Subcategory
    { wch: 30 }, // Description
    { wch: 12 }, // Author
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Transactions");

  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  const date = new Date().toISOString().split("T")[0];
  const fileName = `finstein_export_${date}.xlsx`;

  await ctx.replyWithDocument(new InputFile(buffer, fileName), {
    caption: `📊 Экспорт: *${transactions.length}* транзакций\nФайл: \`${fileName}\``,
    parse_mode: "Markdown",
  });
}
