export type ErrorCategory =
  | "configuration"
  | "authorization"
  | "provider"
  | "ai"
  | "schema"
  | "network"
  | "data"
  | "user_cancelled"
  | "policy";

export type UserFacingError = {
  category: ErrorCategory;
  code: string;
  userMessage: string;
  developerCode: string;
};

const MAP: Record<string, UserFacingError> = {
  unauthorized: {
    category: "authorization",
    code: "unauthorized",
    userMessage: "You are not allowed to access this call workflow.",
    developerCode: "unauthorized",
  },
  missing_consent: {
    category: "policy",
    code: "missing_consent",
    userMessage: "Call consent must be recorded before placing a call.",
    developerCode: "missing_consent",
  },
  urgent_state_conflict: {
    category: "policy",
    code: "urgent_state_conflict",
    userMessage: "Urgent care is indicated — keep human escalation primary.",
    developerCode: "urgent_state_conflict",
  },
  provider_unavailable: {
    category: "provider",
    code: "provider_unavailable",
    userMessage: "Phone provider is temporarily unavailable. Try again or use the dialer.",
    developerCode: "provider_unavailable",
  },
  calls_disabled: {
    category: "configuration",
    code: "calls_disabled",
    userMessage: "Outbound calling is disabled on the server.",
    developerCode: "calls_disabled",
  },
  cancelled: {
    category: "user_cancelled",
    code: "cancelled",
    userMessage: "This call was cancelled.",
    developerCode: "cancelled",
  },
  call_e_disabled: {
    category: "configuration",
    code: "call_e_disabled",
    userMessage: "Phone workflows are disabled on the server.",
    developerCode: "call_e_disabled",
  },
  insufficient_call_credits: {
    category: "policy",
    code: "insufficient_call_credits",
    userMessage: "No call credits remaining. Upgrade or add credits.",
    developerCode: "insufficient_call_credits",
  },
  upgrade_required: {
    category: "policy",
    code: "upgrade_required",
    userMessage: "Live calls require a paid plan.",
    developerCode: "upgrade_required",
  },
  monthly_call_limit: {
    category: "policy",
    code: "monthly_call_limit",
    userMessage: "Monthly live call allowance reached.",
    developerCode: "monthly_call_limit",
  },
  duplicate_in_flight: {
    category: "data",
    code: "duplicate_in_flight",
    userMessage: "A call is already in progress for this workflow.",
    developerCode: "duplicate_in_flight",
  },
  hero_demo_failed: {
    category: "data",
    code: "hero_demo_failed",
    userMessage: "Hero demo could not run. Try again.",
    developerCode: "hero_demo_failed",
  },
  demo_scenario_failed: {
    category: "data",
    code: "demo_scenario_failed",
    userMessage: "Demo scenario could not run.",
    developerCode: "demo_scenario_failed",
  },
};

export function mapErrorToUserMessage(code: string): UserFacingError {
  return (
    MAP[code] ?? {
      category: "data",
      code,
      userMessage: "Something went wrong with the phone workflow. Please try again.",
      developerCode: code,
    }
  );
}
