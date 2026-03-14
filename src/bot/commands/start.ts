import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "../../db/prisma.js";

export async function startCommand(ctx: Context): Promise<void> {
  if (!ctx.from) return;

  const telegramId = BigInt(ctx.from.id);

  let user = await prisma.user.findUnique({ where: { telegramId } });
  const isNew = !user;

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        firstName: ctx.from.first_name ?? "User",
      },
    });
  }

  if (isNew) {
    // New user — step-by-step onboarding
    await ctx.reply(
      `Привет, ${user.firstName}! Добро пожаловать в *Finstein* 🎉\n\n` +
        `Я — твой AI финансовый помощник. Помогу отслеживать доходы, расходы и бюджет всей семьи.\n\n` +
        `Вот что я умею:`,
      { parse_mode: "Markdown" }
    );

    await ctx.reply(
      `*1️⃣ Записывать расходы и доходы*\n` +
        `Просто напиши мне сообщение:\n\n` +
        `_"продукты 850"_\n` +
        `_"зарплата 3500"_\n` +
        `_"ресторан 45 долларов"_\n` +
        `_"spent 120 on groceries"_\n\n` +
        `Я понимаю русский и английский, в любом формате.`,
      { parse_mode: "Markdown" }
    );

    await ctx.reply(
      `*2️⃣ Голосовые сообщения и фото*\n` +
        `Отправь голосовое — я распознаю и запишу.\n` +
        `Отправь фото чека — я разберу что на нём.\n\n` +
        `*3️⃣ Импорт из Excel*\n` +
        `Отправь файл .xlsx или .csv — я найду все транзакции и добавлю в базу.\n\n` +
        `*4️⃣ Семейный бюджет*\n` +
        `Команда /invite — пригласи семью. Все траты в одном месте.`,
      { parse_mode: "Markdown" }
    );

    const keyboard = new InlineKeyboard()
      .text("📝 Записать расход", "onboard_expense")
      .text("💰 Записать доход", "onboard_income")
      .row()
      .text("⚙️ Настройки", "onboard_setup")
      .text("📖 Все команды", "onboard_help");

    await ctx.reply(
      `🎁 *У тебя 7 дней бесплатного доступа* ко всем функциям!\n\n` +
        `Начни прямо сейчас — просто напиши мне свой первый расход, например:\n` +
        `_"кофе 5"_`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  } else {
    // Returning user
    await ctx.reply(
      `С возвращением, ${user.firstName}! 👋\n\n` +
        `Просто отправь мне расход или доход.\n\n` +
        `/status — сводка за месяц\n` +
        `/report — AI-анализ финансов\n` +
        `/help — все команды`,
      { parse_mode: "Markdown" }
    );
  }
}

export async function handleOnboardCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  switch (data) {
    case "onboard_expense":
      await ctx.reply(
        `Просто напиши расход в чат, например:\n\n` +
          `_"продукты 850"_\n` +
          `_"такси 15"_\n` +
          `_"ресторан пицца 35"_\n\n` +
          `Я пойму и запишу автоматически.`,
        { parse_mode: "Markdown" }
      );
      break;
    case "onboard_income":
      await ctx.reply(
        `Напиши доход, например:\n\n` +
          `_"зарплата 3500"_\n` +
          `_"paycheck 2180"_\n` +
          `_"фриланс 500"_`,
        { parse_mode: "Markdown" }
      );
      break;
    case "onboard_setup":
      await ctx.reply(
        `Используй /setup чтобы настроить:\n` +
          `• Ежемесячный доход\n` +
          `• Постоянные расходы (ипотека, подписки)\n\n` +
          `Или /limit чтобы задать лимиты по категориям.`,
        { parse_mode: "Markdown" }
      );
      break;
    case "onboard_help":
      await ctx.reply(
        `*Все команды:*\n\n` +
          `/status — сводка за месяц\n` +
          `/report — AI-анализ и рекомендации\n` +
          `/history — последние транзакции\n` +
          `/limit — лимиты по категориям\n` +
          `/export — экспорт в Excel\n` +
          `/setup — настройки\n` +
          `/invite — пригласить в семью\n` +
          `/undo — отменить последнюю запись\n` +
          `/help — эта справка`,
        { parse_mode: "Markdown" }
      );
      break;
  }
}
