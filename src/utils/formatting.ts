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

export function getTodayRange(timezone = "America/Winnipeg", referenceDate = new Date()): { start: Date; end: Date } {
  const localDateStr = getTodayStringInTimezone(timezone, referenceDate);

  // Calculate the UTC offset for this timezone at the reference time
  const utcMs = new Date(referenceDate.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const tzMs = new Date(referenceDate.toLocaleString("en-US", { timeZone: timezone })).getTime();
  const offsetMs = utcMs - tzMs; // positive = timezone is behind UTC (e.g. UTC-6 → +21600000)

  // Parse as UTC dates, then shift by the offset to get the true UTC boundaries for that local day
  const localMidnight = new Date(`${localDateStr}T00:00:00.000Z`);
  const localEndOfDay = new Date(`${localDateStr}T23:59:59.999Z`);

  return {
    start: new Date(localMidnight.getTime() + offsetMs),
    end: new Date(localEndOfDay.getTime() + offsetMs),
  };
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
