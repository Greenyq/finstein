import type { AuthContext } from "../middleware/auth.js";
import type { Lang } from "../../locales/index.js";
import { t } from "../../locales/index.js";

export async function helpCommand(ctx: AuthContext): Promise<void> {
  const lang = (ctx.dbUser.language || "ru") as Lang;

  const message = [
    t("help.title", lang)(),
    "",
    t("help.finance", lang)(),
    "",
    t("help.budget", lang)(),
    "",
    t("help.family", lang)(),
    "",
    t("help.settings", lang)(),
    "",
    t("help.howto", lang)(),
  ].join("\n");

  await ctx.reply(message, { parse_mode: "Markdown" });
}
