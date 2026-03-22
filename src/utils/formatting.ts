export function formatCurrency(amount: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function getMonthRange(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function getLastMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { start, end };
}

/** Get range spanning the last N months (including current month) */
export function getLastNMonthsRange(n: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function getTodayStringInTimezone(timezone: string, referenceDate = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

/** Returns the UTC start/end boundaries for a given local day in a timezone. */
function getDayRange(localDateStr: string, timezone: string, referenceDate: Date): { start: Date; end: Date } {
  const utcMs = new Date(referenceDate.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const tzMs = new Date(referenceDate.toLocaleString("en-US", { timeZone: timezone })).getTime();
  const offsetMs = utcMs - tzMs;
  return {
    start: new Date(new Date(`${localDateStr}T00:00:00.000Z`).getTime() + offsetMs),
    end: new Date(new Date(`${localDateStr}T23:59:59.999Z`).getTime() + offsetMs),
  };
}

export function getTodayRange(timezone = "America/Winnipeg", referenceDate = new Date()): { start: Date; end: Date } {
  const localDateStr = getTodayStringInTimezone(timezone, referenceDate);
  return getDayRange(localDateStr, timezone, referenceDate);
}

export function getYesterdayRange(timezone = "America/Winnipeg", referenceDate = new Date()): { start: Date; end: Date } {
  const yesterday = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
  const localDateStr = getTodayStringInTimezone(timezone, yesterday);
  return getDayRange(localDateStr, timezone, yesterday);
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
