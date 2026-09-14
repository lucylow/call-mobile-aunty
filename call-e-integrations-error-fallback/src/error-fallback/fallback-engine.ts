export type GateResult = {
  allowed: boolean;
  action: "CONTINUE" | "RETRY" | "RESUME" | "BLOCK" | "ESCALATE";
  reason: string;
};

export interface ErrorContext {
  code: string;
  hasExistingRun: boolean;
  hasConsent: boolean;
  onDnc: boolean;
  attempt: number;
  maxAttempts: number;
}

export function decideFallback(ctx: ErrorContext): GateResult {
  if (ctx.onDnc) return { allowed: false, action: "BLOCK", reason: "DNC policy" };
  if (!ctx.hasConsent) return { allowed: false, action: "BLOCK", reason: "missing consent" };
  if (ctx.code === "DUPLICATE_RUN" || ctx.hasExistingRun) {
    return { allowed: true, action: "RESUME", reason: "resume existing run" };
  }
  if (
    ["NETWORK_TIMEOUT", "PROVIDER_5XX", "RATE_LIMITED", "N8N_EXECUTION_TIMEOUT"].includes(ctx.code) &&
    ctx.attempt < ctx.maxAttempts
  ) {
    return { allowed: true, action: "RETRY", reason: "transient failure" };
  }
  if (["NO_ANSWER", "VOICEMAIL", "CALL_BUSY"].includes(ctx.code)) {
    return { allowed: true, action: "ESCALATE", reason: "contact outcome requires policy-driven follow-up" };
  }
  if (["SURVEY_PARSE_AMBIGUOUS", "SURVEY_ABORTED"].includes(ctx.code)) {
    return { allowed: true, action: "ESCALATE", reason: "survey cannot be safely inferred" };
  }
  if (
    ["INVALID_PHONE", "WEBHOOK_SIGNATURE", "AUTH_INVALID", "DNC_BLOCKED", "CONSENT_MISSING"].includes(
      ctx.code,
    )
  ) {
    return { allowed: false, action: "BLOCK", reason: "safety or configuration failure" };
  }
  return { allowed: false, action: "ESCALATE", reason: "unknown failure" };
}

export function shouldCreateNewCall(ctx: ErrorContext): boolean {
  const d = decideFallback(ctx);
  return d.allowed && d.action === "RETRY" && !ctx.hasExistingRun;
}

export function shouldPollExistingRun(ctx: ErrorContext): boolean {
  return ctx.hasExistingRun || ctx.code === "N8N_EXECUTION_TIMEOUT" || ctx.code === "NETWORK_TIMEOUT";
}
