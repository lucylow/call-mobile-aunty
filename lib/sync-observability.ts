import type { SyncQueueItem } from "@/lib/sync-queue";

export type SyncObservabilitySummary = {
  queued: number;
  retrying: number;
  synced: number;
  exhausted: number;
  latestAttemptAt: string | null;
};

export function summarizeSyncQueue(items: SyncQueueItem[], maxAttempts = 5): SyncObservabilitySummary {
  const latestAttemptAt = items
    .map((item) => item.updatedAt)
    .filter((timestamp) => !Number.isNaN(Date.parse(timestamp)))
    .sort()
    .at(-1) ?? null;

  return {
    queued: items.filter((item) => item.status === "queued" && item.attempts < maxAttempts).length,
    retrying: items.filter((item) => item.status === "retrying" && item.attempts < maxAttempts).length,
    synced: items.filter((item) => item.status === "synced").length,
    exhausted: items.filter((item) => item.status !== "synced" && item.attempts >= maxAttempts).length,
    latestAttemptAt,
  };
}
