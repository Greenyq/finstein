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
import { adminCommand } from "./commands/admin.js";
import { handleTextMessage } from "./handlers/message.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { handlePhotoMessage } from "./handlers/photo.js";
import { handleDocumentMessage, handleFileImportConfirm, handleFileImportReplace, handleFileImportCancel, handleSheetToggle, handleSheetImportGo, setDocumentBotInstance } from "./handlers/document.js";
import { handleTxDeleteCallback, handleTxRestoreCallback, handleTxEditCallback, handleTxEditFieldCallback, handleTxEditCancelCallback } from "./handlers/transaction.js";
import { startScheduler } from "../services/scheduler.js";
import { formatApiError } from "../utils/anthropic.js";

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
bot.command("admin", (ctx) => adminCommand(ctx));

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
  console.error("Bot error:", formatApiError(err.error));
  console.error("Update that caused error:", JSON.stringify(err.ctx.update, null, 2));
});

/** Register bot commands with Telegram (shows in the menu) */
async function setBotCommands() {
  // Russian commands — compact menu, rest accessible via /help
  await bot.api.setMyCommands(
    [
      { command: "status", description: "Сводка за месяц" },
      { command: "history", description: "Записи (редактировать/удалить)" },
      { command: "chart", description: "Графики расходов" },
      { command: "report", description: "AI-анализ финансов" },
      { command: "undo", description: "Отменить последнюю запись" },
      { command: "export", description: "Экспорт в Excel" },
      { command: "setup", description: "Настройки" },
      { command: "help", description: "Все команды" },
    ],
    { language_code: "ru" }
  );

  // English commands — compact menu
  await bot.api.setMyCommands(
    [
      { command: "status", description: "Monthly summary" },
      { command: "history", description: "Transactions (edit/delete)" },
      { command: "chart", description: "Expense charts" },
      { command: "report", description: "AI financial analysis" },
      { command: "undo", description: "Undo last entry" },
      { command: "export", description: "Export to Excel" },
      { command: "setup", description: "Settings" },
      { command: "help", description: "All commands" },
    ],
    { language_code: "en" }
  );

  // Default commands (fallback) — compact menu
  await bot.api.setMyCommands([
    { command: "status", description: "Monthly summary / Сводка" },
    { command: "history", description: "Transactions / Записи" },
    { command: "chart", description: "Expense charts / Графики" },
    { command: "report", description: "AI analysis / AI-анализ" },
    { command: "undo", description: "Undo / Отменить" },
    { command: "export", description: "Export / Экспорт" },
    { command: "setup", description: "Settings / Настройки" },
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
      if ((req.method === "GET" || req.method === "HEAD") && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (req.method === "GET") res.end(JSON.stringify({ status: "ok" }));
        else res.end();
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
