import { evaluateApproval } from './approval.js';
import type { AgentPlan, AutomationRequest } from './types.js';
import { evaluatePolicy } from './policy.js';

export function planAutomation(req: AutomationRequest): AgentPlan {
  const policy = evaluatePolicy(req);
  const approval = evaluateApproval(req);
  const checks = [
    'validate_contact',
    'validate_consent',
    'check_dnc',
    'dedupe_request_and_contact_window',
    'require_human_approval',
    'preserve_idempotency_key',
    'retry_transient_calle_errors',
  ];
  const sideEffects = ['initiate CALL-E phone call', 'persist call result', 'update downstream systems'];

  if (!policy.allowed) {
    return {
      requestId: req.requestId,
      summary: 'Do not initiate the phone call.',
      checks,
      tools: [],
      steps: ['stop'],
      sideEffects: [],
      blocked: true,
      blockReason: policy.reason,
      approvalRequired: false,
    };
  }

  const steps = [
    'validate_request',
    'policy_gate',
    'dedupe_check',
    'human_approval_gate',
    'create_or_resume_call',
    'poll_or_receive_webhook',
    'store_result',
  ];
  if (approval.required && approval.decision === 'pending') {
    steps.splice(4, 0, 'await_human_approval');
  }
  const tools = ['call_e.create_call', 'call_e.get_call', 'call_e.cancel_call'];
  if (req.intent === 'survey') steps.splice(steps.indexOf('create_or_resume_call') + 1, 0, 'collect_and_normalize_survey_answers');
  return {
    requestId: req.requestId,
    summary: `Execute ${req.intent} automation for ${req.contact.name}.`,
    checks,
    tools,
    steps,
    sideEffects,
    blocked: false,
    approvalRequired: approval.required,
  };
}
