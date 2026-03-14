import { Bot } from "grammy";
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
import { handleTextMessage } from "./handlers/message.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { handlePhotoMessage } from "./handlers/photo.js";
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
bot.command("help", (ctx) => helpCommand(ctx));

// Message handlers
bot.on("message:text", (ctx) => handleTextMessage(ctx as AuthContext));
bot.on("message:voice", (ctx) => handleVoiceMessage(ctx as AuthContext));
bot.on("message:photo", (ctx) => handlePhotoMessage(ctx as AuthContext));

// Error handler
bot.catch((err) => {
  console.error("Bot error:", err.error);
  console.error("Update that caused error:", JSON.stringify(err.ctx.update, null, 2));
});

// Start
async function main() {
  console.log("Starting FinAdvisor bot...");
  startScheduler(bot);
  await bot.start();
  console.log("FinAdvisor bot is running!");
}

main().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
