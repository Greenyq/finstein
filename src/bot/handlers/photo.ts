import type { AuthContext } from "../middleware/auth.js";

export async function handlePhotoMessage(ctx: AuthContext): Promise<void> {
  await ctx.reply(
    "Receipt scanning is coming soon! For now, please type your expense manually.\n" +
      '_Example: "groceries 87.50 at Superstore"_',
    { parse_mode: "Markdown" }
  );
}
