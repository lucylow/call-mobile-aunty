// n8n Code node: after HTTP retries are exhausted, classify and release pending locks
const prior = $('Prepare Human Approval').first().json;
const err = $json;
const staticData = $getWorkflowStaticData('global');
staticData.calls = staticData.calls || {};
if (prior.requestKey) delete staticData.calls[prior.requestKey];
if (prior.contactWindowKey) delete staticData.calls[prior.contactWindowKey];

const message = String(err.error?.message ?? err.message ?? JSON.stringify(err));
const status = Number(err.error?.httpCode ?? err.error?.statusCode ?? err.status ?? 0);
const retryable = status === 429 || status >= 500 || /429|timeout|temporar|network|fetch|econn|5\d\d/i.test(message);

return [{ json: {
  ...prior,
  retryExhausted: true,
  retryable,
  callError: { message, status },
} }];
