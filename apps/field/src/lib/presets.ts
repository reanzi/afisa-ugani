/**
 * Presets (like the yield of each crop) and yearly plans on the phone.
 * Proposals are saved here first and sent with the next sync; a section lead
 * approves them in HQ. Calculations use approved values only.
 */
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ConvexError } from "convex/values";
import { v7 as uuidv7 } from "uuid";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { parsePlanKey, presetDef, presetSection, type ProductionPlan, type Section } from "@afisa/shared";
import { clientMeta, convex } from "./client";
import { db, type LocalPreset } from "./db";
import { requestSync } from "./sync";

const idOf = (councilId: string, key: string) => `${councilId}|${key}`;

export async function proposePreset(councilId: string, key: string, value: unknown): Promise<void> {
  const section = presetSection(key);
  if (!section) throw new Error(`Kiwango kisichojulikana: ${key}`);
  const id = idOf(councilId, key);
  const existing = await db.presets.get(id);
  await db.presets.put({
    ...(existing ?? {}),
    id,
    councilId,
    key,
    section,
    value,
    status: existing?.approvedValue !== undefined && JSON.stringify(existing.approvedValue) === JSON.stringify(value) ? "approved" : "pending",
    note: undefined,
    error: undefined,
    clientId: uuidv7(),
    proposedAt: Date.now(),
    syncState: "pending",
  });
  requestSync();
}

export function usePresetRows(councilId: string): LocalPreset[] | undefined {
  return useLiveQuery(() => db.presets.where("councilId").equals(councilId).toArray(), [councilId]);
}

export type Approved = {
  /** Approved numeric presets by key. */
  values: Record<string, number>;
  /** Approved yields by crop. */
  yields: Record<string, number>;
  /** Approved plans: plans[fy][section]. */
  plans: Record<string, Partial<Record<Section, ProductionPlan>>>;
};

export function approvedFrom(rows: readonly LocalPreset[]): Approved {
  const out: Approved = { values: {}, yields: {}, plans: {} };
  for (const r of rows) {
    if (r.approvedValue === undefined || r.approvedValue === null) continue;
    if (presetDef(r.key) && typeof r.approvedValue === "number") {
      out.values[r.key] = r.approvedValue;
      if (r.key.startsWith("tija:")) out.yields[r.key.slice(5)] = r.approvedValue;
    }
    const plan = parsePlanKey(r.key);
    if (plan) (out.plans[plan.fy] ??= {})[plan.section] = r.approvedValue as ProductionPlan;
  }
  return out;
}

export function useApproved(councilId: string): Approved | undefined {
  const rows = usePresetRows(councilId);
  return useMemo(() => (rows ? approvedFrom(rows) : undefined), [rows]);
}

/** Send proposals waiting on the phone. A refused one is marked, not retried. */
export async function pushPresets(councilId: string): Promise<void> {
  const queued = await db.presets.where("[councilId+syncState]").equals([councilId, "pending"]).toArray();
  for (const p of queued) {
    try {
      const res = await convex.mutation(api.presets.propose, {
        councilId: councilId as Id<"councils">,
        client: await clientMeta(),
        clientId: p.clientId,
        key: p.key,
        value: p.value,
        proposedAt: p.proposedAt,
      });
      const now = await db.presets.get(p.id);
      if (now?.clientId === p.clientId) await db.presets.update(p.id, { syncState: "synced", status: res.status });
    } catch (e) {
      if (e instanceof ConvexError) {
        const data = e.data as { message?: string } | undefined;
        await db.presets.update(p.id, { syncState: "rejected", error: data?.message ?? "Imekataliwa" });
      } else {
        throw e;
      }
    }
  }
}

/** Approvals and rejections from HQ come down here. */
export async function pullPresets(councilId: string): Promise<void> {
  const rows = await convex.query(api.presets.mine, { councilId: councilId as Id<"councils"> });
  await db.transaction("rw", db.presets, async () => {
    for (const r of rows) {
      const id = idOf(councilId, r.key);
      const local = await db.presets.get(id);
      const approval = {
        approvedValue: r.approvedValue ?? undefined,
        approvedAt: r.approvedAt ?? undefined,
        approvedByName: r.approvedByName ?? undefined,
      };
      if (local && local.syncState === "pending" && local.clientId !== r.clientId) {
        // A newer proposal on the phone: keep it, but learn what is approved.
        await db.presets.update(id, approval);
        continue;
      }
      await db.presets.put({
        id,
        councilId,
        key: r.key,
        section: r.section,
        value: r.value,
        status: r.status,
        ...approval,
        note: r.note ?? undefined,
        clientId: r.clientId,
        proposedAt: r.proposedAt,
        syncState: "synced",
      });
    }
  });
}
