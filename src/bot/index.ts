import { Bot, webhookCallback } from "grammy";
import { createServer } from "node:http";
import { getEnv } from "../utils/env.js";
import { authMiddleware, type AuthContext } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import { startCommand } from "./commands/start.js";
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
import { handleTextMessage } from "./handlers/message.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { handlePhotoMessage } from "./handlers/photo.js";
import { handleDocumentMessage, handleFileImportConfirm, handleFileImportCancel } from "./handlers/document.js";
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
bot.command("help", (ctx) => helpCommand(ctx));
bot.command("clearimport", (ctx) => clearImportCommand(ctx as AuthContext));

// Callback query handlers (inline buttons)
bot.callbackQuery("file_import_confirm", (ctx) => handleFileImportConfirm(ctx as AuthContext));
bot.callbackQuery("file_import_cancel", (ctx) => handleFileImportCancel(ctx as AuthContext));

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

// Start
async function main() {
  console.log("Starting FinAdvisor bot...");
  startScheduler(bot);

  if (env.NODE_ENV === "production" && env.WEBHOOK_URL) {
    // Production: webhook mode via HTTP server
    const handleUpdate = webhookCallback(bot, "http");
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
          res.writeHead(500);
          res.end();
        }
        return;
      }

      res.writeHead(404);
      res.end();
    });

    // Set webhook URL with Telegram
    await bot.api.setWebhook(`${env.WEBHOOK_URL}/webhook`);
    console.log(`Webhook set: ${env.WEBHOOK_URL}/webhook`);

    server.listen(port, () => {
      console.log(`FinAdvisor bot running in webhook mode on port ${port}`);
    });
  } else {
    // Development: long polling
    await bot.start();
    console.log("FinAdvisor bot running in polling mode!");
  }
}

main().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
