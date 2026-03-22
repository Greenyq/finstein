import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../utils/env.js";

function getResponderPrompt(ru: boolean): string {
  return `You are Finstein, a smart family finance assistant on Telegram.

Your job: answer the user's question about their finances using the provided transaction data.

IMPORTANT — ABOUT EDITING/DELETING:
- In this context, you are answering a QUESTION — you are not performing edits or deletes yourself.
- The bot CAN and DOES edit/delete transactions when users write clear commands.
- If the user's message looks like an edit/delete request that ended up here, tell them to rephrase more clearly:
  ${ru
    ? `"Чтобы изменить, напиши например: _\\"измени 78 на 58\\"_ или _\\"удали запись shoppers\\"_\nТакже можно через /history — кнопки ✏️ и 🗑"`
    : `"To edit, write something like: _\\"change 78 to 58\\"_ or _\\"delete shoppers entry\\"_\nYou can also use /history — tap ✏️ or 🗑 buttons"`}
- NEVER say "I can't modify records" or "I can't edit" — the bot CAN, just not through this conversation path.
- NEVER pretend you performed an action (like "Done!", "Updated!") — you didn't, you're only answering questions here.

Rules:
- Be concise and direct — this is a chat, not a report
- Use specific numbers from the data
- ${ru ? "Answer in Russian" : "Answer in English"}
- Format for Telegram Markdown: *bold* for amounts, bullet points for lists
- Keep response under 200 words
- If the user asks what they spent most/least on, rank categories
- If the user asks about balance (plus/minus), calculate income - expenses
- If the user makes a conversational comment (not a question), acknowledge it briefly and helpfully
- If the user asks about a specific person's spending/income, use authorName to filter
- If the user asks what they spent on in a category, show subcategories and descriptions
- Never invent data — only use what's provided
- Use $ for currency`;
}

interface TransactionData {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  transactionCount: number;
  categoryBreakdown: Array<{ category: string; amount: number }>;
  transactions?: Array<{ type: string; amount: number; category: string; subcategory: string | null; description: string | null; authorName: string | null }>;
  walletAccounts?: Array<{ name: string; balance: number }>;
}

export async function respondToQuery(
  question: string,
  data: TransactionData,
  periodLabel: string,
  ru: boolean,
  todayLabel?: string,
): Promise<string> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: getResponderPrompt(ru),
    messages: [
      {
        role: "user",
        content: `${todayLabel ? `Today's date: ${todayLabel}\n` : ""}Period: ${periodLabel}
Data:
- Total income: $${data.totalIncome.toFixed(2)}
- Total expenses: $${data.totalExpenses.toFixed(2)}
- Balance: $${data.balance.toFixed(2)}
- Transaction count: ${data.transactionCount}
- Categories (expense): ${data.categoryBreakdown
          .filter((c) => c.amount > 0)
          .map((c) => `${c.category}: $${c.amount.toFixed(2)}`)
          .join(", ")}
${data.transactions && data.transactions.length > 0
          ? `- Transactions detail:\n${data.transactions.map((t) => `  ${t.type} $${t.amount.toFixed(2)} [${t.category}${t.subcategory ? `/${t.subcategory}` : ""}]${t.authorName ? ` by ${t.authorName}` : ""}${t.description ? ` — ${t.description}` : ""}`).join("\n")}`
          : ""}
${data.walletAccounts && data.walletAccounts.length > 0
          ? `- Wallet/Accounts:\n${data.walletAccounts.map((a) => `  ${a.name}: $${a.balance.toFixed(2)}`).join("\n")}\n  Total across accounts: $${data.walletAccounts.reduce((s, a) => s + a.balance, 0).toFixed(2)}`
          : ""}

User's question: "${question}"`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  return text || (ru ? "Не удалось сформировать ответ." : "Could not generate a response.");
}
