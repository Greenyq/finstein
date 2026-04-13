import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "./env.js";

/**
 * HTTP status codes that indicate a transient server-side condition — safe to retry.
 * 429 = rate_limit_error, 529 = overloaded_error
 */
const RETRYABLE_STATUS = new Set([429, 529]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

/** Flatten an Anthropic APIError (or any error) into a plain loggable object. */
export function formatApiError(err: unknown): Record<string, unknown> {
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { type?: string; error?: { type?: string; message?: string } } | null | undefined;
    return {
      status: err.status,
      message: err.message,
      error_type: body?.error?.type ?? body?.type,
      error_message: body?.error?.message,
      request_id: err.requestID,
    };
  }
  return { message: err instanceof Error ? err.message : String(err) };
}

/**
 * Wrapper around client.messages.create() that automatically retries on
 * transient Anthropic API errors (rate limit / overloaded) with exponential backoff.
 */
export async function createMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });
  let attempt = 0;

  while (true) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      const apiErr = err instanceof Anthropic.APIError ? err : undefined;
      const status = apiErr?.status;
      const isRetryable = status !== undefined && RETRYABLE_STATUS.has(status);

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `Anthropic API ${status} (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`,
          formatApiError(err),
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      // Log full error details before re-throwing so they appear in server logs
      console.error("Anthropic API error:", formatApiError(err));
      throw err;
    }
  }
}
