import { Bot, webhookCallback } from "grammy";
import { createServer } from "node:http";
import { getEnv } from "../utils/env.js";
import { authMiddleware, type AuthContext } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import { startCommand, handleOnboardCallback } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { reportCommand } from "./commands/report.js";
import { setupCommand } from "./commands/setup.js";
import { historyCommand } from "./commands/history.js";
import { undoCommand } from "./commands/undo.js";
import { helpCommand } from "./commands/help.js";
import { clearImportCommand } from "./commands/clearimport.js";
import { familyCommand } from "./commands/family.js";
import { joinCommand } from "./commands/join.js";
import { leaveCommand } from "./commands/leave.js";
import { inviteCommand } from "./commands/invite.js";
import { limitCommand } from "./commands/limit.js";
import { recurringCommand } from "./commands/recurring.js";
import { exportCommand } from "./commands/export.js";
import { chartCommand } from "./commands/chart.js";
import { langCommand, handleLangCallback } from "./commands/lang.js";
import { trashCommand } from "./commands/trash.js";
import { handleTextMessage } from "./handlers/message.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { handlePhotoMessage } from "./handlers/photo.js";
import { handleDocumentMessage, handleFileImportConfirm, handleFileImportReplace, handleFileImportCancel, handleSheetToggle, handleSheetImportGo, setDocumentBotInstance } from "./handlers/document.js";
import { handleTxDeleteCallback, handleTxRestoreCallback, handleTxEditCallback, handleTxEditFieldCallback, handleTxEditCancelCallback } from "./handlers/transaction.js";
import { startScheduler } from "../services/scheduler.js";

const env = getEnv();

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Middleware
bot.use(rateLimitMiddleware);
bot.use(authMiddleware);

// Commands
bot.command("start", (ctx) => startCommand(ctx));
bot.command("status", (ctx) => statusCommand(ctx as AuthContext));
bot.command("report", (ctx) => reportCommand(ctx as AuthContext));
bot.command("setup", (ctx) => setupCommand(ctx as AuthContext));
bot.command("history", (ctx) => historyCommand(ctx as AuthContext));
bot.command("undo", (ctx) => undoCommand(ctx as AuthContext));
bot.command("family", (ctx) => familyCommand(ctx as AuthContext));
bot.command("join", (ctx) => joinCommand(ctx as AuthContext));
bot.command("leave", (ctx) => leaveCommand(ctx as AuthContext));
bot.command("invite", (ctx) => inviteCommand(ctx as AuthContext));
bot.command("limit", (ctx) => limitCommand(ctx as AuthContext));
bot.command("recurring", (ctx) => recurringCommand(ctx as AuthContext));
bot.command("export", (ctx) => exportCommand(ctx as AuthContext));
bot.command("chart", (ctx) => chartCommand(ctx as AuthContext));
bot.command("lang", (ctx) => langCommand(ctx as AuthContext));
bot.command("help", (ctx) => helpCommand(ctx as AuthContext));
bot.command("trash", (ctx) => trashCommand(ctx as AuthContext));
bot.command("clearimport", (ctx) => clearImportCommand(ctx as AuthContext));

// Pass bot instance to document handler for background messaging
setDocumentBotInstance(bot);

// Callback query handlers (inline buttons)
bot.callbackQuery("file_import_confirm", (ctx) => handleFileImportConfirm(ctx as AuthContext));
bot.callbackQuery("file_import_replace", (ctx) => handleFileImportReplace(ctx as AuthContext));
bot.callbackQuery("file_import_cancel", (ctx) => handleFileImportCancel(ctx as AuthContext));
bot.callbackQuery(/^onboard_/, (ctx) => handleOnboardCallback(ctx));
bot.callbackQuery(/^sheet_toggle_/, (ctx) => handleSheetToggle(ctx as AuthContext));
bot.callbackQuery("sheet_import_go", (ctx) => handleSheetImportGo(ctx as AuthContext));
bot.callbackQuery(/^lang_/, (ctx) => handleLangCallback(ctx));
bot.callbackQuery(/^tx_del_/, (ctx) => handleTxDeleteCallback(ctx));
bot.callbackQuery(/^tx_restore_/, (ctx) => handleTxRestoreCallback(ctx));
bot.callbackQuery(/^tx_edit_/, (ctx) => handleTxEditCallback(ctx));
bot.callbackQuery(/^tx_editfield_/, (ctx) => handleTxEditFieldCallback(ctx));
bot.callbackQuery(/^tx_editcancel_/, (ctx) => handleTxEditCancelCallback(ctx));

// Message handlers
bot.on("message:text", (ctx) => handleTextMessage(ctx as AuthContext));
bot.on("message:voice", (ctx) => handleVoiceMessage(ctx as AuthContext));
bot.on("message:photo", (ctx) => handlePhotoMessage(ctx as AuthContext));
bot.on("message:document", (ctx) => handleDocumentMessage(ctx as AuthContext));

// Error handler
bot.catch((err) => {
  console.error("Bot error:", err.error);
  console.error("Update that caused error:", JSON.stringify(err.ctx.update, null, 2));
});

/** Register bot commands with Telegram (shows in the menu) */
async function setBotCommands() {
  // Russian commands
  await bot.api.setMyCommands(
    [
      { command: "status", description: "Сводка за месяц" },
      { command: "chart", description: "Графики расходов" },
      { command: "report", description: "AI-анализ финансов" },
      { command: "history", description: "История (редактировать/удалить)" },
      { command: "trash", description: "Корзина (восстановить)" },
      { command: "limit", description: "Лимиты по категориям" },
      { command: "recurring", description: "Постоянные расходы" },
      { command: "setup", description: "Настройки дохода" },
      { command: "export", description: "Экспорт в Excel" },
      { command: "invite", description: "Пригласить в семью" },
      { command: "family", description: "Участники семьи" },
      { command: "lang", description: "Сменить язык (RU/EN)" },
      { command: "undo", description: "Отменить последнюю запись" },
      { command: "help", description: "Все команды" },
    ],
    { language_code: "ru" }
  );

  // English commands
  await bot.api.setMyCommands(
    [
      { command: "status", description: "Monthly summary" },
      { command: "chart", description: "Expense charts" },
      { command: "report", description: "AI financial analysis" },
      { command: "history", description: "Transactions (edit/delete)" },
      { command: "trash", description: "Trash (restore deleted)" },
      { command: "limit", description: "Category spending limits" },
      { command: "recurring", description: "Fixed expenses" },
      { command: "setup", description: "Income settings" },
      { command: "export", description: "Export to Excel" },
      { command: "invite", description: "Invite to family budget" },
      { command: "family", description: "Family members" },
      { command: "lang", description: "Change language (RU/EN)" },
      { command: "undo", description: "Undo last entry" },
      { command: "help", description: "All commands" },
    ],
    { language_code: "en" }
  );

  // Default commands (fallback)
  await bot.api.setMyCommands([
    { command: "status", description: "Monthly summary / Сводка" },
    { command: "chart", description: "Expense charts / Графики" },
    { command: "report", description: "AI analysis / AI-анализ" },
    { command: "history", description: "Transactions / История" },
    { command: "trash", description: "Trash / Корзина" },
    { command: "limit", description: "Budget limits / Лимиты" },
    { command: "setup", description: "Settings / Настройки" },
    { command: "export", description: "Export to Excel / Экспорт" },
    { command: "invite", description: "Invite family / Пригласить" },
    { command: "lang", description: "Language / Язык (RU/EN)" },
    { command: "undo", description: "Undo / Отменить" },
    { command: "help", description: "All commands / Все команды" },
  ]);

  console.log("Bot commands registered (RU + EN + default)");
}

// Start
async function main() {
  console.log("Starting Finstein bot...");
  startScheduler(bot);

  // Register commands menu
  await setBotCommands();

  if (env.NODE_ENV === "production" && env.WEBHOOK_URL) {
    // Production: webhook mode via HTTP server
    // Increase timeout to 60s to allow for API calls
    const handleUpdate = webhookCallback(bot, "http", {
      timeoutMilliseconds: 55_000,
    });
    const port = parseInt(env.PORT, 10);

    const server = createServer(async (req, res) => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (req.method === "POST" && req.url === "/webhook") {
        try {
          await handleUpdate(req, res);
        } catch (error) {
          console.error("Webhook handling error:", error);
          // ALWAYS return 200 to Telegram — returning 500 causes
          // Telegram to retry the same update in a loop
          if (!res.headersSent) {
            res.writeHead(200);
            res.end();
          }
        }
        return;
      }

      res.writeHead(404);
      res.end();
    });

    // Set webhook URL with Telegram — drop pending updates to clear
    // any stuck retry loops from previous errors
    await bot.api.setWebhook(`${env.WEBHOOK_URL}/webhook`, {
      drop_pending_updates: true,
    });
    console.log(`Webhook set: ${env.WEBHOOK_URL}/webhook (pending updates dropped)`);

    server.listen(port, () => {
      console.log(`Finstein bot running in webhook mode on port ${port}`);
    });
  } else {
    // Development: long polling
    await bot.start();
    console.log("Finstein bot running in polling mode!");
  }
}

main().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
