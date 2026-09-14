import type { AutomationRequest, CallEResponse, DedupeLookup, DedupeRecord } from './types.js';

export const DEFAULT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

export function normalizePhoneDigits(phone: string): string {
  return String(phone ?? '').replace(/\D/g, '');
}

export function requestIdempotencyKey(requestId: string): string {
  return `call-aunty:${requestId}`;
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function contactWindowKey(phone: string, intent: string, now = Date.now()): string {
  return `contact:${normalizePhoneDigits(phone)}:${intent}:${utcDay(now)}`;
}

export function requestStoreKey(requestId: string): string {
  return `req:${requestId}`;
}

export class DedupeStore {
  private readonly records = new Map<string, DedupeRecord>();

  constructor(private readonly ttlMs = DEFAULT_DEDUPE_TTL_MS) {}

  lookup(req: AutomationRequest, now = Date.now()): DedupeLookup {
    this.prune(now);
    const requestKey = requestStoreKey(req.requestId);
    const windowKey = contactWindowKey(req.contact.phone, req.intent, now);
    const byRequest = this.records.get(requestKey);
    if (byRequest) {
      return { duplicate: true, kind: 'idempotency', existing: byRequest, requestKey, contactWindowKey: windowKey };
    }
    const byContact = this.records.get(windowKey);
    if (byContact) {
      return { duplicate: true, kind: 'contact_window', existing: byContact, requestKey, contactWindowKey: windowKey };
    }
    return { duplicate: false, requestKey, contactWindowKey: windowKey };
  }

  reserve(req: AutomationRequest, now = Date.now()): DedupeLookup {
    const lookup = this.lookup(req, now);
    if (lookup.duplicate) return lookup;
    const pending = this.record(lookup.requestKey, 'idempotency', req.requestId, 'pending', now);
    this.records.set(lookup.requestKey, pending);
    this.records.set(lookup.contactWindowKey, { ...pending, key: lookup.contactWindowKey, kind: 'contact_window' });
    return lookup;
  }

  remember(req: AutomationRequest, call: CallEResponse, now = Date.now()): void {
    this.prune(now);
    const requestKey = requestStoreKey(req.requestId);
    const windowKey = contactWindowKey(req.contact.phone, req.intent, now);
    const completed = this.record(requestKey, 'idempotency', req.requestId, 'completed', now, call.callId);
    this.records.set(requestKey, completed);
    this.records.set(windowKey, { ...completed, key: windowKey, kind: 'contact_window' });
  }

  release(req: AutomationRequest, now = Date.now()): void {
    this.prune(now);
    const requestKey = requestStoreKey(req.requestId);
    const windowKey = contactWindowKey(req.contact.phone, req.intent, now);
    if (this.records.get(requestKey)?.status === 'pending') this.records.delete(requestKey);
    const window = this.records.get(windowKey);
    if (window?.status === 'pending' && window.requestId === req.requestId) this.records.delete(windowKey);
  }

  get(key: string): DedupeRecord | undefined {
    return this.records.get(key);
  }

  prune(now = Date.now()): void {
    for (const [key, record] of this.records) {
      if (Date.parse(record.expiresAt) <= now) this.records.delete(key);
    }
  }

  private record(
    key: string,
    kind: DedupeRecord['kind'],
    requestId: string,
    status: DedupeRecord['status'],
    now: number,
    callId?: string,
  ): DedupeRecord {
    return {
      key,
      kind,
      status,
      requestId,
      callId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
    };
  }
}
