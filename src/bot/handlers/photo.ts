import Anthropic from "@anthropic-ai/sdk";
import { InlineKeyboard } from "grammy";
import type { AuthContext } from "../middleware/auth.js";
import { getEnv } from "../../utils/env.js";
import { createTransaction } from "../../services/transaction.js";
import { formatCurrency, getTodayStringInTimezone } from "../../utils/formatting.js";
import { clearReportCache } from "../commands/report.js";
import { checkBudgetLimits } from "../commands/limit.js";
import type { Lang } from "../../locales/index.js";
import { CATEGORIES } from "../../utils/categories.js";

interface ReceiptParseResult {
  found: boolean;
  totalAmount?: number;
  storeName?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  date?: string;
}

async function parseReceiptImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  today: string
): Promise<ReceiptParseResult> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `You are a receipt scanner for a personal finance app. Analyze this receipt image and extract transaction data.

Return ONLY valid JSON, no explanation.

If this is a receipt/invoice with a readable total:
{
  "found": true,
  "totalAmount": number (the final total paid — after tax, after discounts),
  "storeName": string (store or merchant name),
  "category": string (one of the available categories below),
  "subcategory": string (store name),
  "description": string (brief, e.g. "groceries at Walmart" or "lunch at Tim Hortons"),
  "date": "YYYY-MM-DD" (date shown on receipt, or "${today}" if not visible)
}

If this is NOT a readable receipt or total is unclear:
{ "found": false }

Available expense categories: ${JSON.stringify(CATEGORIES)}

Category selection guide:
- Grocery stores (Walmart, Superstore, Costco, No Frills, etc.) → "Groceries"
- Restaurants, cafes, fast food, food courts → "Restaurant"
- Coffee shops (Tim Hortons, Starbucks, etc.) → "Coffee"
- Gas stations, fuel → "Fuel"
- Pharmacies, medical clinics → "Health"
- Clothing, electronics, general merchandise → "Shopping"
- Entertainment venues, movies, events → "Entertainment"
- Uber, taxi, transit → "Transportation"
- Home improvement, hardware stores → "Other Needs"

Today's date: ${today}`,
          },
        ],
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch?.[0]) return { found: false };

  try {
    return JSON.parse(jsonMatch[0]) as ReceiptParseResult;
  } catch {
    return { found: false };
  }
}

export async function handlePhotoMessage(ctx: AuthContext): Promise<void> {
  const photo = ctx.message?.photo;
  if (!photo || photo.length === 0) return;

  const lang = (ctx.dbUser.language ?? "ru") as Lang;
  const ru = lang === "ru";

  try {
    await ctx.reply(ru ? "🧾 Сканирую чек..." : "🧾 Scanning receipt...");

    // Use the highest resolution version of the photo
    const bestPhoto = photo[photo.length - 1]!;
    const file = await ctx.api.getFile(bestPhoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download photo: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString("base64");

    const ext = file.file_path?.split(".").pop()?.toLowerCase() ?? "jpg";
    const mediaType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

    const timezone = ctx.dbUser.timezone ?? "America/Winnipeg";
    const messageDate = new Date(
      (ctx.message?.date ?? Math.floor(Date.now() / 1000)) * 1000
    );
    const today = getTodayStringInTimezone(timezone, messageDate);

    const result = await parseReceiptImage(base64, mediaType, today);

    if (!result.found || !result.totalAmount) {
      await ctx.reply(
        ru
          ? "Не смог распознать чек. Попробуй сфотографировать чётче или введи сумму вручную.\n_Пример: «продукты 87.50»_"
          : "Couldn't read the receipt. Try a clearer photo or enter the amount manually.\n_Example: \"groceries 87.50\"_",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const txDate =
      result.date && result.date !== today
        ? new Date(`${result.date}T12:00:00.000Z`)
        : messageDate;

    const category = result.category ?? "Shopping";
    const tx = await createTransaction({
      userId: ctx.dbUser.id,
      type: "expense",
      amount: result.totalAmount,
      category,
      subcategory: result.subcategory ?? result.storeName ?? undefined,
      description:
        result.description ??
        (result.storeName ? `purchase at ${result.storeName}` : "receipt"),
      authorName: ctx.dbUser.firstName,
      date: txDate,
      rawMessage: "[receipt scan]",
    });

    clearReportCache(ctx.dbUser.id);

    const formattedDate = txDate.toLocaleDateString(
      ru ? "ru-RU" : "en-CA",
      { day: "numeric", month: "long" }
    );

    let reply =
      `✅ ${ru ? "Записано с чека" : "Receipt recorded"}: ` +
      `*${formatCurrency(result.totalAmount)}* — ${category}\n` +
      `_${result.description ?? result.storeName ?? ""}_\n` +
      formattedDate;

    const warning = await checkBudgetLimits(
      ctx.dbUser.id,
      category,
      result.totalAmount
    );
    if (warning) reply += `\n\n${warning}`;

    const keyboard = new InlineKeyboard().text(
      ru ? "🗑 Удалить" : "🗑 Delete",
      `tx_del_${tx.id}`
    );

    await ctx.reply(reply, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    console.error("Photo handling failed:", {
      userId: ctx.dbUser.id,
      error,
    });
    await ctx.reply(
      ru
        ? "Не удалось обработать фото. Попробуй ввести сумму вручную."
        : "Failed to process photo. Please enter the amount manually."
    );
  }
}
