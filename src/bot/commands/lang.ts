import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import type { Lang } from "../../locales/index.js";
import { t } from "../../locales/index.js";

export async function langCommand(ctx: AuthContext): Promise<void> {
  const lang = (ctx.dbUser.language || "ru") as Lang;

  const keyboard = new InlineKeyboard()
    .text(lang === "ru" ? "Русский ✓" : "Русский", "lang_ru")
    .text(lang === "en" ? "English ✓" : "English", "lang_en");

  await ctx.reply(t("lang.choose", lang)(), {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export async function handleLangCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const newLang = data === "lang_ru" ? "ru" : "en";
  const telegramId = BigInt(ctx.from!.id);

  await prisma.user.update({
    where: { telegramId },
    data: { language: newLang },
  });

  await ctx.answerCallbackQuery();

  const msg = newLang === "ru"
    ? "Язык изменён на *Русский* 🇷🇺"
    : "Language changed to *English* 🇬🇧";

  await ctx.editMessageText(msg, { parse_mode: "Markdown" });
}
