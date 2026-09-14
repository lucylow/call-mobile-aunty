import { approvalAllowsExecution, evaluateApproval } from './approval.js';
import { CallEClient } from './calle-client.js';
import { DedupeStore, requestIdempotencyKey } from './dedupe.js';
import { planAutomation } from './planner.js';
import { validateRequest } from './policy.js';
import type { ApprovalState, AutomationRequest, CallEResponse, DedupeLookup } from './types.js';

export interface AgentRunOptions {
  dedupe?: DedupeStore;
  now?: number;
}

export interface AgentRunResult {
  plan: ReturnType<typeof planAutomation>;
  executed: boolean;
  approval?: ApprovalState;
  dedupe?: DedupeLookup;
  duplicate?: boolean;
  call?: CallEResponse;
}

export async function runCallAuntyAgent(
  input: Partial<AutomationRequest>,
  client: CallEClient,
  options: AgentRunOptions = {},
): Promise<AgentRunResult> {
  const request = validateRequest(input);
  const plan = planAutomation(request);
  if (plan.blocked) return { plan, executed: false };

  const store = options.dedupe ?? new DedupeStore();
  const now = options.now ?? Date.now();
  const existing = store.lookup(request, now);
  if (existing.duplicate) {
    return {
      plan,
      executed: false,
      duplicate: true,
      dedupe: existing,
      call: existing.existing?.callId
        ? { callId: existing.existing.callId, status: 'queued' }
        : undefined,
    };
  }

  const approval = evaluateApproval(request);
  if (!approvalAllowsExecution(approval)) {
    return { plan, executed: false, approval, dedupe: existing };
  }

  store.reserve(request, now);
  try {
    const result = await client.createCall({
      to: request.contact.phone,
      contactName: request.contact.name,
      intent: request.intent,
      survey: request.survey,
      metadata: { requestId: request.requestId, source: request.source },
    }, requestIdempotencyKey(request.requestId));
    store.remember(request, result, now);
    return { plan, executed: true, approval, dedupe: existing, call: result };
  } catch (error) {
    store.release(request, now);
    throw error;
  }
}
