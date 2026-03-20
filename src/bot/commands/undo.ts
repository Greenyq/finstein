import { InlineKeyboard } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import { deleteLastTransaction } from "../../services/transaction.js";
import { formatCurrency } from "../../utils/formatting.js";
import { clearReportCache } from "./report.js";
import type { Lang } from "../../locales/index.js";
import { t } from "../../locales/index.js";

export async function undoCommand(ctx: AuthContext): Promise<void> {
  const lang = (ctx.dbUser.language || "ru") as Lang;
  const deleted = await deleteLastTransaction(ctx.dbUser.id);

  if (!deleted) {
    await ctx.reply(t("undo.empty", lang)());
    return;
  }

  clearReportCache(ctx.dbUser.id);

  const keyboard = new InlineKeyboard().text("↩️ Restore / Восстановить", `tx_restore_${deleted.id}`);
  let reply = t("undo.success", lang)(formatCurrency(deleted.amount), deleted.category);
  if (deleted.description) reply += `\n_${deleted.description}_`;
  await ctx.reply(reply, { parse_mode: "Markdown", reply_markup: keyboard });
}
