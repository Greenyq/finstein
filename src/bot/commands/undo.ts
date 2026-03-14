import type { AuthContext } from "../middleware/auth.js";
import { deleteLastTransaction } from "../../services/transaction.js";
import { formatCurrency } from "../../utils/formatting.js";
import { clearReportCache } from "./report.js";

export async function undoCommand(ctx: AuthContext): Promise<void> {
  const deleted = await deleteLastTransaction(ctx.dbUser.id);

  if (!deleted) {
    await ctx.reply("No transactions to undo.");
    return;
  }

  clearReportCache(ctx.dbUser.id);

  await ctx.reply(
    `Removed: *${formatCurrency(deleted.amount)}* — ${deleted.category}` +
      (deleted.description ? `\n_${deleted.description}_` : ""),
    { parse_mode: "Markdown" }
  );
}
