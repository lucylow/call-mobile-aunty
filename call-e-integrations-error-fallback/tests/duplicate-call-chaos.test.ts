import assert from "node:assert/strict";
import test from "node:test";
import {
  decideFallback,
  shouldCreateNewCall,
  shouldPollExistingRun,
} from "../src/error-fallback/fallback-engine.js";
import {
  CHAOS_PHONE,
  DuplicateCallBroker,
  ENGINE_INVARIANTS,
  chaosBurst,
  replay,
  replayConcurrent,
} from "../src/error-fallback/duplicate-call-chaos.js";

test("fallback engine: 6/6 invariant checks", () => {
  const dnc = decideFallback(ENGINE_INVARIANTS[0]!);
  assert.equal(dnc.allowed, false);
  assert.equal(dnc.action, "BLOCK");

  const consent = decideFallback(ENGINE_INVARIANTS[1]!);
  assert.equal(consent.allowed, false);
  assert.equal(consent.action, "BLOCK");

  const duplicate = decideFallback(ENGINE_INVARIANTS[2]!);
  assert.equal(duplicate.action, "RESUME");
  assert.equal(shouldCreateNewCall(ENGINE_INVARIANTS[2]!), false);

  const existingTimeout = decideFallback(ENGINE_INVARIANTS[3]!);
  assert.equal(existingTimeout.action, "RESUME");
  assert.equal(shouldCreateNewCall(ENGINE_INVARIANTS[3]!), false);
  assert.equal(shouldPollExistingRun(ENGINE_INVARIANTS[3]!), true);

  const freshTimeout = decideFallback(ENGINE_INVARIANTS[4]!);
  assert.equal(freshTimeout.action, "RETRY");
  assert.equal(shouldCreateNewCall(ENGINE_INVARIANTS[4]!), true);

  const n8nTimeout = decideFallback(ENGINE_INVARIANTS[5]!);
  assert.equal(n8nTimeout.action, "RESUME");
  assert.equal(shouldCreateNewCall(ENGINE_INVARIANTS[5]!), false);
  assert.equal(shouldPollExistingRun(ENGINE_INVARIANTS[5]!), true);
});

test("duplicate DUPLICATE_RUN never places a new outbound call", () => {
  const broker = new DuplicateCallBroker();
  broker.placeCall("req-dup", CHAOS_PHONE);
  for (let i = 0; i < 40; i += 1) {
    const result = broker.recover({
      kind: "duplicate-run-signal",
      requestId: "req-dup",
      phone: CHAOS_PHONE,
      attempt: i + 1,
      hasConsent: true,
      onDnc: false,
    });
    assert.equal(result.created, false);
    assert.equal(result.action, "RESUME");
    assert.equal(result.runId, "mock-run-req-dup-1");
  }
  assert.equal(broker.creates, 1);
  assert.equal(broker.allRuns.length, 1);
});

test("timeout and n8n execution timeout poll/resume the same run", () => {
  const broker = new DuplicateCallBroker();
  broker.placeCall("req-timeout", CHAOS_PHONE);
  const timeout = broker.recover({
    kind: "timeout-retry",
    requestId: "req-timeout",
    phone: CHAOS_PHONE,
    attempt: 1,
    hasConsent: true,
    onDnc: false,
  });
  const n8n = broker.recover({
    kind: "n8n-timeout-retry",
    requestId: "req-timeout",
    phone: CHAOS_PHONE,
    attempt: 2,
    hasConsent: true,
    onDnc: false,
  });
  assert.equal(timeout.created, false);
  assert.equal(n8n.created, false);
  assert.ok(timeout.action === "RESUME" || timeout.action === "POLL");
  assert.ok(n8n.action === "RESUME" || n8n.action === "POLL");
  assert.equal(broker.creates, 1);
});

test("MCP run_call and a second n8n execution resume instead of dialing", () => {
  const broker = new DuplicateCallBroker();
  broker.placeCall("req-mcp", CHAOS_PHONE);
  const mcp = broker.recover({
    kind: "mcp-run-call",
    requestId: "req-mcp",
    phone: CHAOS_PHONE,
    attempt: 1,
    hasConsent: true,
    onDnc: false,
  });
  const second = broker.recover({
    kind: "second-n8n-execution",
    requestId: "req-mcp",
    phone: CHAOS_PHONE,
    attempt: 1,
    hasConsent: true,
    onDnc: false,
  });
  assert.equal(mcp.action, "RESUME");
  assert.equal(second.action, "RESUME");
  assert.equal(broker.creates, 1);
});

test("webhook + poll race does not create a second call", () => {
  const broker = new DuplicateCallBroker();
  broker.placeCall("req-hook", CHAOS_PHONE);
  const webhook = broker.recover({
    kind: "webhook-status",
    requestId: "req-hook",
    phone: CHAOS_PHONE,
    attempt: 1,
    hasConsent: true,
    onDnc: false,
  });
  const poll = broker.recover({
    kind: "poll-status",
    requestId: "req-hook",
    phone: CHAOS_PHONE,
    attempt: 1,
    hasConsent: true,
    onDnc: false,
  });
  assert.equal(webhook.created, false);
  assert.equal(poll.created, false);
  assert.equal(broker.creates, 1);
});

test("100 seeded chaos bursts never double-dial the same request", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const broker = new DuplicateCallBroker();
    replay(broker, chaosBurst(`req-seed-${seed}`, seed, 16));
    assert.equal(broker.creates, 1, `seed ${seed} created ${broker.creates} calls`);
    assert.equal(broker.allRuns.length, 1);
    assert.ok(broker.resumes + broker.polls >= 16);
    assert.match(broker.allRuns[0]!.phone, /^\+1202555\d{4}$/);
  }
});

test("concurrent duplicate placeCall attempts keep a single run", async () => {
  const broker = new DuplicateCallBroker();
  const results = await Promise.all(
    Array.from({ length: 25 }, () =>
      Promise.resolve(broker.placeCall("req-burst", CHAOS_PHONE)),
    ),
  );
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(results.filter((r) => r.action === "RESUME").length, 24);
  assert.equal(broker.creates, 1);
  assert.equal(new Set(results.map((r) => r.runId).filter(Boolean)).size, 1);
});

test("concurrent mixed recoveries after the first dial stay on one run", async () => {
  const broker = new DuplicateCallBroker();
  broker.placeCall("req-conc", CHAOS_PHONE);
  await replayConcurrent(broker, chaosBurst("req-conc", 7, 20).slice(1));
  assert.equal(broker.creates, 1);
  assert.equal(broker.allRuns.length, 1);
});

test("DNC and missing consent still block even when a run exists", () => {
  const broker = new DuplicateCallBroker();
  broker.placeCall("req-policy", CHAOS_PHONE);
  const dnc = broker.placeCall("req-policy", CHAOS_PHONE, { hasConsent: true, onDnc: true });
  const consent = broker.recover({
    kind: "timeout-retry",
    requestId: "req-policy",
    phone: CHAOS_PHONE,
    attempt: 1,
    hasConsent: false,
    onDnc: false,
  });
  assert.equal(dnc.action, "BLOCK");
  assert.equal(consent.action, "BLOCK");
  assert.equal(broker.creates, 1);
});

test("naive timeout retry double-dials; the engine-backed client does not", () => {
  const naive = new DuplicateCallBroker("naive-run");
  naive.placeCall("req-naive", CHAOS_PHONE);
  naive.recoverNaive({
    kind: "timeout-retry",
    requestId: "req-naive",
    phone: CHAOS_PHONE,
    attempt: 1,
    hasConsent: true,
    onDnc: false,
  });
  assert.equal(naive.creates, 2, "naive retry without hasExistingRun places a second call");

  const safe = new DuplicateCallBroker("safe-run");
  safe.placeCall("req-naive", CHAOS_PHONE);
  safe.recover({
    kind: "timeout-retry",
    requestId: "req-naive",
    phone: CHAOS_PHONE,
    attempt: 1,
    hasConsent: true,
    onDnc: false,
  });
  assert.equal(safe.creates, 1);
  assert.equal(shouldCreateNewCall({
    code: "NETWORK_TIMEOUT",
    hasExistingRun: true,
    hasConsent: true,
    onDnc: false,
    attempt: 1,
    maxAttempts: 3,
  }), false);
});

test("transient retry without an existing run may create exactly once, then resume", () => {
  const broker = new DuplicateCallBroker();
  const first = broker.recover({
    kind: "provider-5xx-retry",
    requestId: "req-5xx",
    phone: CHAOS_PHONE,
    attempt: 0,
    hasConsent: true,
    onDnc: false,
  });
  const second = broker.recover({
    kind: "provider-5xx-retry",
    requestId: "req-5xx",
    phone: CHAOS_PHONE,
    attempt: 1,
    hasConsent: true,
    onDnc: false,
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.action, "RESUME");
  assert.equal(broker.creates, 1);
});
