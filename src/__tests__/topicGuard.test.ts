import { describe, it, expect } from "vitest";
import { isLikelyFinancial } from "../utils/topicGuard.js";

describe("Topic Guard", () => {
  describe("should ACCEPT financial messages", () => {
    const financialMessages = [
      "spent 45 on groceries",
      "got paycheck 2180",
      "restaurant 35",
      "потратил 500 на продукты",
      "зарплата 85000",
      "coffee 5.50",
      "uber 12",
      "rent 1200",
      "paid mortgage 1800",
      "earned 150 from freelance",
      "газ 45",
      "$100 groceries",
      "bought shoes 89",
      "TFSA 500",
      "subscription 15",
      "tip 10",
      "refund 25",
    ];

    for (const msg of financialMessages) {
      it(`"${msg}"`, () => {
        expect(isLikelyFinancial(msg)).toBe(true);
      });
    }
  });

  describe("should REJECT non-financial messages", () => {
    const nonFinancialMessages = [
      "hello",
      "hi!",
      "привет",
      "how are you?",
      "как дела?",
      "what's up",
      "thanks",
      "ok",
      "lol",
      "haha",
      "yo",
      "",
      "hi",
    ];

    for (const msg of nonFinancialMessages) {
      it(`"${msg}"`, () => {
        expect(isLikelyFinancial(msg)).toBe(false);
      });
    }
  });

  describe("should REJECT coding/off-topic requests", () => {
    const codingMessages = [
      "write code function to sort array",
      "create a python script",
      "help me with javascript code",
      "build an app for me",
    ];

    for (const msg of codingMessages) {
      it(`"${msg}"`, () => {
        expect(isLikelyFinancial(msg)).toBe(false);
      });
    }
  });

  describe("edge cases", () => {
    it("short message with number should pass", () => {
      expect(isLikelyFinancial("50")).toBe(true);
    });

    it("very short non-number message should fail", () => {
      expect(isLikelyFinancial("ab")).toBe(false);
    });

    it("message with currency symbol should pass", () => {
      expect(isLikelyFinancial("$50 lunch")).toBe(true);
    });

    it("question about spending should pass", () => {
      expect(isLikelyFinancial("how much did I spend on coffee")).toBe(true);
    });
  });
});
