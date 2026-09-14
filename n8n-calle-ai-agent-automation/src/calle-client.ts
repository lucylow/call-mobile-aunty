import type { CallEHttpError, CallEResponse } from './types.js';
import { DEFAULT_MAX_ATTEMPTS, withRetry } from './retry.js';

export interface CallEClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

function httpError(status: number, body: unknown, retryAfterMs?: number): CallEHttpError {
  const error = new Error(`CALL-E ${status}: ${JSON.stringify(body)}`) as CallEHttpError;
  error.status = status;
  error.body = body;
  error.retryAfterMs = retryAfterMs;
  return error;
}

export class CallEClient {
  constructor(private readonly cfg: CallEClientConfig) {}

  async createCall(payload: Record<string, unknown>, idempotencyKey: string): Promise<CallEResponse> {
    return this.request('/v1/calls', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Idempotency-Key': idempotencyKey },
    }) as Promise<CallEResponse>;
  }

  async getCall(callId: string): Promise<CallEResponse> {
    return this.request(`/v1/calls/${encodeURIComponent(callId)}`, { method: 'GET' }) as Promise<CallEResponse>;
  }

  async cancelCall(callId: string): Promise<CallEResponse> {
    return this.request(`/v1/calls/${encodeURIComponent(callId)}`, { method: 'DELETE' }) as Promise<CallEResponse>;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    return withRetry((attempt) => this.requestOnce(path, init, attempt), {
      maxAttempts: this.cfg.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      sleep: this.cfg.sleep,
    });
  }

  private async requestOnce(path: string, init: RequestInit, _attempt: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 15_000);
    try {
      const response = await fetch(new URL(path, this.cfg.baseUrl), {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw httpError(response.status, body, parseRetryAfterMs(response.headers.get('retry-after')));
      }
      return body;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw httpError(0, { error: 'timeout' });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
