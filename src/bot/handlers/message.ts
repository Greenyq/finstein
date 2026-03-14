import type { AuthContext } from "../middleware/auth.js";
import { parseMessage } from "../../agents/parser.js";
import { createTransaction } from "../../services/transaction.js";
import { formatCurrency } from "../../utils/formatting.js";
import { handleSetupMessage } from "../commands/setup.js";
import { clearReportCache } from "../commands/report.js";
import { isLikelyFinancial } from "../../utils/topicGuard.js";

export async function handleTextMessage(ctx: AuthContext): Promise<void> {
  const text = ctx.message?.text?.trim();
  if (!text) return;

  // Skip commands
  if (text.startsWith("/")) return;

  // Check if we're in a setup session
  const handled = await handleSetupMessage(ctx);
  if (handled) return;

  // Pre-filter: skip obviously non-financial messages to save API tokens
  if (!isLikelyFinancial(text)) {
    await ctx.reply(
      "I'm your finance assistant — send me expenses or income.\n" +
        '_Example: "spent 45 on groceries"_\n\n' +
        "Use /help to see all commands.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  try {
    const result = await parseMessage(text);

    if (result.type === "unknown") {
      await ctx.reply(
        "I didn't catch that — try something like:\n" +
          '_"spent 45 on groceries"_\n' +
          '_"got paycheck 2180"_\n' +
          '_"restaurant 35"_',
        { parse_mode: "Markdown" }
      );
      return;
    }

    const transaction = await createTransaction({
      userId: ctx.dbUser.id,
      type: result.type,
      amount: result.amount,
      category: result.category,
      subcategory: result.subcategory ?? undefined,
      description: result.description,
      authorName: ctx.dbUser.firstName,
      date: new Date(result.date),
      rawMessage: text,
    });

    // Clear cached report since data changed
    clearReportCache(ctx.dbUser.id);

    const emoji = result.type === "income" ? "💰" : "✅";
    const typeLabel = result.type === "income" ? "Income" : "Expense";

    let reply = `${emoji} Recorded: *${formatCurrency(result.amount)}* — ${result.category}`;
    if (result.description) {
      reply += `\n_${result.description}_`;
    }

    if (result.confidence < 0.7) {
      reply += `\n\n⚠️ I wasn't fully sure about this. Use /undo if it's wrong.`;
    }

    await ctx.reply(reply, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Message handling failed:", {
      userId: ctx.dbUser.id,
      message: text,
      error,
    });
    await ctx.reply(
      "Sorry, something went wrong processing your message. Please try again."
    );
  }
}
