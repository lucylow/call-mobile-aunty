import {
  decideFallback,
  shouldCreateNewCall,
  shouldPollExistingRun,
  type ErrorContext,
} from "./fallback-engine.js";

/** Synthetic 202-555 test numbers only. Never used for live outreach. */
export const CHAOS_PHONE = "+12025550101";

export type ChaosEventKind =
  | "fresh-create"
  | "timeout-retry"
  | "n8n-timeout-retry"
  | "duplicate-run-signal"
  | "provider-5xx-retry"
  | "rate-limit-retry"
  | "webhook-status"
  | "poll-status"
  | "mcp-run-call"
  | "second-n8n-execution";

export interface ChaosEvent {
  kind: ChaosEventKind;
  requestId: string;
  phone: string;
  attempt: number;
  hasConsent: boolean;
  onDnc: boolean;
  code?: string;
}

export type OutboundAction = "CREATE" | "POLL" | "RESUME" | "BLOCK" | "ESCALATE" | "RETRY" | "CONTINUE";

export interface ChaosDispatch {
  action: OutboundAction;
  reason: string;
  runId?: string;
  created: boolean;
}

export interface RunRecord {
  runId: string;
  requestId: string;
  phone: string;
  status: "queued" | "running" | "completed" | "failed";
  createAttempts: number;
}

function record(
  broker: DuplicateCallBroker,
  dispatch: ChaosDispatch,
): ChaosDispatch {
  broker.dispatches.push(dispatch);
  if (dispatch.action === "CREATE") broker.creates += 1;
  else if (dispatch.action === "POLL" || dispatch.action === "RETRY") broker.polls += 1;
  else if (dispatch.action === "RESUME") broker.resumes += 1;
  else if (dispatch.action === "BLOCK") broker.blocks += 1;
  else broker.escalations += 1;
  return dispatch;
}

/**
 * In-memory CALL-E stand-in used by chaos tests.
 *
 * `placeCall` is the happy-path outbound dial. After the first create for a
 * business key, every later arrival must resume/poll that run. Recovery
 * events go through `decideFallback`; a correct client sets `hasExistingRun`
 * whenever a prior create may already have reached CALL-E.
 */
export class DuplicateCallBroker {
  readonly runs = new Map<string, RunRecord>();
  readonly allRuns: RunRecord[] = [];
  readonly dispatches: ChaosDispatch[] = [];
  creates = 0;
  polls = 0;
  resumes = 0;
  blocks = 0;
  escalations = 0;

  constructor(private readonly idPrefix = "mock-run") {}

  reset(): void {
    this.runs.clear();
    this.allRuns.length = 0;
    this.dispatches.length = 0;
    this.creates = 0;
    this.polls = 0;
    this.resumes = 0;
    this.blocks = 0;
    this.escalations = 0;
  }

  existingRun(requestId: string): RunRecord | undefined {
    return this.runs.get(requestId);
  }

  /**
   * Idempotent outbound dial. If a run may already exist, resume it instead
   * of calling `run_call` / POST /v1/calls again.
   */
  placeCall(
    requestId: string,
    phone: string,
    policy: { hasConsent: boolean; onDnc: boolean } = { hasConsent: true, onDnc: false },
  ): ChaosDispatch {
    if (policy.onDnc) {
      return record(this, { action: "BLOCK", reason: "DNC policy", created: false });
    }
    if (!policy.hasConsent) {
      return record(this, { action: "BLOCK", reason: "missing consent", created: false });
    }
    const existing = this.existingRun(requestId);
    if (existing) {
      const ctx: ErrorContext = {
        code: "DUPLICATE_RUN",
        hasExistingRun: true,
        hasConsent: true,
        onDnc: false,
        attempt: existing.createAttempts,
        maxAttempts: 3,
      };
      if (shouldCreateNewCall(ctx)) {
        throw new Error("invariant violated: existing run must not create another call");
      }
      const decision = decideFallback(ctx);
      return record(this, {
        action: "RESUME",
        reason: decision.reason,
        runId: existing.runId,
        created: false,
      });
    }
    return this.insertOutbound(requestId, phone, "initial outbound call");
  }

  /** Unconditional provider create. Models a raw POST /v1/calls or run_call. */
  insertOutbound(requestId: string, phone: string, reason: string): ChaosDispatch {
    const run: RunRecord = {
      runId: `${this.idPrefix}-${requestId}-${this.creates + 1}`,
      requestId,
      phone,
      status: "running",
      createAttempts: 1,
    };
    this.runs.set(requestId, run);
    this.allRuns.push(run);
    return record(this, { action: "CREATE", reason, runId: run.runId, created: true });
  }

  /** Correct recovery: persist in-flight runs so timeouts cannot double-dial. */
  recover(event: ChaosEvent): ChaosDispatch {
    const existing = this.existingRun(event.requestId);
    return this.recoverWith(event, Boolean(existing));
  }

  /**
   * Naive recovery: timeout retries forget that a create may already be in
   * flight. Chaos tests use this only to prove the unsafe path double-dials.
   */
  recoverNaive(event: ChaosEvent): ChaosDispatch {
    const existing = this.existingRun(event.requestId);
    const forgetInflight = event.kind === "timeout-retry" || event.kind === "n8n-timeout-retry";
    return this.recoverWith(event, Boolean(existing) && !forgetInflight);
  }

  dispatch(event: ChaosEvent): ChaosDispatch {
    if (event.kind === "fresh-create") {
      return this.placeCall(event.requestId, event.phone, {
        hasConsent: event.hasConsent,
        onDnc: event.onDnc,
      });
    }
    return this.recover(event);
  }

  dispatchNaive(event: ChaosEvent): ChaosDispatch {
    if (event.kind === "fresh-create") {
      return this.placeCall(event.requestId, event.phone, {
        hasConsent: event.hasConsent,
        onDnc: event.onDnc,
      });
    }
    return this.recoverNaive(event);
  }

  private recoverWith(event: ChaosEvent, hasExistingRun: boolean): ChaosDispatch {
    const ctx: ErrorContext = {
      code: event.code ?? kindToCode(event.kind),
      hasExistingRun,
      hasConsent: event.hasConsent,
      onDnc: event.onDnc,
      attempt: event.attempt,
      maxAttempts: 3,
    };
    const decision = decideFallback(ctx);
    if (!decision.allowed) {
      return record(this, {
        action: "BLOCK",
        reason: decision.reason,
        runId: this.existingRun(event.requestId)?.runId,
        created: false,
      });
    }
    if (shouldCreateNewCall(ctx)) {
      return this.insertOutbound(event.requestId, event.phone, decision.reason);
    }
    const existing = this.existingRun(event.requestId);
    const action: OutboundAction =
      decision.action === "RESUME" ? "RESUME" : shouldPollExistingRun(ctx) ? "POLL" : decision.action;
    return record(this, { action, reason: decision.reason, runId: existing?.runId, created: false });
  }
}

export function kindToCode(kind: ChaosEventKind): string {
  switch (kind) {
    case "fresh-create":
      return "";
    case "timeout-retry":
      return "NETWORK_TIMEOUT";
    case "n8n-timeout-retry":
      return "N8N_EXECUTION_TIMEOUT";
    case "duplicate-run-signal":
      return "DUPLICATE_RUN";
    case "provider-5xx-retry":
      return "PROVIDER_5XX";
    case "rate-limit-retry":
      return "RATE_LIMITED";
    case "webhook-status":
    case "poll-status":
    case "mcp-run-call":
    case "second-n8n-execution":
      return "DUPLICATE_RUN";
  }
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

export function chaosBurst(requestId: string, seed: number, extra = 12): ChaosEvent[] {
  const rand = mulberry32(seed);
  const kinds: ChaosEventKind[] = [
    "timeout-retry",
    "n8n-timeout-retry",
    "duplicate-run-signal",
    "provider-5xx-retry",
    "rate-limit-retry",
    "webhook-status",
    "poll-status",
    "mcp-run-call",
    "second-n8n-execution",
  ];
  const rest: ChaosEvent[] = Array.from({ length: extra }, (_, i) => ({
    kind: kinds[Math.floor(rand() * kinds.length)]!,
    requestId,
    phone: CHAOS_PHONE,
    attempt: i + 1,
    hasConsent: true,
    onDnc: false,
  }));
  return [
    {
      kind: "fresh-create",
      requestId,
      phone: CHAOS_PHONE,
      attempt: 0,
      hasConsent: true,
      onDnc: false,
    },
    ...shuffle(rest, rand),
  ];
}

export function replay(broker: DuplicateCallBroker, events: ChaosEvent[], naive = false): void {
  for (const event of events) {
    if (naive) broker.dispatchNaive(event);
    else broker.dispatch(event);
  }
}

export async function replayConcurrent(
  broker: DuplicateCallBroker,
  events: ChaosEvent[],
  naive = false,
): Promise<void> {
  await Promise.all(
    events.map(async (event, index) => {
      await new Promise((resolve) => setTimeout(resolve, index % 3));
      if (naive) broker.dispatchNaive(event);
      else broker.dispatch(event);
    }),
  );
}

export const ENGINE_INVARIANTS: ErrorContext[] = [
  { code: "DNC_BLOCKED", hasExistingRun: false, hasConsent: true, onDnc: true, attempt: 0, maxAttempts: 3 },
  { code: "NETWORK_TIMEOUT", hasExistingRun: false, hasConsent: false, onDnc: false, attempt: 0, maxAttempts: 3 },
  { code: "DUPLICATE_RUN", hasExistingRun: false, hasConsent: true, onDnc: false, attempt: 1, maxAttempts: 3 },
  { code: "NETWORK_TIMEOUT", hasExistingRun: true, hasConsent: true, onDnc: false, attempt: 1, maxAttempts: 3 },
  { code: "NETWORK_TIMEOUT", hasExistingRun: false, hasConsent: true, onDnc: false, attempt: 1, maxAttempts: 3 },
  { code: "N8N_EXECUTION_TIMEOUT", hasExistingRun: true, hasConsent: true, onDnc: false, attempt: 2, maxAttempts: 3 },
];
