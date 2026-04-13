import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "./env.js";

/**
 * Per-call SDK timeout. Each individual Anthropic API attempt is capped here
 * so retries still fit inside Telegram's 55-second webhook window.
 *
 * Budget:  20s (call 1) + 4s (delay) + 20s (call 2) = 44s  ← within 55s
 */
const CALL_TIMEOUT_MS = 20_000;

/**
 * One retry per error type with a short delay.
 * Keeping the total under the 55-second Telegram webhook timeout is critical.
 *   529 overloaded : 1 retry after 4 s  → max  44 s
 *   429 rate limit : 2 retries at 2 s / 6 s → max  48 s
 */
const DELAY_MS: Record<number, number[]> = {
  529: [4_000],
  429: [2_000, 6_000],
};

const RETRYABLE_STATUS = new Set(Object.keys(DELAY_MS).map(Number));

/** Flatten an Anthropic APIError (or any error) into a plain loggable object. */
export function formatApiError(err: unknown): Record<string, unknown> {
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { type?: string; error?: { type?: string; message?: string } } | null | undefined;
    return {
      status: err.status,
      error_type: body?.error?.type ?? body?.type,
      error_message: body?.error?.message ?? err.message,
      request_id: err.requestID,
    };
  }
  return { message: err instanceof Error ? err.message : String(err) };
}

/**
 * Wrapper around client.messages.create() with:
 * - Per-call timeout (CALL_TIMEOUT_MS) so a slow/hung request doesn't eat the whole budget
 * - Automatic retry on 529/429 with delays chosen to stay under the 55-second webhook limit
 * - SDK's own retries disabled (maxRetries: 0) to avoid hidden double-retrying
 */
export async function createMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const client = new Anthropic({
    apiKey: getEnv().ANTHROPIC_API_KEY,
    maxRetries: 0,       // our wrapper is the single source of retry logic
    timeout: CALL_TIMEOUT_MS,
  });

  let attempt = 0;

  while (true) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      const apiErr = err instanceof Anthropic.APIError ? err : undefined;
      const status = apiErr?.status ?? 0;
      const delays = DELAY_MS[status];
      const isRetryable = RETRYABLE_STATUS.has(status) && delays !== undefined && attempt < delays.length;

      if (isRetryable) {
        const delay = delays[attempt]!;
        console.warn(
          `Anthropic API ${status} (attempt ${attempt + 1}/${delays.length + 1}), retrying in ${delay / 1000}s...`,
          formatApiError(err),
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      console.error("Anthropic API error (giving up):", formatApiError(err));
      throw err;
    }
  }
}
