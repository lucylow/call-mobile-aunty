export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** Server-only CALL-E API key. Never expose to Expo. */
  calleApiKey: process.env.CALLE_API_KEY ?? "",
  /** Opt-in live calling. Default false → dry-run only. */
  calleLiveCalls: process.env.CALLE_LIVE_CALLS === "true",
  /** Hard disable outbound calling (forces dry-run / deny paths). */
  calleKillSwitch: process.env.CALLE_KILL_SWITCH === "true",
  /** Explicit demo mode — when true, never reach the live CALL-E provider. */
  calleDemoMode: process.env.CALLE_DEMO_MODE !== "false",
  /** V4 master switch for CALL-E phone workflows (default on). */
  calleEnabled: process.env.CALL_E_ENABLED !== "false",
  /** V4 AI brief/planner paths (default on; falls back to rules when off). */
  aiEnabled: process.env.AI_ENABLED !== "false",
  /** V5 deterministic replay of demo scenarios (default on in demo). */
  calleReplayEnabled: process.env.CALLE_REPLAY_ENABLED !== "false",
  /** V5 CHW review surfaces for low-confidence AI outcomes. */
  calleAdvancedReview: process.env.CALLE_ADVANCED_REVIEW !== "false",
  /** V6 monetization master switch (default on). */
  billingEnabled: process.env.BILLING_ENABLED !== "false",
  /** V6 demo billing — mock provider, synthetic metrics (default on). */
  billingDemoMode: process.env.BILLING_DEMO_MODE !== "false",
  /** V6 allow non-mock Apple/Google/Stripe providers (default off). */
  billingLiveProviders: process.env.BILLING_LIVE_PROVIDERS === "true",
};
