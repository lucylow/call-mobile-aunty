// n8n Code node: normalize incoming Call Aunty request
const item = $json;
const contact = item.contact ?? {};
return [{ json: {
  requestId: String(item.requestId ?? $execution.id),
  source: String(item.source ?? 'n8n'),
  intent: String(item.intent ?? 'unknown'),
  contact: { name: String(contact.name ?? ''), phone: String(contact.phone ?? ''), externalId: contact.externalId },
  consent: String(item.consent ?? 'unknown'),
  doNotContact: Boolean(item.doNotContact),
  survey: item.survey,
  context: item.context ?? {},
} }];
