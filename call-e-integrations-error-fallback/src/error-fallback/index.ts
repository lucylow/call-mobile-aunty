export {
  decideFallback,
  shouldCreateNewCall,
  shouldPollExistingRun,
  type ErrorContext,
  type GateResult,
} from "./fallback-engine.js";

export {
  CHAOS_PHONE,
  DuplicateCallBroker,
  chaosBurst,
  kindToCode,
  mulberry32,
  replay,
  replayConcurrent,
  shuffle,
  ENGINE_INVARIANTS,
  type ChaosDispatch,
  type ChaosEvent,
  type ChaosEventKind,
  type OutboundAction,
  type RunRecord,
} from "./duplicate-call-chaos.js";
