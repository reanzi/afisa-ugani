import { v } from "convex/values";
import { query } from "./_generated/server";
import { authedQuery, fail, rootMutation, rootQuery } from "./lib/guards";
import { writeAudit } from "./lib/audit";

/**
 * Councils open for registration. Public on purpose: the registration screen
 * lists them before the officer has an approved membership. Returns names only.
 */
export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    const councils = await ctx.db
      .query("councils")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return councils
      .filter((c) => c.registrationOpen)
      .map((c) => ({ _id: c._id, name: c.name, region: c.region }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Councils the viewer can open in HQ: their memberships, or all for root. */
export const listMine = authedQuery({
  args: {},
  handler: async (ctx) => {
    const { viewer } = ctx;
    if (viewer.isRoot) {
      const all = await ctx.db.query("councils").collect();
      return all.map((c) => ({ _id: c._id, name: c.name, region: c.region, status: c.status }));
    }
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
      .collect();
    const councils = await Promise.all(memberships.map((m) => ctx.db.get(m.councilId)));
    return councils
      .filter((c) => c !== null)
      .map((c) => ({ _id: c._id, name: c.name, region: c.region, status: c.status }));
  },
});

/** Inviting a new council is a root action. */
export const create = rootMutation({
  args: {
    name: v.string(),
    code: v.string(),
    region: v.string(),
    registrationOpen: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const existing = await ctx.db
      .query("councils")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (existing) fail("INVALID", "Msimbo huu wa halmashauri tayari upo.");
    const doc = {
      name: args.name.trim(),
      code,
      region: args.region.trim(),
      status: "active" as const,
      registrationOpen: args.registrationOpen ?? true,
      createdAt: Date.now(),
    };
    const id = await ctx.db.insert("councils", doc);
    await writeAudit(ctx, ctx.viewer, {
      action: "council.create",
      entity: "councils",
      entityId: id,
      councilId: id,
      after: doc,
    });
    return id;
  },
});

/** Council name for a code, so the HQ sign-up form can confirm it before sending. */
export const lookupByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 3 || clean.length > 40) return null;
    const c = await ctx.db.query("councils").withIndex("by_code", (q) => q.eq("code", clean)).unique();
    if (!c || c.status !== "active") return null;
    return { name: c.name, region: c.region };
  },
});

/** Every council with member counts (root only). */
export const listAll = rootQuery({
  args: {},
  handler: async (ctx) => {
    const councils = await ctx.db.query("councils").collect();
    return Promise.all(
      councils.map(async (c) => {
        const count = async (status: "active" | "pending") =>
          (await ctx.db.query("memberships").withIndex("by_council_status", (q) => q.eq("councilId", c._id).eq("status", status)).collect()).length;
        return {
          _id: c._id,
          name: c.name,
          code: c.code,
          region: c.region,
          status: c.status,
          registrationOpen: c.registrationOpen,
          active: await count("active"),
          pending: await count("pending"),
          createdAt: c.createdAt,
        };
      }),
    );
  },
});

export const update = rootMutation({
  args: {
    councilId: v.id("councils"),
    name: v.optional(v.string()),
    region: v.optional(v.string()),
    registrationOpen: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
  },
  handler: async (ctx, { councilId, ...changes }) => {
    const c = await ctx.db.get(councilId);
    if (!c) fail("NOT_FOUND", "Halmashauri haipo.");
    const patch = Object.fromEntries(
      Object.entries(changes)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
    );
    await ctx.db.patch(councilId, patch);
    await writeAudit(ctx, ctx.viewer, {
      action: "council.update",
      entity: "councils",
      entityId: councilId,
      councilId,
      before: Object.fromEntries(Object.keys(patch).map((k) => [k, (c as Record<string, unknown>)[k]])),
      after: patch,
    });
    return null;
  },
});
