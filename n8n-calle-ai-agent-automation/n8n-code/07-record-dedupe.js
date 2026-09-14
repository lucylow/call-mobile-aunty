// n8n Code node: persist successful CALL-E ids for later dedupe hits
const payload = $('Prepare Human Approval').first().json;
const call = $json;
const staticData = $getWorkflowStaticData('global');
staticData.calls = staticData.calls || {};
const rec = {
  status: 'completed',
  requestId: payload.requestId,
  callId: call.callId ?? call.id,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};
if (payload.requestKey) staticData.calls[payload.requestKey] = rec;
if (payload.contactWindowKey) staticData.calls[payload.contactWindowKey] = rec;
return [{ json: { ...payload, call, duplicate: false } }];
