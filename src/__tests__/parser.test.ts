import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env before importing parser
vi.mock("../utils/env.js", () => ({
  getEnv: () => ({
    ANTHROPIC_API_KEY: "test-key",
    TELEGRAM_BOT_TOKEN: "test-token",
    OPENAI_API_KEY: "test-key",
    DATABASE_URL: "file:./test.db",
    NODE_ENV: "test",
    LOG_LEVEL: "info",
  }),
}));

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { parseMessage, type ParsedTransaction, type UnknownMessage } from "../agents/parser.js";

describe("Parser Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse a simple expense", async () => {
    const mockResponse = {
      type: "expense",
      amount: 45,
      category: "Groceries",
      subcategory: null,
      description: "groceries",
      date: "2026-03-14",
      confidence: 0.95,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(mockResponse) }],
    });

    const result = await parseMessage("spent 45 on groceries");
    expect(result.type).toBe("expense");
    expect((result as ParsedTransaction).amount).toBe(45);
    expect((result as ParsedTransaction).category).toBe("Groceries");
  });

  it("should parse income", async () => {
    const mockResponse = {
      type: "income",
      amount: 2180,
      category: "Paycheck",
      subcategory: null,
      description: "paycheck",
      date: "2026-03-14",
      confidence: 0.98,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(mockResponse) }],
    });

    const result = await parseMessage("got paycheck 2180");
    expect(result.type).toBe("income");
    expect((result as ParsedTransaction).amount).toBe(2180);
    expect((result as ParsedTransaction).category).toBe("Paycheck");
  });

  it("should return unknown for unparseable messages", async () => {
    const mockResponse = {
      type: "unknown",
      rawMessage: "what's the weather",
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(mockResponse) }],
    });

    const result = await parseMessage("what's the weather");
    expect(result.type).toBe("unknown");
    expect((result as UnknownMessage).rawMessage).toBe("what's the weather");
  });

  it("should handle low confidence", async () => {
    const mockResponse = {
      type: "expense",
      amount: 35,
      category: "Restaurant",
      subcategory: null,
      description: "restaurant",
      date: "2026-03-14",
      confidence: 0.5,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(mockResponse) }],
    });

    const result = await parseMessage("ресторан 35 баксов");
    expect(result.type).toBe("expense");
    expect((result as ParsedTransaction).confidence).toBe(0.5);
  });

  it("should handle empty API response gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "" }],
    });

    const result = await parseMessage("test");
    expect(result.type).toBe("unknown");
  });
});
