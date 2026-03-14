import type { AuthContext } from "../middleware/auth.js";
import { transcribeVoice } from "../../services/whisper.js";
import { handleTextMessage } from "./message.js";

export async function handleVoiceMessage(ctx: AuthContext): Promise<void> {
  const voice = ctx.message?.voice;
  if (!voice) return;

  try {
    await ctx.reply("🎤 Processing voice message...");

    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download voice file: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const transcription = await transcribeVoice(buffer);

    if (!transcription.trim()) {
      await ctx.reply("I couldn't understand the voice message. Could you try typing it instead?");
      return;
    }

    await ctx.reply(`_Heard: "${transcription}"_`, { parse_mode: "Markdown" });

    // Inject transcription as text and process
    const fakeCtx = {
      ...ctx,
      message: {
        ...ctx.message,
        text: transcription,
      },
    } as AuthContext;

    await handleTextMessage(fakeCtx);
  } catch (error) {
    console.error("Voice handling failed:", {
      userId: ctx.dbUser.id,
      error,
    });
    await ctx.reply(
      "Sorry, I couldn't process your voice message. Could you type it instead?"
    );
  }
}
