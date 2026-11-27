/**
 * Council totals (members by status, Head of Department, live wards/villages/
 * streets), kept on the council row so root's council list reads one row per
 * council instead of every membership and area in the country.
 *
 * Kept up to date by triggers (lib/functions.ts) on every write to
 * memberships and areas made through our mutation builders:
 * - memberships: the council's member totals are recounted (a few hundred rows,
 *   and membership changes are rare);
 * - areas: totals move by one per change, because an address import writes
 *   thousands of areas in one go.
 * A council without totals yet gets them counted in full on its first change,
 * or by the one-off backfill below.
 */
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

type Ctx = GenericMutationCtx<DataModel>;
type QCtx = GenericQueryCtx<DataModel>;
export type CouncilStats = NonNullable<Doc<"councils">["stats"]>;
type AreaKind = "ward" | "village" | "street";
const AREA_KEY: Record<AreaKind, "wards" | "villages" | "streets"> = { ward: "wards", village: "villages", street: "streets" };

async function memberTotals(ctx: QCtx, councilId: Id<"councils">) {
  const rows = await ctx.db
    .query("memberships")
    .withIndex("by_council_status", (q) => q.eq("councilId", councilId))
    .collect();
  const t = { active: 0, pending: 0, suspended: 0, rejected: 0 };
  let headUserId: Id<"users"> | undefined;
  for (const m of rows) {
    t[m.status]++;
    if (!headUserId && m.status === "active" && m.role === "admin") {
      const user = await ctx.db.get(m.userId);
      if (user && !user.isRoot) headUserId = m.userId;
    }
  }
  return { ...t, headUserId };
}

async function areaTotals(ctx: QCtx, councilId: Id<"councils">) {
  const out = { wards: 0, villages: 0, streets: 0 };
  for (const kind of ["ward", "village", "street"] as const) {
    for await (const a of ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", councilId).eq("kind", kind))) {
      if (a.archivedAt === undefined) out[AREA_KEY[kind]]++;
    }
  }
  return out;
}

/** Every total, counted from scratch. */
export async function countCouncilStats(ctx: QCtx, councilId: Id<"councils">): Promise<CouncilStats> {
  return { ...(await memberTotals(ctx, councilId)), ...(await areaTotals(ctx, councilId)) };
}

export const triggers = new Triggers<DataModel>();

triggers.register("memberships", async (ctx, change) => {
  const councilIds = new Set([change.oldDoc?.councilId, change.newDoc?.councilId].filter((x): x is Id<"councils"> => !!x));
  for (const councilId of councilIds) {
    const council = await ctx.innerDb.get(councilId);
    if (!council) continue; // the council itself is being deleted (wipe)
    const stats = council.stats ? { ...council.stats, ...(await memberTotals(ctx, councilId)) } : await countCouncilStats(ctx, councilId);
    if (!stats.headUserId) delete stats.headUserId;
    await ctx.innerDb.patch(councilId, { stats });
  }
});

const isLive = (a: Doc<"areas"> | null) => !!a && a.archivedAt === undefined;

triggers.register("areas", async (ctx, change) => {
  const doc = change.newDoc ?? change.oldDoc;
  if (!doc) return;
  const council = await ctx.innerDb.get(doc.councilId);
  if (!council) return;
  if (!council.stats) {
    await ctx.innerDb.patch(council._id, { stats: await countCouncilStats(ctx, council._id) });
    return; // counted after this change, so nothing more to add
  }
  const stats = { ...council.stats };
  if (isLive(change.oldDoc)) stats[AREA_KEY[change.oldDoc!.kind as AreaKind]]--;
  if (isLive(change.newDoc)) stats[AREA_KEY[change.newDoc!.kind as AreaKind]]++;
  if (stats.wards !== council.stats.wards || stats.villages !== council.stats.villages || stats.streets !== council.stats.streets) {
    await ctx.innerDb.patch(council._id, { stats });
  }
});

/** Totals for a list: the stored ones, or counted now for a council that has none yet. */
export async function statsOf(ctx: QCtx, council: Doc<"councils">): Promise<CouncilStats> {
  return council.stats ?? (await countCouncilStats(ctx, council._id));
}

export type { Ctx as StatsMutationCtx };
