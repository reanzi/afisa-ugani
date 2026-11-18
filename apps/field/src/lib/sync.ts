/**
 * Moves records between the phone and Convex.
 *
 * Push: pending records go up in batches; each comes back accepted, stale
 * (already applied) or rejected with a reason. Pull: anything changed on the
 * server since our cursor comes down, unless we hold a newer local edit.
 *
 * Runs when the app opens, when the connection returns, when the app comes to
 * the foreground, every few minutes, and right after a save.
 */
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { ConvexError } from "convex/values";
import { SYNC_PUSH_BATCH } from "@afisa/shared";
import { clientMeta, convex } from "./client";
import { db, getMeta, setMeta, type LocalRecord } from "./db";

const SYNC_EVENT = "afisa:sync-now";
const INTERVAL_MS = 3 * 60 * 1000;

export function requestSync() {
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export type SyncReport = {
  lastSyncedAt?: number;
  lastError?: string;
  updateRequired?: boolean;
};

async function pushPending(councilId: string): Promise<{ updateRequired: boolean }> {
  let updateRequired = false;
  for (;;) {
    const batch = await db.records
      .where("[councilId+syncState]")
      .equals([councilId, "pending"])
      .limit(SYNC_PUSH_BATCH)
      .toArray();
    if (batch.length === 0) break;
    const res = await convex.mutation(api.sync.pushRecords, {
      councilId: councilId as Id<"councils">,
      client: await clientMeta(),
      records: batch.map((r) => ({
        clientId: r.clientId,
        type: r.type,
        section: r.section,
        areaId: r.areaId as Id<"areas"> | undefined,
        occurredAt: r.occurredAt,
        payload: r.payload,
        payloadVersion: r.payloadVersion,
        geo: r.geo,
        deletedAt: r.deletedAt,
        clientUpdatedAt: r.clientUpdatedAt,
      })),
    });
    updateRequired ||= res.updateRequired;
    await db.transaction("rw", db.records, async () => {
      for (const result of res.results) {
        const local = await db.records.get(result.clientId);
        const sent = batch.find((b) => b.clientId === result.clientId);
        // Edited again while the push was in flight: leave it pending.
        if (!local || !sent || local.clientUpdatedAt !== sent.clientUpdatedAt) continue;
        if (result.status === "rejected") {
          await db.records.update(result.clientId, { syncState: "rejected", rejectReason: result.reason });
        } else {
          await db.records.update(result.clientId, {
            syncState: "synced",
            rejectReason: undefined,
            ...(result.status === "accepted" ? { serverUpdatedAt: result.serverUpdatedAt } : {}),
          });
        }
      }
    });
    if (batch.length < SYNC_PUSH_BATCH) break;
  }
  return { updateRequired };
}

/** Send queued reports. A report the server refuses is marked, never retried blindly. */
async function pushSubmissions(councilId: string): Promise<void> {
  const queued = await db.submissions.where("[councilId+syncState]").equals([councilId, "pending"]).sortBy("clientSubmittedAt");
  for (const s of queued) {
    try {
      const res = await convex.mutation(api.submissions.submit, {
        councilId: councilId as Id<"councils">,
        client: await clientMeta(),
        clientId: s.clientId,
        kind: s.kind,
        period: s.period,
        areaLabel: s.areaLabel,
        payload: s.payload,
        payloadVersion: s.payloadVersion,
        clientSubmittedAt: s.clientSubmittedAt,
      });
      await db.submissions.update(s.clientId, { syncState: "synced", revision: res.revision, submittedAt: res.submittedAt, late: res.late, error: undefined });
    } catch (e) {
      if (e instanceof ConvexError) {
        const data = e.data as { message?: string } | undefined;
        await db.submissions.update(s.clientId, { syncState: "rejected", error: data?.message ?? "Imekataliwa" });
      } else {
        throw e; // network: stay queued
      }
    }
  }
}

/**
 * Learn about reports sent elsewhere (by auto-send, or from another phone),
 * reports sent back for correction, and corrected reports that replaced them.
 */
async function pullSubmissions(councilId: string): Promise<void> {
  const mine = await convex.query(api.submissions.mine, { councilId: councilId as Id<"councils"> });
  await db.transaction("rw", db.submissions, async () => {
    for (const s of mine) {
      // The server keeps one report per period; drop older local copies it replaced.
      const same = await db.submissions.where("[councilId+kind+period]").equals([councilId, s.kind, s.period]).toArray();
      for (const old of same) {
        if (old.clientId !== s.clientId && old.syncState === "synced") await db.submissions.delete(old.clientId);
      }
      await db.submissions.put({
        clientId: s.clientId,
        councilId,
        kind: s.kind,
        period: s.period,
        areaLabel: s.areaLabel,
        payload: s.payload as Record<string, unknown>,
        payloadVersion: s.payloadVersion,
        clientSubmittedAt: s.clientSubmittedAt,
        submittedAt: s.submittedAt,
        syncState: "synced",
        auto: s.auto,
        late: s.late,
        revision: s.revision,
        reopened: s.reopened,
      });
    }
  });
}

async function pullChanges(councilId: string): Promise<void> {
  const key = `cursor:${councilId}`;
  let since = (await getMeta<number>(key)) ?? 0;
  for (;;) {
    const page = await convex.query(api.sync.pullChanges, { councilId: councilId as Id<"councils">, since });
    await db.transaction("rw", db.records, async () => {
      for (const r of page.records) {
        const local = await db.records.get(r.clientId);
        if (local && (local.syncState === "pending" || local.clientUpdatedAt > r.clientUpdatedAt)) continue;
        const row: LocalRecord = {
          clientId: r.clientId,
          councilId,
          type: r.type,
          section: r.section,
          areaId: r.areaId ?? undefined,
          occurredAt: r.occurredAt,
          payload: r.payload as Record<string, unknown>,
          payloadVersion: r.payloadVersion,
          geo: r.geo ?? undefined,
          deletedAt: r.deletedAt ?? undefined,
          clientUpdatedAt: r.clientUpdatedAt,
          serverUpdatedAt: r.serverUpdatedAt,
          syncState: "synced",
        };
        await db.records.put(row);
      }
    });
    since = page.cursor;
    await setMeta(key, since);
    if (!page.hasMore) break;
  }
}

/** Mount once inside the signed-in shell. */
export function useSyncEngine(councilId: string, enabled: boolean): SyncReport & { running: boolean; pending: number } {
  const { isAuthenticated } = useConvexAuth();
  const [report, setReport] = useState<SyncReport>({});
  const [running, setRunning] = useState(false);
  const busy = useRef(false);
  const pending = useLiveQuery(
    async () =>
      (await db.records.where("[councilId+syncState]").equals([councilId, "pending"]).count()) +
      (await db.submissions.where("[councilId+syncState]").equals([councilId, "pending"]).count()),
    [councilId],
    0,
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      if (busy.current || !navigator.onLine || !isAuthenticated) return;
      busy.current = true;
      setRunning(true);
      try {
        const { updateRequired } = await pushPending(councilId);
        await pushSubmissions(councilId);
        await pullChanges(councilId);
        await pullSubmissions(councilId);
        if (!cancelled) setReport({ lastSyncedAt: Date.now(), updateRequired });
      } catch (e) {
        if (!cancelled) setReport((r) => ({ ...r, lastError: e instanceof Error ? e.message : String(e) }));
      } finally {
        busy.current = false;
        if (!cancelled) setRunning(false);
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void run();
    void run();
    window.addEventListener(SYNC_EVENT, run);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(run, INTERVAL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener(SYNC_EVENT, run);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [councilId, enabled, isAuthenticated]);

  return { ...report, running, pending };
}
