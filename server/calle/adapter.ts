import {
  CALL_E_RESULT_JSON_SCHEMA,
  callStructuredResultSchema,
  type CallFailureCode,
  type CallPurpose,
  type CallStructuredResult,
  type CallWorkflowStatus,
} from "./types";
import { normalizeStructuredResult } from "./normalize-result";
import { buildFollowUpTask } from "./call-plan";
import { isDemoMode } from "./demo-mode";
import { FakeCalleRuntime, type DemoScenarioId } from "./fake-runtime";

export type PlaceCallCommand = {
  workflowId: string;
  idempotencyKey: string;
  recipientE164: string;
  recipientRegion: string;
  purpose: CallPurpose;
  callLanguage: string;
  dryRun: boolean;
};

export type ProviderCallResult = {
  providerCallId: string;
  status: CallWorkflowStatus;
  structuredResult: CallStructuredResult | null;
  failureCode: CallFailureCode | null;
  taskCompleted?: boolean | null;
  completionConfidence?: number | null;
};

export interface CalleAdapter {
  placeFollowUpCall(command: PlaceCallCommand): Promise<ProviderCallResult>;
  getStatus(providerCallId: string): Promise<ProviderCallResult>;
  cancel(providerCallId: string): Promise<ProviderCallResult>;
}

function dryRunResult(workflowId: string): ProviderCallResult {
  return {
    providerCallId: `dryrun_${workflowId}`,
    status: "dry_run_completed",
    structuredResult: callStructuredResultSchema.parse({
      reached: true,
      availability: "available",
      needsHumanFollowUp: true,
      appointmentConfirmed: null,
      preferredCallbackWindow: "afternoon",
      safetyEscalation: "none",
      summaryCode: "needs_chw",
      nextAction: "call_again",
      completionConfidence: 0.91,
    }),
    failureCode: null,
    taskCompleted: true,
    completionConfidence: 0.91,
  };
}

export class DryRunCalleAdapter implements CalleAdapter {
  async placeFollowUpCall(command: PlaceCallCommand): Promise<ProviderCallResult> {
    return dryRunResult(command.workflowId);
  }

  async getStatus(providerCallId: string): Promise<ProviderCallResult> {
    return dryRunResult(providerCallId.replace(/^dryrun_/, "") || "unknown");
  }

  async cancel(providerCallId: string): Promise<ProviderCallResult> {
    return {
      providerCallId,
      status: "cancelled",
      structuredResult: null,
      failureCode: "cancelled",
    };
  }
}

function mapProviderStatus(status: string | undefined, taskCompleted?: boolean | null): CallWorkflowStatus {
  const normalized = (status ?? "").toLowerCase();
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("no_answer") || normalized.includes("no-answer")) return "no_answer";
  if (normalized.includes("fail") || normalized.includes("error")) return "failed";
  if (
    normalized.includes("progress") ||
    normalized.includes("ring") ||
    normalized.includes("active") ||
    normalized.includes("queued")
  ) {
    return "in_progress";
  }
  if (normalized.includes("complete") || normalized.includes("done") || taskCompleted) return "completed";
  return "unknown";
}

function confidenceToNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export class LiveCalleAdapter implements CalleAdapter {
  constructor(private readonly apiKey: string) {}

  private async client() {
    try {
      const mod = await import("@call-e/calle");
      return new mod.CalleClient({ apiKey: this.apiKey });
    } catch {
      throw Object.assign(new Error("CALL-E SDK unavailable"), {
        code: "provider_unavailable" as CallFailureCode,
      });
    }
  }

  async placeFollowUpCall(command: PlaceCallCommand): Promise<ProviderCallResult> {
    if (command.dryRun) return dryRunResult(command.workflowId);
    try {
      const client = await this.client();
      const call = await client.calls.createAndWait(
        {
          task: buildFollowUpTask({
            recipientE164: command.recipientE164,
            purpose: command.purpose,
            callLanguage: command.callLanguage,
          }),
          recipient: {
            phone: command.recipientE164,
            region: command.recipientRegion,
            locale: command.callLanguage,
          },
          resultSchema: CALL_E_RESULT_JSON_SCHEMA as unknown as Record<string, unknown>,
          metadata: {
            workflowId: command.workflowId,
            purpose: command.purpose,
            product: "call-aunty",
          },
        },
        { idempotencyKey: command.idempotencyKey },
      );
      const normalized = normalizeStructuredResult(call.structuredResult);
      return {
        providerCallId: call.id ?? `calle_${command.workflowId}`,
        status: mapProviderStatus(call.status, call.taskCompleted),
        structuredResult: normalized,
        failureCode: normalized
          ? ((call.failureCode as CallFailureCode | null) ?? null)
          : "result_invalid",
        taskCompleted: call.taskCompleted,
        completionConfidence: confidenceToNumber(call.completionConfidence),
      };
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? ((error as { code: CallFailureCode }).code ?? "provider_unavailable")
          : "provider_unavailable";
      return {
        providerCallId: `failed_${command.workflowId}`,
        status: "failed",
        structuredResult: null,
        failureCode: code,
      };
    }
  }

  async getStatus(providerCallId: string): Promise<ProviderCallResult> {
    if (providerCallId.startsWith("dryrun_")) {
      return dryRunResult(providerCallId.replace(/^dryrun_/, ""));
    }
    try {
      const client = await this.client();
      const call = await client.calls.get(providerCallId);
      const normalized = normalizeStructuredResult(call.structuredResult);
      return {
        providerCallId: call.id ?? providerCallId,
        status: mapProviderStatus(call.status, call.taskCompleted),
        structuredResult: normalized,
        failureCode: (call.failureCode as CallFailureCode | null) ?? null,
      };
    } catch {
      return {
        providerCallId,
        status: "unknown",
        structuredResult: null,
        failureCode: "provider_unavailable",
      };
    }
  }

  async cancel(providerCallId: string): Promise<ProviderCallResult> {
    return {
      providerCallId,
      status: "cancelled",
      structuredResult: null,
      failureCode: "cancelled",
    };
  }
}

export function createCalleAdapter(opts: {
  apiKey: string;
  liveCallsEnabled: boolean;
  demoScenario?: DemoScenarioId;
}): CalleAdapter {
  if (isDemoMode()) {
    return new FakeCalleRuntime(opts.demoScenario ?? "instant_success");
  }
  if (!opts.liveCallsEnabled || !opts.apiKey) return new DryRunCalleAdapter();
  return new LiveCalleAdapter(opts.apiKey);
}
