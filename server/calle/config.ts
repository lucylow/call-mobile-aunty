import { ENV } from "../_core/env";
import { isDemoMode } from "./demo-mode";

/** Server-only CALL-E configuration. Never import from Expo client code. */
export type CalleConfig = {
  apiKey: string;
  liveCallsEnabled: boolean;
  killSwitch: boolean;
  configured: boolean;
  demoMode: boolean;
  mode: "dry_run" | "live" | "disabled" | "demo";
};

export function loadCalleConfig(env: typeof ENV = ENV): CalleConfig {
  const apiKey = env.calleApiKey.trim();
  const liveCallsEnabled = env.calleLiveCalls;
  const killSwitch = env.calleKillSwitch;
  const demoMode = isDemoMode(env);
  const configured = apiKey.length > 0;

  let mode: CalleConfig["mode"] = "dry_run";
  if (killSwitch) mode = "disabled";
  else if (demoMode) mode = "demo";
  else if (configured && liveCallsEnabled) mode = "live";

  return {
    apiKey,
    liveCallsEnabled,
    killSwitch,
    configured,
    demoMode,
    mode,
  };
}

/** Safe metadata for diagnostics — no secrets. */
export function getCallePublicConfig(env: typeof ENV = ENV) {
  const config = loadCalleConfig(env);
  return {
    configured: config.configured,
    liveCallsEnabled: config.liveCallsEnabled,
    killSwitch: config.killSwitch,
    demoMode: config.demoMode,
    mode: config.mode,
    indicator: config.demoMode ? "DEMO" : config.mode === "live" ? "LIVE_ELIGIBLE" : "DRY_RUN",
  };
}

export function toPolicyEnv(config: CalleConfig) {
  return {
    liveCallsEnabled: config.liveCallsEnabled && !config.killSwitch,
    hasApiKey: config.configured,
    killSwitch: config.killSwitch,
    apiKey: config.apiKey,
  };
}
