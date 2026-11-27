/**
 * Slaughterhouses: registered by the Head of Department, the vice or the
 * livestock section head; offered to officers when recording slaughter.
 * Places officers record that are not registered are kept (name, village,
 * GPS) for HQ to register; registering one links the records made there.
 */
import { v } from "convex/values";
import { canReopenReport, placeKey, presentMaybe, presentName, storeName, UNREGISTERED_PLACE } from "@afisa/shared";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, hqMutation, hqQuery, memberQuery, type MemberViewer } from "./lib/guards";
import { writeAudit } from "./lib/audit";

const vKind = v.union(v.literal("machinjio"), v.literal("slab"), v.literal("kuku"), v.literal("nyingine"));
const vDetails = {
  name: v.string(),
  kind: vKind,
  areaId: v.id("areas"),
  servesAreaIds: v.array(v.id("areas")),
  servesAll: v.boolean(),
  geo: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  licence: v.optional(v.string()),
};
type Details = {
  name: string;
  kind: Doc<"slaughterhouses">["kind"];
  areaId: Id<"areas">;
  servesAreaIds: Id<"areas">[];
  servesAll: boolean;
  geo?: { lat: number; lng: number };
  licence?: string;
};

const view = (h: Doc<"slaughterhouses">) => ({
  _id: h._id,
  name: presentName(h.name),
  kind: h.kind,
  areaId: h.areaId,
  servesAreaIds: h.servesAreaIds,
  servesAll: h.servesAll,
  geo: h.geo ?? null,
  licence: h.licence ?? null,
  status: h.status,
});

/** The council's slaughterhouses, for the phone (offline cache) and HQ. */
export const list = memberQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("slaughterhouses").withIndex("by_council", (q) => q.eq("councilId", ctx.viewer.councilId)).collect();
    return rows.map(view).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listForHq = hqQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("slaughterhouses").withIndex("by_council", (q) => q.eq("councilId", ctx.viewer.councilId)).collect();
    return {
      canEdit: canReopenReport(ctx.viewer.actor, "mifugo"),
      houses: rows.map(view).sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

/** Unregistered places officers have recorded, newest first. */
export const places = hqQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("slaughterPlaces")
      .withIndex("by_council_status", (q) => q.eq("councilId", ctx.viewer.councilId).eq("status", "open"))
      .collect();
    const out = [];
    for (const p of rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt)) {
      const user = await ctx.db.get(p.reportedBy);
      out.push({
        _id: p._id,
        name: presentName(p.name),
        areaId: p.areaId ?? null,
        geo: p.geo ?? null,
        uses: p.uses,
        firstSeenAt: p.firstSeenAt,
        lastSeenAt: p.lastSeenAt,
        reportedBy: presentMaybe(user?.name) ?? "—",
      });
    }
    return out;
  },
});

function mustManage(viewer: MemberViewer) {
  if (!canReopenReport(viewer.actor, "mifugo")) fail("FORBIDDEN", "Ni Mkuu wa Idara, Naibu wake au mkuu wa sehemu ya mifugo tu wanaoweza kusajili machinjio.");
}

async function checkDetails(ctx: MutationCtx, viewer: MemberViewer, d: Details, selfId?: Id<"slaughterhouses">) {
  const name = storeName(d.name);
  if (name.length < 2) fail("INVALID", "Jina la machinjio ni fupi mno.");
  if (name.length > 120) fail("INVALID", "Jina la machinjio ni refu mno.");
  const inCouncil = async (id: Id<"areas">) => {
    const a = await ctx.db.get(id);
    if (!a || a.councilId !== viewer.councilId || a.archivedAt !== undefined) fail("INVALID", "Eneo halipo kwenye halmashauri hii.");
  };
  await inCouncil(d.areaId);
  const serves = [...new Set(d.servesAreaIds)].filter((id) => id !== d.areaId);
  if (serves.length > 200) fail("INVALID", "Maeneo ni mengi mno.");
  for (const id of serves) await inCouncil(id);
  if (d.geo && (Math.abs(d.geo.lat) > 90 || Math.abs(d.geo.lng) > 180)) fail("INVALID", "Mahali (GPS) si sahihi.");
  const licence = d.licence?.trim().slice(0, 60) || undefined;
  const same = (await ctx.db.query("slaughterhouses").withIndex("by_council", (q) => q.eq("councilId", viewer.councilId)).collect()).find(
    (h) => h._id !== selfId && h.name === name && h.areaId === d.areaId,
  );
  if (same) fail("INVALID", "Machinjio yenye jina hili tayari yamesajiliwa kwenye eneo hili.");
  return { name, kind: d.kind, areaId: d.areaId, servesAreaIds: serves, servesAll: d.servesAll, geo: d.geo, licence };
}

/** Slaughter records looked at per step; the rest go to a scheduled job, so a big council never hits the read limits. */
const LINK_PAGE = 400;

/**
 * Point officers' records made at an unregistered place to the slaughterhouse
 * it became, one page at a time. The phones pick the change up on their next sync.
 */
async function linkPage(ctx: MutationCtx, councilId: Id<"councils">, key: string, house: { _id: Id<"slaughterhouses">; name: string }, cursor: string | null) {
  const page = await ctx.db
    .query("records")
    .withIndex("by_council_type_occurred", (q) => q.eq("councilId", councilId).eq("type", "slaughter"))
    .paginate({ cursor, numItems: LINK_PAGE });
  const now = Date.now();
  let linked = 0;
  for (const r of page.page) {
    if (r.deletedAt) continue;
    const p = r.payload as Record<string, unknown>;
    if (p.slaughterhouseId !== UNREGISTERED_PLACE || typeof p.slaughterhouse !== "string") continue;
    if (placeKey(p.slaughterhouse, r.areaId) !== key) continue;
    await ctx.db.patch(r._id, { payload: { ...p, slaughterhouseId: house._id, slaughterhouse: presentName(house.name) }, serverUpdatedAt: now });
    linked++;
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(0, internal.slaughterhouses.linkRest, { councilId, key, houseId: house._id, name: house.name, cursor: page.continueCursor });
  }
  return { linked, more: !page.isDone };
}

export const linkRest = internalMutation({
  args: { councilId: v.id("councils"), key: v.string(), houseId: v.id("slaughterhouses"), name: v.string(), cursor: v.string() },
  handler: async (ctx, { councilId, key, houseId, name, cursor }) => {
    return (await linkPage(ctx, councilId, key, { _id: houseId, name }, cursor)).linked;
  },
});

export const create = hqMutation({
  args: vDetails,
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    mustManage(viewer);
    const clean = await checkDetails(ctx, viewer, args);
    const now = Date.now();
    const id = await ctx.db.insert("slaughterhouses", { councilId: viewer.councilId, ...clean, status: "active", createdBy: viewer.userId, createdAt: now, updatedAt: now });
    await writeAudit(ctx, viewer, { action: "slaughterhouse.create", entity: "slaughterhouses", entityId: id, section: "mifugo", after: { name: clean.name, areaId: clean.areaId } });
    return id;
  },
});

export const update = hqMutation({
  args: { slaughterhouseId: v.id("slaughterhouses"), ...vDetails, status: v.union(v.literal("active"), v.literal("closed")) },
  handler: async (ctx, { slaughterhouseId, status, ...details }) => {
    const { viewer } = ctx;
    mustManage(viewer);
    const h = await ctx.db.get(slaughterhouseId);
    if (!h || h.councilId !== viewer.councilId) fail("NOT_FOUND", "Machinjio hayapo.");
    const clean = await checkDetails(ctx, viewer, details, slaughterhouseId);
    await ctx.db.patch(slaughterhouseId, { ...clean, status, updatedAt: Date.now() });
    await writeAudit(ctx, viewer, {
      action: "slaughterhouse.update",
      entity: "slaughterhouses",
      entityId: slaughterhouseId,
      section: "mifugo",
      before: { name: h.name, areaId: h.areaId, status: h.status },
      after: { name: clean.name, areaId: clean.areaId, status },
    });
    return null;
  },
});

/** Register an unregistered place: a new slaughterhouse, and its earlier records linked to it. */
export const registerPlace = hqMutation({
  args: { placeId: v.id("slaughterPlaces"), ...vDetails },
  handler: async (ctx, { placeId, ...details }) => {
    const { viewer } = ctx;
    mustManage(viewer);
    const place = await ctx.db.get(placeId);
    if (!place || place.councilId !== viewer.councilId || place.status !== "open") fail("NOT_FOUND", "Mahali hapa hapapo tena.");
    const clean = await checkDetails(ctx, viewer, details);
    const now = Date.now();
    const id = await ctx.db.insert("slaughterhouses", { councilId: viewer.councilId, ...clean, status: "active", createdBy: viewer.userId, createdAt: now, updatedAt: now });
    await ctx.db.patch(placeId, { status: "registered", slaughterhouseId: id });
    const { linked, more } = await linkPage(ctx, viewer.councilId, place.key, { _id: id, name: clean.name }, null);
    await writeAudit(ctx, viewer, {
      action: "slaughterhouse.register",
      entity: "slaughterhouses",
      entityId: id,
      section: "mifugo",
      before: { place: place.name },
      after: { name: clean.name, areaId: clean.areaId, linked },
    });
    return { slaughterhouseId: id, linked, more };
  },
});

/** Not a slaughter place worth registering (a typo, a one-off): hide it from the list. */
export const dismissPlace = hqMutation({
  args: { placeId: v.id("slaughterPlaces") },
  handler: async (ctx, { placeId }) => {
    const { viewer } = ctx;
    mustManage(viewer);
    const place = await ctx.db.get(placeId);
    if (!place || place.councilId !== viewer.councilId) fail("NOT_FOUND", "Mahali hapa hapapo tena.");
    await ctx.db.patch(placeId, { status: "dismissed" });
    await writeAudit(ctx, viewer, { action: "slaughterhouse.dismissPlace", entity: "slaughterPlaces", entityId: placeId, section: "mifugo", after: { name: place.name } });
    return null;
  },
});

/**
 * Called by sync for each slaughter record at an unregistered place: keep
 * the place for HQ. If HQ has since registered it, link the record at once.
 */
export async function notePlace(
  ctx: MutationCtx,
  viewer: MemberViewer,
  record: { _id: Id<"records">; areaId?: Id<"areas">; payload: Record<string, unknown>; geo?: { lat: number; lng: number; accuracy: number } },
  isNew: boolean,
) {
  const name = typeof record.payload.slaughterhouse === "string" ? record.payload.slaughterhouse.trim() : "";
  if (!name) return;
  const key = placeKey(name, record.areaId);
  const existing = await ctx.db
    .query("slaughterPlaces")
    .withIndex("by_council_key", (q) => q.eq("councilId", viewer.councilId).eq("key", key))
    .unique();
  const now = Date.now();
  const geo = record.geo ? { lat: record.geo.lat, lng: record.geo.lng, accuracy: record.geo.accuracy } : undefined;
  if (!existing) {
    await ctx.db.insert("slaughterPlaces", {
      councilId: viewer.councilId,
      key,
      name: storeName(name),
      areaId: record.areaId,
      geo,
      reportedBy: viewer.userId,
      uses: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      status: "open",
    });
    return;
  }
  // Keep the most precise location seen.
  const betterGeo = geo && (!existing.geo || geo.accuracy < existing.geo.accuracy) ? geo : existing.geo;
  await ctx.db.patch(existing._id, { uses: existing.uses + (isNew ? 1 : 0), lastSeenAt: now, geo: betterGeo });
  if (existing.status === "registered" && existing.slaughterhouseId) {
    const house = await ctx.db.get(existing.slaughterhouseId);
    if (house) {
      await ctx.db.patch(record._id, {
        payload: { ...record.payload, slaughterhouseId: house._id, slaughterhouse: presentName(house.name) },
        serverUpdatedAt: now,
      });
    }
  }
}
