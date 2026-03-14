import type { AuthContext } from "../middleware/auth.js";
import { leaveFamily } from "../../services/family.js";

export async function leaveCommand(ctx: AuthContext): Promise<void> {
  const result = await leaveFamily(ctx.dbUser.id);

  if (!result.success) {
    await ctx.reply(result.error!);
    return;
  }

  await ctx.reply("You've left the family budget. Back to personal mode.");
}
