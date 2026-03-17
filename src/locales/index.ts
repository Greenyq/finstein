export type Lang = "ru" | "en";

const translations = {
  // ─── Welcome / Start ───
  "start.welcome": {
    ru: (name: string) =>
      `Привет, ${name}! Добро пожаловать в *Finstein*\n\nЯ — твой AI финансовый помощник. Помогу отслеживать доходы, расходы и бюджет всей семьи.`,
    en: (name: string) =>
      `Hi ${name}! Welcome to *Finstein*\n\nI'm your AI finance assistant. I'll help you track income, expenses, and your family budget.`,
  },
  "start.features": {
    ru: () =>
      `*Что я умею:*\n\n` +
      `*1. Записывать расходы и доходы*\n` +
      `Просто напиши мне:\n` +
      `_"продукты 850"_  •  _"зарплата 3500"_  •  _"restaurant 45"_\n\n` +
      `*2. Голосовые и фото*\n` +
      `Отправь голосовое или фото чека — я разберу.\n\n` +
      `*3. Импорт из Excel*\n` +
      `Отправь .xlsx или .csv файл.\n\n` +
      `*4. Графики и аналитика*\n` +
      `/chart — визуальные графики расходов\n` +
      `/report — AI-анализ финансов\n\n` +
      `*5. Семейный бюджет*\n` +
      `/invite — пригласи семью, все траты в одном месте.`,
    en: () =>
      `*What I can do:*\n\n` +
      `*1. Record expenses and income*\n` +
      `Just text me:\n` +
      `_"groceries 850"_  •  _"paycheck 3500"_  •  _"restaurant 45"_\n\n` +
      `*2. Voice & photos*\n` +
      `Send a voice message or receipt photo — I'll parse it.\n\n` +
      `*3. Excel import*\n` +
      `Send an .xlsx or .csv file.\n\n` +
      `*4. Charts & analytics*\n` +
      `/chart — visual expense charts\n` +
      `/report — AI financial analysis\n\n` +
      `*5. Family budget*\n` +
      `/invite — invite family, track expenses together.`,
  },
  "start.trial": {
    ru: () =>
      `*7 дней бесплатного доступа* ко всем функциям!\n\nНачни прямо сейчас — напиши расход, например:\n_"кофе 5"_`,
    en: () =>
      `*7-day free trial* with full access!\n\nStart now — text me an expense, e.g.:\n_"coffee 5"_`,
  },
  "start.returning": {
    ru: (name: string) =>
      `С возвращением, ${name}!\n\nПросто отправь расход или доход.\n\n` +
      `/status — сводка за месяц\n` +
      `/chart — графики расходов\n` +
      `/report — AI-анализ финансов\n` +
      `/help — все команды`,
    en: (name: string) =>
      `Welcome back, ${name}!\n\nJust send me an expense or income.\n\n` +
      `/status — monthly summary\n` +
      `/chart — expense charts\n` +
      `/report — AI financial analysis\n` +
      `/help — all commands`,
  },

  // ─── Onboard buttons ───
  "onboard.expense_btn": { ru: () => "Записать расход", en: () => "Record expense" },
  "onboard.income_btn": { ru: () => "Записать доход", en: () => "Record income" },
  "onboard.setup_btn": { ru: () => "Настройки", en: () => "Settings" },
  "onboard.help_btn": { ru: () => "Все команды", en: () => "All commands" },
  "onboard.expense": {
    ru: () =>
      `Просто напиши расход в чат:\n\n_"продукты 850"_\n_"такси 15"_\n_"ресторан пицца 35"_\n\nЯ пойму и запишу автоматически.`,
    en: () =>
      `Just type an expense in the chat:\n\n_"groceries 850"_\n_"taxi 15"_\n_"restaurant pizza 35"_\n\nI'll understand and record it automatically.`,
  },
  "onboard.income": {
    ru: () => `Напиши доход:\n\n_"зарплата 3500"_\n_"paycheck 2180"_\n_"фриланс 500"_`,
    en: () => `Type your income:\n\n_"salary 3500"_\n_"paycheck 2180"_\n_"freelance 500"_`,
  },
  "onboard.setup": {
    ru: () =>
      `Используй /setup чтобы настроить:\n• Ежемесячный доход\n• Постоянные расходы\n\nИли /limit чтобы задать лимиты.`,
    en: () =>
      `Use /setup to configure:\n• Monthly income\n• Fixed expenses\n\nOr /limit to set spending limits.`,
  },

  // ─── Help ───
  "help.title": { ru: () => `*Finstein — Команды*`, en: () => `*Finstein — Commands*` },
  "help.finance": {
    ru: () =>
      `*Финансы:*\n` +
      `/status — сводка за текущий месяц\n` +
      `/chart — графики расходов по категориям\n` +
      `/report — AI-анализ и рекомендации\n` +
      `/history — последние транзакции (редактировать / удалить)\n` +
      `/trash — корзина (восстановить удалённые)\n` +
      `/undo — отменить последнюю запись`,
    en: () =>
      `*Finance:*\n` +
      `/status — current month summary\n` +
      `/chart — expense charts by category\n` +
      `/report — AI analysis & recommendations\n` +
      `/history — recent transactions (edit / delete)\n` +
      `/trash — trash bin (restore deleted)\n` +
      `/undo — undo last entry`,
  },
  "help.budget": {
    ru: () =>
      `*Бюджет:*\n` +
      `/limit — лимиты по категориям\n` +
      `/recurring — автоматические расходы (ипотека, подписки)\n` +
      `/setup — настройки дохода`,
    en: () =>
      `*Budget:*\n` +
      `/limit — category spending limits\n` +
      `/recurring — fixed expenses (mortgage, subscriptions)\n` +
      `/setup — income settings`,
  },
  "help.family": {
    ru: () =>
      `*Семья и данные:*\n` +
      `/invite — пригласить в семейный бюджет\n` +
      `/join CODE — присоединиться к семье\n` +
      `/family — список членов семьи\n` +
      `/leave — выйти из семьи\n` +
      `/export — экспорт в Excel`,
    en: () =>
      `*Family & Data:*\n` +
      `/invite — invite to family budget\n` +
      `/join CODE — join a family\n` +
      `/family — family members list\n` +
      `/leave — leave family\n` +
      `/export — export to Excel`,
  },
  "help.settings": {
    ru: () => `*Настройки:*\n/lang — сменить язык (RU/EN)`,
    en: () => `*Settings:*\n/lang — change language (RU/EN)`,
  },
  "help.howto": {
    ru: () =>
      `*Как записывать:*\n` +
      `Просто напишите сообщение:\n` +
      `• _"продукты 850"_\n` +
      `• _"зарплата 3500"_\n` +
      `• _"restaurant 45"_\n` +
      `• Голосовое сообщение\n` +
      `• Фото чека\n` +
      `• Excel/CSV файл\n\n` +
      `*Редактирование:*\n` +
      `• _"измени последнюю на 50"_\n` +
      `• _"удали запись про shoppers"_\n` +
      `• Или кнопки в /history\n\n` +
      `*Вопросы:*\n` +
      `• _"сколько потратили на продукты?"_\n` +
      `• _"покажи траты за 2 месяца"_`,
    en: () =>
      `*How to record:*\n` +
      `Just send a message:\n` +
      `• _"groceries 850"_\n` +
      `• _"salary 3500"_\n` +
      `• _"restaurant 45"_\n` +
      `• Voice message\n` +
      `• Receipt photo\n` +
      `• Excel/CSV file\n\n` +
      `*Editing:*\n` +
      `• _"change last one to 50"_\n` +
      `• _"delete the groceries entry"_\n` +
      `• Or use buttons in /history\n\n` +
      `*Questions:*\n` +
      `• _"how much spent on groceries?"_\n` +
      `• _"show expenses for 2 months"_`,
  },

  // ─── Status ───
  "status.title": {
    ru: (month: string) => `*${month} — Сводка*`,
    en: (month: string) => `*${month} — Status*`,
  },
  "status.income": { ru: () => "Доходы", en: () => "Income" },
  "status.expenses": { ru: () => "Расходы", en: () => "Expenses" },
  "status.balance": { ru: () => "Баланс", en: () => "Balance" },
  "status.fixed": { ru: () => "Постоянные", en: () => "Fixed" },
  "status.needs": { ru: () => "Необходимое", en: () => "Needs" },
  "status.wants": { ru: () => "Желания", en: () => "Wants" },
  "status.savings": { ru: () => "Накопления", en: () => "Savings" },
  "status.by_person": { ru: () => "По участникам", en: () => "By person" },
  "status.top_categories": { ru: () => "Топ категорий", en: () => "Top categories" },
  "status.transactions_count": {
    ru: (n: number) => `${n} транзакций за этот месяц`,
    en: (n: number) => `${n} transactions this month`,
  },

  // ─── Report ───
  "report.analyzing": {
    ru: () => "Анализирую ваши финансы... Подождите немного.",
    en: () => "Analyzing your finances... This takes a moment.",
  },
  "report.no_data": {
    ru: () =>
      `Нет транзакций за этот месяц. Начните записывать: _"потратил 45 на продукты"_`,
    en: () =>
      `No transactions this month yet. Start tracking: _"spent 45 on groceries"_`,
  },
  "report.error": {
    ru: () => "Не удалось создать отчёт. Попробуйте позже.",
    en: () => "Couldn't generate your report. Please try again later.",
  },

  // ─── Chart ───
  "chart.no_data": {
    ru: () => "Нет расходов за этот месяц для построения графика.",
    en: () => "No expenses this month to build a chart.",
  },
  "chart.title": {
    ru: (month: string) => `Расходы за ${month}`,
    en: (month: string) => `Expenses for ${month}`,
  },
  "chart.generating": {
    ru: () => "Строю график...",
    en: () => "Generating chart...",
  },
  "chart.error": {
    ru: () => "Не удалось построить график. Попробуйте позже.",
    en: () => "Couldn't generate the chart. Please try again later.",
  },

  // ─── Messages ───
  "msg.not_financial": {
    ru: () =>
      `Я ваш финансовый помощник — отправьте расходы или доходы.\n_Например: "потратил 45 на продукты"_\n\n/help — список команд`,
    en: () =>
      `I'm your finance assistant — send me expenses or income.\n_Example: "spent 45 on groceries"_\n\n/help — see all commands`,
  },
  "msg.not_understood": {
    ru: () =>
      `Не понял — попробуйте:\n_"потратил 45 на продукты"_\n_"зарплата 2180"_\n_"ресторан 35"_`,
    en: () =>
      `I didn't catch that — try:\n_"spent 45 on groceries"_\n_"got paycheck 2180"_\n_"restaurant 35"_`,
  },
  "msg.recorded": {
    ru: (amount: string, category: string, date: string) =>
      `Записано: *${amount}* — ${category}\n📅 ${date}`,
    en: (amount: string, category: string, date: string) =>
      `Recorded: *${amount}* — ${category}\n📅 ${date}`,
  },
  "msg.low_confidence": {
    ru: () => "Не совсем уверен. Используйте /undo если ошибка.",
    en: () => "I wasn't fully sure. Use /undo if it's wrong.",
  },
  "msg.error": {
    ru: () => "Произошла ошибка. Попробуйте ещё раз.",
    en: () => "Something went wrong. Please try again.",
  },
  "msg.wallet_updated": {
    ru: (total: string) => `Балансы обновлены:\n\n_Итого: ${total}_`,
    en: (total: string) => `Balances updated:\n\n_Total: ${total}_`,
  },
  "msg.no_transactions": {
    ru: (period: string) => `Нет транзакций за ${period}. Начните с записи расходов!`,
    en: (period: string) => `No transactions for ${period}. Start recording expenses!`,
  },

  // ─── Language ───
  "lang.current": {
    ru: () => "Текущий язык: *Русский*",
    en: () => "Current language: *English*",
  },
  "lang.switched_ru": {
    ru: () => "Язык изменён на *Русский*",
    en: () => "Language changed to *Russian*",  // won't actually show
  },
  "lang.switched_en": {
    ru: () => "Language changed to *English*",  // won't actually show
    en: () => "Language changed to *English*",
  },
  "lang.choose": {
    ru: () => "Выберите язык / Choose language:",
    en: () => "Choose language / Выберите язык:",
  },

  // ─── History ───
  "history.title": { ru: () => "*Последние транзакции:*", en: () => "*Recent transactions:*" },
  "history.empty": {
    ru: () => "Транзакций пока нет. Начните записывать расходы!",
    en: () => "No transactions yet. Start recording expenses!",
  },

  // ─── Undo ───
  "undo.success": {
    ru: (amount: string, category: string) => `Удалено: *${amount}* — ${category}`,
    en: (amount: string, category: string) => `Removed: *${amount}* — ${category}`,
  },
  "undo.empty": {
    ru: () => "Нечего отменять.",
    en: () => "Nothing to undo.",
  },
} as const;

type TranslationKey = keyof typeof translations;

/**
 * Get a translation function by key and language.
 * Usage: t("help.title", "ru")() or t("start.welcome", "en")("John")
 */
export function t<K extends TranslationKey>(
  key: K,
  lang: Lang
): (typeof translations)[K][Lang] {
  return translations[key][lang];
}

/** Detect if text is primarily Russian (has Cyrillic chars) */
export function detectLang(text: string): Lang {
  const cyrillic = text.match(/[\u0400-\u04FF]/g);
  const isCyrillic = !!cyrillic && cyrillic.length > text.replace(/\s/g, "").length * 0.3;
  return isCyrillic ? "ru" : "en";
}
