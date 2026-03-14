import OpenAI from "openai";
import { getEnv } from "../utils/env.js";

export async function transcribeVoice(audioBuffer: Buffer): Promise<string> {
  const env = getEnv();
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const uint8 = new Uint8Array(audioBuffer);
  const file = new File([uint8], "voice.ogg", { type: "audio/ogg" });

  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: "en",
  });

  return transcription.text;
}
