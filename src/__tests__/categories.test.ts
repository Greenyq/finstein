import { describe, it, expect } from "vitest";
import { getAllCategories, findCategoryGroup, CATEGORIES } from "../utils/categories.js";

describe("Categories", () => {
  it("should return all categories as flat array", () => {
    const all = getAllCategories();
    expect(all.length).toBeGreaterThan(20);
    expect(all).toContain("Groceries");
    expect(all).toContain("Paycheck");
    expect(all).toContain("TFSA");
  });

  it("should find correct category group", () => {
    expect(findCategoryGroup("Groceries")).toBe("needs");
    expect(findCategoryGroup("Mortgage")).toBe("fixed");
    expect(findCategoryGroup("Restaurant")).toBe("wants");
    expect(findCategoryGroup("Paycheck")).toBe("income");
    expect(findCategoryGroup("TFSA")).toBe("savings");
  });

  it("should return null for unknown category", () => {
    expect(findCategoryGroup("Nonexistent")).toBeNull();
  });
});
