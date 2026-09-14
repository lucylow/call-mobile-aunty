import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = join(root, "workflow", "calle-error-fallback-resume.json");

type N8nNode = {
  id: string;
  name: string;
  type: string;
  continueOnFail?: boolean;
  parameters?: Record<string, unknown>;
};

type N8nWorkflow = {
  name: string;
  active: boolean;
  nodes: N8nNode[];
  connections: Record<string, { main: Array<Array<{ node: string }>> }>;
};

function loadWorkflow(): N8nWorkflow {
  return JSON.parse(readFileSync(workflowPath, "utf8")) as N8nWorkflow;
}

function targets(workflow: N8nWorkflow, from: string, output = 0): string[] {
  return (workflow.connections[from]?.main?.[output] ?? []).map((c) => c.node);
}

test("n8n workflow is importable and inactive", () => {
  const wf = loadWorkflow();
  assert.equal(wf.active, false);
  assert.match(wf.name, /CALL-E/i);
  assert.ok(wf.nodes.length >= 12);
  assert.ok(wf.nodes.every((n) => n.id && n.name && n.type));
  const raw = readFileSync(workflowPath, "utf8");
  assert.doesNotMatch(raw, /sk-|api_key\s*[:=]\s*['\"][^'\"]+/i);
  assert.doesNotMatch(raw, /\+1(?!202555)\d{10}/);
});

test("n8n workflow never redials after create or on resume", () => {
  const wf = loadWorkflow();
  const names = wf.nodes.map((n) => n.name);
  assert.ok(names.includes("CALL-E Create Call"));
  assert.ok(names.includes("CALL-E Get Run"));
  assert.ok(names.includes("Resume Existing Run?"));
  assert.ok(names.includes("Capture Run And Never Redial"));

  assert.deepEqual(targets(wf, "Resume Existing Run?", 0), ["Use Existing Run"]);
  assert.deepEqual(targets(wf, "Resume Existing Run?", 1), ["Create New Call?"]);
  assert.deepEqual(targets(wf, "Create New Call?", 0), ["CALL-E Create Call"]);
  assert.ok(!targets(wf, "CALL-E Create Call").includes("CALL-E Create Call"));
  assert.ok(!targets(wf, "Poll Interval").includes("CALL-E Create Call"));
  assert.ok(!targets(wf, "Wait Before First Poll").includes("CALL-E Create Call"));
  assert.deepEqual(targets(wf, "Poll Interval"), ["CALL-E Get Run"]);
  assert.deepEqual(targets(wf, "Use Existing Run"), ["Wait Before First Poll"]);
  assert.deepEqual(targets(wf, "Capture Run And Never Redial"), ["Wait Before First Poll"]);
});

test("n8n recovery code encodes the fallback engine invariant", () => {
  const wf = loadWorkflow();
  const decide = wf.nodes.find((n) => n.name === "Decide Recovery");
  const capture = wf.nodes.find((n) => n.name === "Capture Run And Never Redial");
  const code = String(decide?.parameters?.jsCode ?? "");
  const captureCode = String(capture?.parameters?.jsCode ?? "");
  assert.match(code, /resume existing run/);
  assert.match(code, /shouldCreateNewCall/);
  assert.match(code, /DUPLICATE_RUN/);
  assert.match(code, /hasExistingRun/);
  assert.match(captureCode, /hasExistingRun:true/);
  assert.match(captureCode, /createNewCall:false/);
  const create = wf.nodes.find((n) => n.name === "CALL-E Create Call");
  assert.equal(create?.continueOnFail, true);
  assert.match(JSON.stringify(create?.parameters), /Idempotency-Key/);
});
