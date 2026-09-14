// n8n Code node: interpret Wait-form / webhook resume payload
const prior = $('Prepare Human Approval').first().json;
const incoming = $json;
const raw = String(incoming.Decision ?? incoming.decision ?? incoming.approval?.decision ?? '').toLowerCase().trim();
let decision = 'rejected';
if (raw === 'approve' || raw === 'approved') decision = 'approved';
else if (!raw) decision = 'timed_out';

if (decision !== 'approved') {
  const staticData = $getWorkflowStaticData('global');
  staticData.calls = staticData.calls || {};
  if (prior.requestKey) delete staticData.calls[prior.requestKey];
  if (prior.contactWindowKey) delete staticData.calls[prior.contactWindowKey];
}

return [{ json: {
  ...prior,
  approval: {
    ...prior.approval,
    decision,
    reason: decision === 'approved' ? 'OPERATOR_APPROVED' : decision === 'timed_out' ? 'APPROVAL_TIMED_OUT' : 'OPERATOR_REJECTED',
    approvedBy: incoming.Approver ?? incoming.approver,
    notes: incoming.Notes ?? incoming.notes,
  },
} }];
