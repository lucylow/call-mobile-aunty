import type { CallEHttpError, RetryDecision } from './types.js';

export const DEFAULT_MAX_ATTEMPTS = 4;
export const DEFAULT_RETRY_CAP_MS = 8_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryDelayMs(attempt: number, retryAfterMs = 0): number {
  if (retryAfterMs > 0) return Math.min(DEFAULT_RETRY_CAP_MS, retryAfterMs);
  return Math.min(DEFAULT_RETRY_CAP_MS, 500 * 2 ** Math.max(0, attempt - 1));
}

export function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as CallEHttpError).status);
    if (status === 429 || status >= 500) return true;
    if (Number.isFinite(status) && status > 0 && status < 500) return false;
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    return /429|timeout|temporar|network|fetch|econn|aborted|5\d\d/i.test(error.message);
  }
  return false;
}

export function classifyRetry(error: unknown, attempt: number, maxAttempts = DEFAULT_MAX_ATTEMPTS): RetryDecision {
  const retryAfterMs = typeof error === 'object' && error !== null && 'retryAfterMs' in error
    ? Number((error as CallEHttpError).retryAfterMs) || 0
    : 0;
  const retry = attempt < maxAttempts && isRetryableError(error);
  let reason = 'unknown_non_retryable';
  if (error instanceof Error && /401|403|invalid.*token|policy_denied|authorization/i.test(error.message)) {
    reason = 'authorization_or_policy';
  } else if (error instanceof Error && /400|404|409|422|validation/i.test(error.message)) {
    reason = 'validation';
  } else if (isRetryableError(error)) {
    reason = 'transient';
  }
  return {
    retry,
    reason,
    delayMs: retry ? retryDelayMs(attempt, retryAfterMs) : 0,
    attempt,
    maxAttempts,
  };
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: {
    maxAttempts?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const wait = opts.sleep ?? sleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const decision = classifyRetry(error, attempt, maxAttempts);
      if (!decision.retry) throw error;
      await wait(decision.delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
