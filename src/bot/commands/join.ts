import type { AuthContext } from "../middleware/auth.js";
import { joinFamily } from "../../services/family.js";

export async function joinCommand(ctx: AuthContext): Promise<void> {
  const text = ctx.message?.text?.trim() ?? "";
  const code = text.split(/\s+/)[1];

  if (!code) {
    await ctx.reply("Usage: /join CODE\n\nExample: /join A1B2C3");
    return;
  }

  const result = await joinFamily(ctx.dbUser.id, code);

  if (!result.success) {
    await ctx.reply(result.error!);
    return;
  }

  await ctx.reply(
    `✅ You joined *${result.ownerName}'s* family budget\\!\n\n` +
      `Your transactions will now be shared with the family\\.`,
    { parse_mode: "MarkdownV2" }
  );
}
