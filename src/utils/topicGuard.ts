/**
 * Lightweight pre-filter to reject obviously non-financial messages
 * before they hit the AI parser (saves API tokens).
 *
 * Returns true if the message looks like it COULD be financial.
 * Returns false for obvious off-topic messages.
 *
 * We err on the side of letting ambiguous messages through —
 * the parser will handle those and return "unknown" if needed.
 */

// Keywords that suggest financial context (EN + RU)
const FINANCIAL_PATTERNS = [
  // Numbers with currency or amount context
  /\d+/,                          // any number is a strong financial signal
  /\$|₽|€|£|¥|cad|usd|rub/i,   // currency symbols/codes

  // English financial keywords
  /spent|paid|bought|earned|got|received|income|salary|paycheck|expense|cost|price|rent|mortgage|bill|tip|transfer|refund|save|loan|debt|owe|grocery|groceries|restaurant|gas|fuel|uber|taxi|coffee|subscription|insurance|invest/i,

  // Russian financial keywords
  /потратил|заплатил|купил|получил|зарплата|доход|расход|стоит|цена|аренда|ипотека|счёт|счет|чаевые|перевод|возврат|сбережения|кредит|долг|продукты|ресторан|бензин|такси|кофе|подписка|страховка/i,

  // Category keywords from the bot
  /tfsa|rrsp|mortgage|wifi|cell|condo/i,
];

// Patterns that are clearly NOT financial
const NON_FINANCIAL_PATTERNS = [
  // Programming/coding requests
  /\b(write|create|build|code|function|class|import|export|const|let|var|def|print|console|debug|compile|deploy|api|token|endpoint|server|database|sql|html|css|javascript|python|react|node)\b.*\b(code|function|app|program|script|module|component|service)\b/i,

  // Asking the bot to do non-financial things
  /^(who|what|where|when|why|how|tell me|explain|can you|could you|please help|help me with)\b(?!.*(spend|cost|pay|earn|save|budget|money|income|expense|financial|finance))/i,

  // Greetings without financial context (only if no numbers present)
  /^(hi|hello|hey|привет|здравствуй|хай|ку|хелло|yo|sup|good morning|good evening|добрый день|доброе утро)\s*[!?.]*$/i,

  // Random conversation
  /^(how are you|как дела|что делаешь|what's up|lol|haha|ok|okay|ладно|понятно|спасибо|thanks|thank you)\s*[!?.]*$/i,
];

export function isLikelyFinancial(message: string): boolean {
  const trimmed = message.trim();

  // Very short messages without numbers are likely not financial
  if (trimmed.length < 2) return false;

  // If message has a number, it's very likely financial in this bot context
  if (/\d/.test(trimmed)) return true;

  // Check against non-financial patterns first
  for (const pattern of NON_FINANCIAL_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // Check for financial keywords
  for (const pattern of FINANCIAL_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // Short messages without financial context — reject
  if (trimmed.split(/\s+/).length <= 3) return false;

  // Let ambiguous longer messages through to parser
  return true;
}
