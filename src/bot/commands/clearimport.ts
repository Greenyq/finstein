import type { AuthContext } from "../middleware/auth.js";
import { deleteFileImportTransactions } from "../../services/transaction.js";
import { clearReportCache } from "./report.js";

export async function clearImportCommand(ctx: AuthContext): Promise<void> {
  const count = await deleteFileImportTransactions(ctx.dbUser.id);

  if (count === 0) {
    await ctx.reply("No file-imported transactions found.");
    return;
  }

  clearReportCache(ctx.dbUser.id);

  await ctx.reply(
    `🗑 Deleted *${count}* file-imported transactions.\nYou can re-upload your file to import again.`,
    { parse_mode: "Markdown" }
  );
}
