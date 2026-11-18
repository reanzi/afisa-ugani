import { v } from "convex/values";
import { canManageAreas } from "@afisa/shared";
import { fail, hqMutation, memberQuery } from "./lib/guards";
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
