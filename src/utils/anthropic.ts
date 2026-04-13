import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "./env.js";

const RETRYABLE_STATUS = new Set([429, 529]);
const MAX_RETRIES = 4;

/**
 * Delay schedule per error type.
 * 529 overloaded: longer waits — server needs time to recover.
 * 429 rate limit: shorter waits — quota window resets faster.
 */
const DELAY_MS: Record<number, number[]> = {
  529: [5_000, 15_000, 45_000, 90_000],
  429: [2_000,  4_000, 10_000, 20_000],
};

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
 * Wrapper around client.messages.create() that automatically retries on
 * transient Anthropic API errors (rate limit / overloaded) with per-status
 * backoff schedules. The Anthropic SDK's own built-in retries are disabled
 * (maxRetries: 0) so our logic is the single source of truth.
 */
export async function createMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const client = new Anthropic({
    apiKey: getEnv().ANTHROPIC_API_KEY,
    maxRetries: 0, // disable SDK retries — handled here
  });

  let attempt = 0;

  while (true) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      const apiErr = err instanceof Anthropic.APIError ? err : undefined;
      const status = apiErr?.status ?? 0;
      const delays = DELAY_MS[status];
      const isRetryable = RETRYABLE_STATUS.has(status) && delays !== undefined;

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = delays[attempt]!;
        console.warn(
          `Anthropic API ${status} (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay / 1000}s...`,
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
