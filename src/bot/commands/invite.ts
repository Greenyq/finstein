import type { AuthContext } from "../middleware/auth.js";
import { createFamilyInvite } from "../../services/family.js";
const BOT_LINK = "https://t.me/finsteinxbot";

export async function inviteCommand(ctx: AuthContext): Promise<void> {
  const code = await createFamilyInvite(ctx.dbUser.id);

  let msg = `👨‍👩‍👧‍👦 *Приглашение в семейный бюджет*\n\n`;
  msg += `Отправьте это сообщение тому, кого хотите добавить:\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Привет! Присоединяйся к нашему семейному бюджету в Finstein.\n\n`;
  msg += `1️⃣ Открой бота: ${BOT_LINK}\n`;
  msg += `2️⃣ Нажми *Start*\n`;
  msg += `3️⃣ Введи команду:\n`;
  msg += `\`/join ${code}\`\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `Код действует *24 часа*.`;

  await ctx.reply(msg, { parse_mode: "Markdown" });
}
