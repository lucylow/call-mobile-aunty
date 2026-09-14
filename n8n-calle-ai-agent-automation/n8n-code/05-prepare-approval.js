// n8n Code node: decide whether a human must approve before CALL-E dispatch
const x = $json;
const ctx = x.context ?? {};
const skip = Boolean(ctx.autoApprove || ctx.skipApproval);
const resumeUrl = typeof $execution !== 'undefined' ? ($execution.resumeFormUrl || $execution.resumeUrl) : undefined;
return [{ json: {
  ...x,
  approval: {
    required: !skip,
    decision: skip ? 'not_required' : 'pending',
    reason: skip ? 'AUTO_APPROVE' : 'HUMAN_APPROVAL_REQUIRED',
    resumeUrl,
    summary: `Call ${x.contact?.name ?? 'unknown'} at ${x.contact?.phone ?? ''} for ${x.intent}.`,
  },
} }];
