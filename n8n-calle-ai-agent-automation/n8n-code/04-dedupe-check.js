// n8n Code node: request-id idempotency + same-day contact/intent dedupe
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
const x = $json;
const staticData = $getWorkflowStaticData('global');
staticData.calls = staticData.calls || {};
const now = Date.now();

for (const key of Object.keys(staticData.calls)) {
  const rec = staticData.calls[key];
  if (rec?.expiresAt && Date.parse(rec.expiresAt) <= now) delete staticData.calls[key];
}

const requestKey = `req:${x.requestId}`;
const contactWindowKey = `contact:${String(x.contact?.phone ?? '').replace(/\D/g, '')}:${x.intent}:${new Date(now).toISOString().slice(0, 10)}`;
const byRequest = staticData.calls[requestKey];
const byContact = staticData.calls[contactWindowKey];
const existing = byRequest || byContact;

if (existing) {
  return [{ json: {
    ...x,
    duplicate: true,
    duplicateKind: byRequest ? 'idempotency' : 'contact_window',
    requestKey,
    contactWindowKey,
    existingCall: existing,
  } }];
}

const pending = {
  status: 'pending',
  requestId: x.requestId,
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + DEDUPE_TTL_MS).toISOString(),
};
staticData.calls[requestKey] = pending;
staticData.calls[contactWindowKey] = pending;

return [{ json: { ...x, duplicate: false, requestKey, contactWindowKey } }];
