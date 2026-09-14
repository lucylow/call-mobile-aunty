// n8n Code node: build the CALL-E request without storing secrets in workflow data
const x = $json;
if (!x.allowed) return [{ json: { ...x, callePayload: null } }];
const questions = x.survey?.questions ?? [];
return [{ json: {
  ...x,
  callePayload: {
    to: x.contact.phone,
    contactName: x.contact.name,
    intent: x.intent,
    survey: questions.length ? { id: x.survey.id, questions } : undefined,
    metadata: { requestId: x.requestId, source: x.source }
  },
  idempotencyKey: `call-aunty:${x.requestId}`
} }];
