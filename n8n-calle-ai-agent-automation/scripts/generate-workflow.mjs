import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'n8n-code', file), 'utf8');

function codeNode(id, name, file, position, jsCode) {
  return {
    parameters: { jsCode: jsCode ?? code(file) },
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

function ifBoolean(id, name, expression, position) {
  return {
    parameters: {
      conditions: {
        boolean: [{ value1: `={{${expression}}}`, operation: 'isTrue' }],
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position,
  };
}

function respond(id, name, body, position) {
  return {
    parameters: { respondWith: 'json', responseBody: `={{ ${body} }}` },
    id,
    name,
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1,
    position,
  };
}

const workflow = {
  name: 'Call Aunty - AI Agent Phone Automation',
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'call-aunty-agent',
        responseMode: 'responseNode',
      },
      id: 'trigger',
      name: 'Call Aunty Request',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: 'call-aunty-agent',
    },
    codeNode('normalize', 'Normalize Request', '01-normalize-request.js', [220, 0]),
    codeNode('policy', 'Policy Gate', '02-policy-gate.js', [440, 0]),
    ifBoolean('if-allowed', 'Allowed?', '$json.allowed', [660, 0]),
    respond('blocked', 'Blocked Response', '{blocked:true, reason:$json.policyIssues, requestId:$json.requestId}', [900, 280]),
    codeNode('payload', 'Build CALL-E Payload', '03-build-calle-payload.js', [900, 0]),
    codeNode('dedupe', 'Dedup Check', '04-dedupe-check.js', [1120, 0]),
    ifBoolean('if-duplicate', 'Duplicate?', '$json.duplicate', [1340, 0]),
    respond(
      'deduped',
      'Deduped Response',
      '{accepted:true, duplicate:true, duplicateKind:$json.duplicateKind, requestId:$json.requestId, call:$json.existingCall}',
      [1560, 280],
    ),
    codeNode('prepare-approval', 'Prepare Human Approval', '05-prepare-approval.js', [1560, 0]),
    ifBoolean('if-approval', 'Approval Required?', '$json.approval.required', [1780, 0]),
    respond(
      'pending',
      'Pending Approval Response',
      '{accepted:false, status:"pending_approval", requestId:$json.requestId, approvalUrl:$json.approval.resumeUrl, summary:$json.approval.summary}',
      [2000, -220],
    ),
    {
      parameters: {
        resume: 'form',
        formTitle: 'Approve Call Aunty outbound call',
        formDescription: "={{ 'Review this CALL-E action for ' + $('Prepare Human Approval').item.json.contact.name + ' (' + $('Prepare Human Approval').item.json.intent + '). Approving places a real phone call. Rejecting or waiting 24 hours will not place a call.' }}",
        formFields: {
          values: [
            {
              fieldLabel: 'Decision',
              fieldType: 'dropdown',
              requiredField: true,
              fieldOptions: { values: [{ option: 'approve' }, { option: 'reject' }] },
            },
            { fieldLabel: 'Approver', fieldType: 'text', requiredField: true },
            { fieldLabel: 'Notes', fieldType: 'textarea', requiredField: false },
          ],
        },
        options: {
          limitWaitTime: true,
          limitType: 'afterTimeInterval',
          resumeAmount: 24,
          resumeUnit: 'hours',
        },
      },
      id: 'wait-approval',
      name: 'Wait for Human Approval',
      type: 'n8n-nodes-base.wait',
      typeVersion: 1.1,
      position: [2220, -220],
      webhookId: 'call-aunty-approval-wait',
    },
    codeNode('evaluate-approval', 'Evaluate Approval Decision', '06-evaluate-approval.js', [2440, -220]),
    {
      parameters: {
        conditions: {
          string: [{ value1: '={{$json.approval.decision}}', operation: 'equals', value2: 'approved' }],
        },
      },
      id: 'if-approved',
      name: 'Approved?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [2660, -220],
    },
    codeNode('rejected', 'Rejected Approval', undefined, [2880, -80], `const x = $json;
return [{ json: { ...x, status: x.approval?.decision === 'timed_out' ? 'approval_timed_out' : 'rejected', executed: false } }];
`),
    {
      parameters: {
        method: 'POST',
        url: "={{$env.CALLE_BASE_URL + '/v1/calls'}}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: "={{'Bearer ' + $env.CALLE_API_KEY}}" },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Idempotency-Key', value: '={{$json.idempotencyKey}}' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{JSON.stringify($json.callePayload)}}',
        options: { timeout: 15000 },
      },
      id: 'calle',
      name: 'CALL-E Create Call',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2000, 80],
      retryOnFail: true,
      maxTries: 5,
      waitBetweenTries: 3000,
      onError: 'continueErrorOutput',
    },
    codeNode('record-dedupe', 'Record Dedup', '07-record-dedupe.js', [2240, 0]),
    ifBoolean('if-webhook-open', 'Webhook Still Open?', '!$json.approval.required', [2460, 0]),
    respond('ok', 'Accepted Response', '{accepted:true, requestId:$json.requestId, call:$json.call}', [2680, -40]),
    codeNode('complete', 'Mark Complete', undefined, [2680, 120], `const x = $json;
return [{ json: { ...x, status: 'completed', executed: true } }];
`),
    codeNode('classify', 'Classify Call Error', '08-classify-retry.js', [2240, 280]),
    ifBoolean('if-failed-open', 'Failed Webhook Open?', '!$json.approval.required', [2460, 280]),
    respond(
      'failed',
      'Failed Response',
      '{accepted:false, retryExhausted:true, requestId:$json.requestId, error:$json.callError}',
      [2680, 220],
    ),
    codeNode('mark-failed', 'Mark Failed', undefined, [2680, 360], `const x = $json;
return [{ json: { ...x, status: 'failed', executed: false } }];
`),
  ],
  connections: {
    'Call Aunty Request': { main: [[{ node: 'Normalize Request', type: 'main', index: 0 }]] },
    'Normalize Request': { main: [[{ node: 'Policy Gate', type: 'main', index: 0 }]] },
    'Policy Gate': { main: [[{ node: 'Allowed?', type: 'main', index: 0 }]] },
    'Allowed?': {
      main: [
        [{ node: 'Build CALL-E Payload', type: 'main', index: 0 }],
        [{ node: 'Blocked Response', type: 'main', index: 0 }],
      ],
    },
    'Build CALL-E Payload': { main: [[{ node: 'Dedup Check', type: 'main', index: 0 }]] },
    'Dedup Check': { main: [[{ node: 'Duplicate?', type: 'main', index: 0 }]] },
    'Duplicate?': {
      main: [
        [{ node: 'Deduped Response', type: 'main', index: 0 }],
        [{ node: 'Prepare Human Approval', type: 'main', index: 0 }],
      ],
    },
    'Prepare Human Approval': { main: [[{ node: 'Approval Required?', type: 'main', index: 0 }]] },
    'Approval Required?': {
      main: [
        [{ node: 'Pending Approval Response', type: 'main', index: 0 }],
        [{ node: 'CALL-E Create Call', type: 'main', index: 0 }],
      ],
    },
    'Pending Approval Response': { main: [[{ node: 'Wait for Human Approval', type: 'main', index: 0 }]] },
    'Wait for Human Approval': { main: [[{ node: 'Evaluate Approval Decision', type: 'main', index: 0 }]] },
    'Evaluate Approval Decision': { main: [[{ node: 'Approved?', type: 'main', index: 0 }]] },
    'Approved?': {
      main: [
        [{ node: 'CALL-E Create Call', type: 'main', index: 0 }],
        [{ node: 'Rejected Approval', type: 'main', index: 0 }],
      ],
    },
    'CALL-E Create Call': {
      main: [
        [{ node: 'Record Dedup', type: 'main', index: 0 }],
        [{ node: 'Classify Call Error', type: 'main', index: 0 }],
      ],
    },
    'Record Dedup': { main: [[{ node: 'Webhook Still Open?', type: 'main', index: 0 }]] },
    'Webhook Still Open?': {
      main: [
        [{ node: 'Accepted Response', type: 'main', index: 0 }],
        [{ node: 'Mark Complete', type: 'main', index: 0 }],
      ],
    },
    'Classify Call Error': { main: [[{ node: 'Failed Webhook Open?', type: 'main', index: 0 }]] },
    'Failed Webhook Open?': {
      main: [
        [{ node: 'Failed Response', type: 'main', index: 0 }],
        [{ node: 'Mark Failed', type: 'main', index: 0 }],
      ],
    },
  },
  active: false,
  settings: { executionOrder: 'v1' },
  versionId: 'call-aunty-ai-agent-v1.1',
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

mkdirSync(join(root, 'workflow'), { recursive: true });
writeFileSync(join(root, 'workflow', 'call-aunty-ai-agent.json'), `${JSON.stringify(workflow, null, 2)}\n`);
console.log('wrote workflow/call-aunty-ai-agent.json');
