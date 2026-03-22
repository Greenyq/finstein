import type { AuthContext } from "../middleware/auth.js";
import { createFamilyInvite, getFamilyMembers } from "../../services/family.js";
export async function familyCommand(ctx: AuthContext): Promise<void> {
  const members = await getFamilyMembers(ctx.dbUser.id);
  const code = await createFamilyInvite(ctx.dbUser.id);

  let message = `👨‍👩‍👧‍👦 *Family Budget*\n\n`;
  message += `*Invite code:* \`${code}\`\n`;
  message += `_Valid for 24 hours_\n\n`;
  message += `Share this code — the other person uses /join ${code}\n\n`;

  message += `*Members:*\n`;
  for (const m of members) {
    const roleLabel = m.role === "owner" ? " (owner)" : "";
    message += `• ${m.firstName}${roleLabel}\n`;
  }

  await ctx.reply(message, { parse_mode: "Markdown" });
}
