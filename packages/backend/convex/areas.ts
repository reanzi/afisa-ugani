import { v } from "convex/values";
import { canManageAreas } from "@afisa/shared";
import { fail, hqMutation, memberQuery, rootMutation } from "./lib/guards";
import type { Id } from "./_generated/dataModel";
import { writeAudit } from "./lib/audit";
import { vAreaKind } from "./lib/validators";

/** Wards and villages of the council. Every active member may read them. */
export const list = memberQuery({
  args: {},
  handler: async (ctx) => {
    const { councilId } = ctx.viewer;
    const [wards, villages] = await Promise.all([
      ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", councilId).eq("kind", "ward")).collect(),
      ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", councilId).eq("kind", "village")).collect(),
    ]);
    const live = [...wards, ...villages].filter((a) => a.archivedAt === undefined);
    return live
      .map((a) => ({ _id: a._id, kind: a.kind, name: a.name, parentId: a.parentId ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = hqMutation({
  args: {
    kind: vAreaKind,
    name: v.string(),
    parentId: v.optional(v.id("areas")),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    if (!canManageAreas(viewer.actor)) fail("FORBIDDEN", "Huna ruhusa ya kuongeza maeneo.");
    const name = args.name.trim();
    if (name.length < 2) fail("INVALID", "Jina la eneo ni fupi mno.");
    if (args.kind === "street") fail("INVALID", "Barabara na vitongoji huingizwa kutoka faili la anwani la NaPA.");
    if (args.kind === "village") {
      if (!args.parentId) fail("INVALID", "Kijiji kinahitaji kata yake.");
      const ward = await ctx.db.get(args.parentId);
      if (!ward || ward.councilId !== viewer.councilId || ward.kind !== "ward") {
        fail("INVALID", "Kata haipo katika halmashauri hii.");
      }
    } else if (args.parentId) {
      fail("INVALID", "Kata haina eneo mzazi.");
    }
    const doc = { councilId: viewer.councilId, kind: args.kind, name, parentId: args.parentId };
    const id = await ctx.db.insert("areas", doc);
    await writeAudit(ctx, viewer, { action: "area.create", entity: "areas", entityId: id, after: doc });
    return id;
  },
});

export const rename = hqMutation({
  args: { areaId: v.id("areas"), name: v.string() },
  handler: async (ctx, { areaId, name }) => {
    const { viewer } = ctx;
    if (!canManageAreas(viewer.actor)) fail("FORBIDDEN", "Huna ruhusa ya kubadili maeneo.");
    const area = await ctx.db.get(areaId);
    if (!area || area.councilId !== viewer.councilId) fail("NOT_FOUND", "Eneo halipo.");
    const clean = name.trim();
    if (clean.length < 2) fail("INVALID", "Jina la eneo ni fupi mno.");
    await ctx.db.patch(areaId, { name: clean });
    await writeAudit(ctx, viewer, {
      action: "area.rename",
      entity: "areas",
      entityId: areaId,
      before: { name: area.name },
      after: { name: clean },
    });
    return null;
  },
});

const vNapaStreet = v.object({
  name: v.string(),
  kind: v.optional(v.string()),
  surface: v.optional(v.string()),
  addresses: v.optional(v.number()),
});

/**
 * Root: load one ward of a NaPA address report (ward → villages/mitaa →
 * roads and hamlets). Called once per ward so each call stays small. Matching
 * is by name within the parent, so importing an updated report again updates
 * address counts instead of making duplicates.
 */
export const importNapaWard = rootMutation({
  args: {
    councilId: v.id("councils"),
    ward: v.object({
      name: v.string(),
      villages: v.array(v.object({ name: v.string(), streets: v.array(vNapaStreet) })),
    }),
  },
  handler: async (ctx, { councilId, ward }) => {
    const council = await ctx.db.get(councilId);
    if (!council) fail("NOT_FOUND", "Halmashauri haipo.");
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const counts = { wardsAdded: 0, villagesAdded: 0, streetsAdded: 0, streetsUpdated: 0 };

    const wards = await ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", councilId).eq("kind", "ward")).collect();
    let wardId: Id<"areas"> | undefined = wards.find((w) => same(w.name, ward.name) && w.archivedAt === undefined)?._id;
    if (!wardId) {
      wardId = await ctx.db.insert("areas", { councilId, kind: "ward", name: ward.name.trim() });
      counts.wardsAdded++;
    }
    const villages = await ctx.db.query("areas").withIndex("by_parent", (q) => q.eq("parentId", wardId)).collect();
    for (const village of ward.villages) {
      let villageId: Id<"areas"> | undefined = villages.find((x) => same(x.name, village.name) && x.kind === "village")?._id;
      if (!villageId) {
        villageId = await ctx.db.insert("areas", { councilId, kind: "village", name: village.name.trim(), parentId: wardId });
        counts.villagesAdded++;
      }
      const streets = await ctx.db.query("areas").withIndex("by_parent", (q) => q.eq("parentId", villageId)).collect();
      for (const st of village.streets) {
        const meta = { streetKind: st.kind || undefined, surface: st.surface || undefined, addresses: st.addresses };
        const existing = streets.find((x) => same(x.name, st.name) && x.kind === "street");
        if (existing) {
          if (existing.addresses !== meta.addresses || existing.streetKind !== meta.streetKind || existing.surface !== meta.surface) {
            await ctx.db.patch(existing._id, meta);
            counts.streetsUpdated++;
          }
        } else {
          await ctx.db.insert("areas", { councilId, kind: "street", name: st.name.trim(), parentId: villageId, ...meta });
          counts.streetsAdded++;
        }
      }
    }
    await writeAudit(ctx, ctx.viewer, {
      action: "area.importNapa",
      entity: "areas",
      entityId: wardId,
      councilId,
      after: { ward: ward.name, ...counts },
    });
    return counts;
  },
});

/** Root: record that a NaPA import finished, with the report date and totals shown in HQ. */
export const finishNapaImport = rootMutation({
  args: {
    councilId: v.id("councils"),
    reportDate: v.optional(v.string()),
    totals: v.object({ wards: v.number(), villages: v.number(), streets: v.number(), addresses: v.number() }),
  },
  handler: async (ctx, { councilId, reportDate, totals }) => {
    const council = await ctx.db.get(councilId);
    if (!council) fail("NOT_FOUND", "Halmashauri haipo.");
    const addressImport = { reportDate, importedAt: Date.now(), ...totals };
    await ctx.db.patch(councilId, { addressImport });
    await writeAudit(ctx, ctx.viewer, {
      action: "council.addressImport",
      entity: "councils",
      entityId: councilId,
      councilId,
      before: council.addressImport ?? null,
      after: addressImport,
    });
    return null;
  },
});

/** Roads and hamlets of one village, for HQ and (later) for a precise "where" in the Field app. */
export const streets = memberQuery({
  args: { villageId: v.id("areas") },
  handler: async (ctx, { villageId }) => {
    const village = await ctx.db.get(villageId);
    if (!village || village.councilId !== ctx.viewer.councilId) return [];
    const rows = await ctx.db.query("areas").withIndex("by_parent", (q) => q.eq("parentId", villageId)).collect();
    return rows
      .filter((r) => r.kind === "street" && r.archivedAt === undefined)
      .map((r) => ({ _id: r._id, name: r.name, kind: r.streetKind ?? null, surface: r.surface ?? null, addresses: r.addresses ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
