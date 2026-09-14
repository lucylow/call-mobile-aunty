// n8n Code node: hard gate before CALL-E side effects
const x = $json;
const issues = [];
if (!x.contact?.phone) issues.push('MISSING_PHONE');
if (x.doNotContact) issues.push('CONTACT_IS_DNC');
if (x.consent !== 'granted') issues.push('CALL_CONSENT_NOT_GRANTED');
return [{ json: { ...x, allowed: issues.length === 0, policyIssues: issues } }];
