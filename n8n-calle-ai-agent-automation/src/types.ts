export type Intent =
  | 'survey'
  | 'absence'
  | 'callback'
  | 'reminder'
  | 'follow_up'
  | 'unknown';

export type ConsentStatus = 'granted' | 'pending' | 'revoked' | 'unknown';

export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'timed_out' | 'not_required';

export type DedupeKind = 'idempotency' | 'contact_window';

export interface AutomationRequest {
  requestId: string;
  source: string;
  intent: Intent;
  contact: {
    name: string;
    phone: string;
    externalId?: string;
  };
  consent: ConsentStatus;
  doNotContact?: boolean;
  callingWindow?: { start: string; end: string; timezone: string };
  survey?: { id: string; questions: string[] };
  context?: Record<string, unknown>;
}

export interface AgentPlan {
  requestId: string;
  summary: string;
  checks: string[];
  tools: string[];
  steps: string[];
  sideEffects: string[];
  blocked: boolean;
  blockReason?: string;
  approvalRequired: boolean;
}

export interface ApprovalState {
  required: boolean;
  decision: ApprovalDecision;
  reason: string;
  approvedBy?: string;
  notes?: string;
}

export interface DedupeRecord {
  key: string;
  kind: DedupeKind;
  status: 'pending' | 'completed';
  requestId: string;
  callId?: string;
  createdAt: string;
  expiresAt: string;
}

export interface DedupeLookup {
  duplicate: boolean;
  kind?: DedupeKind;
  existing?: DedupeRecord;
  requestKey: string;
  contactWindowKey: string;
}

export interface RetryDecision {
  retry: boolean;
  reason: string;
  delayMs: number;
  attempt: number;
  maxAttempts: number;
}

export interface CallEResponse {
  callId: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  providerStatus?: string;
  raw?: unknown;
}

export interface CallEHttpError extends Error {
  status: number;
  body: unknown;
  retryAfterMs?: number;
}
