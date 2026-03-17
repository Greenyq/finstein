import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "../../db/prisma.js";
import type { Lang } from "../../locales/index.js";
import { t, detectLang } from "../../locales/index.js";

export async function startCommand(ctx: Context): Promise<void> {
  if (!ctx.from) return;

  const telegramId = BigInt(ctx.from.id);

  let user = await prisma.user.findUnique({ where: { telegramId } });
  const isNew = !user;

  // Detect language from Telegram's language_code or default to ru
  const detectedLang: Lang =
    ctx.from.language_code?.startsWith("ru") ? "ru" :
    ctx.from.language_code?.startsWith("en") ? "en" : "ru";

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        firstName: ctx.from.first_name ?? "User",
        language: detectedLang,
      },
    });
  }

  const lang = (user.language || detectedLang) as Lang;

  if (isNew) {
    // Welcome message
    await ctx.reply(t("start.welcome", lang)(user.firstName), { parse_mode: "Markdown" });

    // Features
    await ctx.reply(t("start.features", lang)(), { parse_mode: "Markdown" });

    // Language selection + quick actions
    const keyboard = new InlineKeyboard()
      .text("📝 " + t("onboard.expense_btn", lang)(), "onboard_expense")
      .text("💰 " + t("onboard.income_btn", lang)(), "onboard_income")
      .row()
      .text("⚙️ " + t("onboard.setup_btn", lang)(), "onboard_setup")
      .text("📖 " + t("onboard.help_btn", lang)(), "onboard_help")
      .row()
      .text("🇷🇺 Русский", "lang_ru")
      .text("🇬🇧 English", "lang_en");

    await ctx.reply(t("start.trial", lang)(), {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    // Returning user
    await ctx.reply(t("start.returning", lang)(user.firstName), { parse_mode: "Markdown" });
  }
}

export async function handleOnboardCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  // Get user language
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  const lang = (user?.language || "ru") as Lang;

  switch (data) {
    case "onboard_expense":
      await ctx.reply(t("onboard.expense", lang)(), { parse_mode: "Markdown" });
      break;
    case "onboard_income":
      await ctx.reply(t("onboard.income", lang)(), { parse_mode: "Markdown" });
      break;
    case "onboard_setup":
      await ctx.reply(t("onboard.setup", lang)(), { parse_mode: "Markdown" });
      break;
    case "onboard_help": {
      const { helpCommand } = await import("./help.js");
      // Create a minimal AuthContext-like object for help
      const authCtx = ctx as Context & { dbUser: { language: string } };
      authCtx.dbUser = { language: lang } as any;
      await helpCommand(authCtx as any);
      break;
    }
  }
}
