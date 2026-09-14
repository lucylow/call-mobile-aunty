import type { ApprovalState, AutomationRequest } from './types.js';

function contextFlag(req: AutomationRequest, key: string): boolean {
  return req.context?.[key] === true;
}

function contextString(req: AutomationRequest, key: string): string | undefined {
  const value = req.context?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function evaluateApproval(req: AutomationRequest): ApprovalState {
  if (contextFlag(req, 'autoApprove') || contextFlag(req, 'skipApproval')) {
    return { required: false, decision: 'not_required', reason: 'AUTO_APPROVE' };
  }

  const incoming = (contextString(req, 'approvalDecision') ?? '').toLowerCase();
  const approvedBy = contextString(req, 'approvedBy');
  const notes = contextString(req, 'approvalNotes');

  if (incoming === 'approved' || incoming === 'approve') {
    return { required: true, decision: 'approved', reason: 'OPERATOR_APPROVED', approvedBy, notes };
  }
  if (incoming === 'rejected' || incoming === 'reject') {
    return { required: true, decision: 'rejected', reason: 'OPERATOR_REJECTED', approvedBy, notes };
  }
  if (incoming === 'timed_out' || incoming === 'timeout') {
    return { required: true, decision: 'timed_out', reason: 'APPROVAL_TIMED_OUT', notes };
  }

  return { required: true, decision: 'pending', reason: 'HUMAN_APPROVAL_REQUIRED' };
}

export function approvalAllowsExecution(approval: ApprovalState): boolean {
  return approval.decision === 'approved' || approval.decision === 'not_required';
}
