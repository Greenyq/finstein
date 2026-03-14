import { describe, it, expect } from "vitest";
import { formatCurrency, getMonthRange } from "../utils/formatting.js";

describe("Formatting", () => {
  it("should format currency in CAD", () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain("1,234.56");
  });

  it("should format zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0.00");
  });

  it("should return correct month range", () => {
    const date = new Date(2026, 2, 15); // March 15, 2026
    const { start, end } = getMonthRange(date);
    expect(start.getMonth()).toBe(2);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(2);
    expect(end.getDate()).toBe(31);
  });
});
