import workflowJson from '../workflow/call-aunty-ai-agent.json' with { type: 'json' };
import { runCallAuntyAgent } from '../src/agent.js';
import { evaluateApproval } from '../src/approval.js';
import { CallEClient } from '../src/calle-client.js';
import { DedupeStore } from '../src/dedupe.js';
import { planAutomation } from '../src/planner.js';
import { classifyRetry, isRetryableError, withRetry } from '../src/retry.js';

type WorkflowNode = {
  name: string;
  retryOnFail?: boolean;
  maxTries?: number;
  onError?: string;
  parameters: Record<string, unknown> & { resume?: string; options?: { limitWaitTime?: boolean }; responseMode?: string };
};
type Workflow = {
  nodes: WorkflowNode[];
  connections: Record<string, { main?: Array<Array<{ node: string } | undefined> | undefined> | undefined }>;
};
const workflow = workflowJson as Workflow;

const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
let passed = 0;
const check = (condition: boolean, message: string) => { assert(condition, message); passed += 1; };

const blocked = planAutomation({requestId:"r1",source:"n8n",intent:"survey",contact:{name:"Aunty Example",phone:"+12025550101"},consent:"pending"});
check(blocked.blocked, "pending consent must block");
check(blocked.blockReason === "CALL_CONSENT_NOT_GRANTED", "expected consent block reason");

const survey = planAutomation({requestId:"r2",source:"n8n",intent:"survey",contact:{name:"Aunty Example",phone:"+12025550102"},consent:"granted",survey:{id:"call-aunty",questions:["Q1","Q2"]}});
check(!survey.blocked, "granted consent should allow");
check(survey.steps.includes("collect_and_normalize_survey_answers"), "survey step missing");
check(survey.tools.includes("call_e.create_call"), "CALL-E tool missing");
check(survey.approvalRequired, "live call should require human approval");
check(survey.steps.includes("human_approval_gate"), "approval step missing");
check(survey.steps.includes("dedupe_check"), "dedupe step missing");
check(survey.steps.includes("await_human_approval"), "wait-for-approval step missing");

const autoApproved = planAutomation({requestId:"r3",source:"n8n",intent:"reminder",contact:{name:"Aunty Example",phone:"+12025550103"},consent:"granted",context:{autoApprove:true}});
check(!autoApproved.approvalRequired, "autoApprove should skip the human gate");

check(evaluateApproval({requestId:"r4",source:"n8n",intent:"callback",contact:{name:"Aunty",phone:"+12025550104"},consent:"granted"}).decision === "pending", "default approval is pending");
check(evaluateApproval({requestId:"r5",source:"n8n",intent:"callback",contact:{name:"Aunty",phone:"+12025550105"},consent:"granted",context:{approvalDecision:"approved",approvedBy:"operator"}}).decision === "approved", "operator approval should pass");

const store = new DedupeStore();
const now = Date.parse("2026-09-14T15:00:00Z");
class FakeClient extends CallEClient {
  calls = 0;
  constructor() { super({ baseUrl: "https://example.invalid", apiKey: "test" }); }
  override async createCall(_payload: Record<string, unknown>, _idempotencyKey: string) {
    this.calls += 1;
    return { callId: `call-${this.calls}`, status: "queued" as const };
  }
}
const client = new FakeClient();
const baseReq = {
  requestId: "dup-1",
  source: "n8n",
  intent: "reminder" as const,
  contact: { name: "Aunty Example", phone: "+12025550106" },
  consent: "granted" as const,
  context: { autoApprove: true },
};
const first = await runCallAuntyAgent(baseReq, client, { dedupe: store, now });
check(first.executed === true, "first auto-approved call should execute");
const replay = await runCallAuntyAgent(baseReq, client, { dedupe: store, now });
check(replay.duplicate === true && replay.dedupe?.kind === "idempotency", "same requestId must dedupe");
const windowHit = await runCallAuntyAgent({ ...baseReq, requestId: "dup-2" }, client, { dedupe: store, now });
check(windowHit.duplicate === true && windowHit.dedupe?.kind === "contact_window", "same contact+intent same day must dedupe");
check(client.calls === 1, "dedupe must prevent extra CALL-E creates");

const pendingRun = await runCallAuntyAgent({ ...baseReq, requestId: "need-approval", contact: { name: "Aunty Example", phone: "+12025550999" }, context: {} }, client, { dedupe: store, now });
check(pendingRun.executed === false && pendingRun.approval?.decision === "pending", "missing approval must not place a call");

const rejectedRun = await runCallAuntyAgent({ ...baseReq, requestId: "rejected", contact: { name: "Aunty Example", phone: "+12025550998" }, context: { approvalDecision: "rejected" } }, client, { dedupe: store, now });
check(rejectedRun.executed === false && rejectedRun.approval?.decision === "rejected", "rejected approval must not place a call");

check(isRetryableError({ status: 503, message: "CALL-E 503" }), "503 is retryable");
check(!isRetryableError({ status: 400, message: "CALL-E 400" }), "400 is not retryable");
check(classifyRetry(Object.assign(new Error("CALL-E 429"), { status: 429 }), 1).retry, "429 should retry");
check(!classifyRetry(Object.assign(new Error("CALL-E 422"), { status: 422 }), 1).retry, "422 should not retry");

let attempts = 0;
const recovered = await withRetry(async () => {
  attempts += 1;
  if (attempts < 3) throw Object.assign(new Error("CALL-E 503"), { status: 503 });
  return "ok";
}, { maxAttempts: 4, sleep: async () => {} });
check(recovered === "ok" && attempts === 3, "transient errors should retry then succeed");

attempts = 0;
try {
  await withRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error("CALL-E 400"), { status: 400 });
  }, { maxAttempts: 4, sleep: async () => {} });
  throw new Error("400 should not be swallowed");
} catch (error) {
  check(error instanceof Error && error.message.includes("400") && attempts === 1, "non-retryable errors should fail immediately");
}

const names = new Set(workflow.nodes.map((node) => node.name));
for (const name of ["Wait for Human Approval", "Dedup Check", "Prepare Human Approval", "Evaluate Approval Decision", "Record Dedup", "Classify Call Error", "CALL-E Create Call"]) {
  check(names.has(name), `workflow missing node ${name}`);
}
const calle = workflow.nodes.find((node) => node.name === "CALL-E Create Call");
check(Boolean(calle?.retryOnFail === true && (calle.maxTries ?? 0) >= 3), "CALL-E node must retry on failure");
check(calle?.onError === "continueErrorOutput", "CALL-E node must expose an error branch");
const wait = workflow.nodes.find((node) => node.name === "Wait for Human Approval");
check(wait?.parameters.resume === "form" && wait.parameters.options?.limitWaitTime === true, "approval wait must be a time-limited form");
check(workflow.nodes.find((node) => node.name === "Call Aunty Request")?.parameters.responseMode === "responseNode", "webhook must respond before the wait");
check(Boolean(workflow.connections["Pending Approval Response"]?.main?.[0]?.[0]), "pending response must continue into the wait node");
check(Boolean(workflow.connections["CALL-E Create Call"]?.main?.[1]?.[0]), "CALL-E error output must be connected");

console.log(`PASS ${passed}/${passed}`);
