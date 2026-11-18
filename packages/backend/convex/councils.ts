import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { DEPARTMENT_ROLES, generateCouncilCode, isValidCouncilCode, normalizeCouncilCode } from "@afisa/shared";
import { authedQuery, fail, hqMutation, hqQuery, rootMutation, rootQuery } from "./lib/guards";
import { writeAudit } from "./lib/audit";

/** Crypto-backed random integer in [0, n). */
function randomInt(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]! % n;
}

/** A fresh 8-character code that no council uses yet. */
export async function newCouncilCode(ctx: QueryCtx): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateCouncilCode(randomInt);
    const taken = await ctx.db.query("councils").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (!taken) return code;
  }
  throw new Error("Could not find a free council code");
}

/**
 * Find a council by what someone typed: "abcd-ef12", "ABCDEF12"… Older codes
 * made before the 8-character format (e.g. "BAMOYO") still match exactly.
 */
export async function findCouncilByCode(ctx: QueryCtx | MutationCtx, typed: string): Promise<Doc<"councils"> | null> {
  const code = normalizeCouncilCode(typed);
  if (code.length < 3) return null;
  const hit = await ctx.db.query("councils").withIndex("by_code", (q) => q.eq("code", code)).unique();
  if (hit) return hit;
  const legacy = typed.trim().toUpperCase();
  return legacy === code ? null : await ctx.db.query("councils").withIndex("by_code", (q) => q.eq("code", legacy)).unique();
}

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
      return all.map((c) => ({ _id: c._id, name: c.name, displayName: c.displayName ?? null, region: c.region, status: c.status }));
    }
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
      .collect();
    const councils = await Promise.all(memberships.map((m) => ctx.db.get(m.councilId)));
    return councils
      .filter((c) => c !== null)
      .map((c) => ({ _id: c._id, name: c.name, displayName: c.displayName ?? null, region: c.region, status: c.status }));
  },
});

/** Inviting a new council is a root action. The code is generated: 8 characters, unique. */
export const create = rootMutation({
  args: {
    name: v.string(),
    displayName: v.optional(v.string()),
    region: v.string(),
    registrationOpen: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const displayName = args.displayName?.trim() || undefined;
    if (name.length < 3) fail("INVALID", "Andika jina kamili la halmashauri.");
    if (args.region.trim().length < 2) fail("INVALID", "Andika mkoa.");
    const code = await newCouncilCode(ctx);
    const doc = {
      name,
      ...(displayName ? { displayName } : {}),
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
    return { councilId: id, code };
  },
});

/** Issue a new code (e.g. to replace an old-format one, or one that leaked). The old code stops working. */
export const regenerateCode = rootMutation({
  args: { councilId: v.id("councils") },
  handler: async (ctx, { councilId }) => {
    const c = await ctx.db.get(councilId);
    if (!c) fail("NOT_FOUND", "Halmashauri haipo.");
    const code = await newCouncilCode(ctx);
    await ctx.db.patch(councilId, { code });
    await writeAudit(ctx, ctx.viewer, {
      action: "council.regenerateCode",
      entity: "councils",
      entityId: councilId,
      councilId,
      before: { code: c.code },
      after: { code },
    });
    return code;
  },
});

/** Council name for a code, so the HQ sign-up form can confirm it before sending. */
export const lookupByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    if (code.length > 40) return null;
    const c = await findCouncilByCode(ctx, code);
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
          displayName: c.displayName ?? null,
          code: c.code,
          region: c.region,
          status: c.status,
          registrationOpen: c.registrationOpen,
          validCode: isValidCouncilCode(c.code),
          addressImport: c.addressImport ?? null,
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
    displayName: v.optional(v.string()),
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
        .map(([k, v]) => [k, typeof v === "string" ? v.trim() || (k === "displayName" ? undefined : v.trim()) : v]),
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

/** Council settings shown in HQ. */
export const settings = hqQuery({
  args: {},
  handler: async (ctx) => {
    const c = await ctx.db.get(ctx.viewer.councilId);
    const { actor } = ctx.viewer;
    return {
      name: c?.name ?? "",
      displayName: c?.displayName ?? null,
      autoSend: { food: c?.autoSend?.food ?? false, monthly: c?.autoSend?.monthly ?? false },
      canEdit: actor.isRoot || (actor.role !== null && DEPARTMENT_ROLES.includes(actor.role)),
    };
  },
});

/** Head of Department (or vice HoD, or root): reports send themselves on their due dates. */
export const setAutoSend = hqMutation({
  args: { food: v.boolean(), monthly: v.boolean() },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const { actor } = viewer;
    if (!(actor.isRoot || (actor.role !== null && DEPARTMENT_ROLES.includes(actor.role)))) {
      fail("FORBIDDEN", "Ni Mkuu wa Idara au Naibu wake tu wanaoweza kubadili mpangilio huu.");
    }
    const c = await ctx.db.get(viewer.councilId);
    const autoSend = { food: args.food, monthly: args.monthly };
    await ctx.db.patch(viewer.councilId, { autoSend });
    await writeAudit(ctx, viewer, {
      action: "council.autoSend",
      entity: "councils",
      entityId: viewer.councilId,
      before: c?.autoSend ?? { food: false, monthly: false },
      after: autoSend,
    });
    return null;
  },
});

/** A shorter name for screens (Head of Department, vice, or root). Empty clears it. */
export const setDisplayName = hqMutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const { viewer } = ctx;
    const { actor } = viewer;
    if (!(actor.isRoot || (actor.role !== null && DEPARTMENT_ROLES.includes(actor.role)))) {
      fail("FORBIDDEN", "Ni Mkuu wa Idara au Naibu wake tu wanaoweza kubadili jina fupi.");
    }
    const clean = displayName.trim().replace(/\s+/g, " ");
    if (clean.length > 40) fail("INVALID", "Jina fupi lisizidi herufi 40.");
    const c = await ctx.db.get(viewer.councilId);
    await ctx.db.patch(viewer.councilId, { displayName: clean || undefined });
    await writeAudit(ctx, viewer, {
      action: "council.displayName",
      entity: "councils",
      entityId: viewer.councilId,
      before: { displayName: c?.displayName },
      after: { displayName: clean || undefined },
    });
    return null;
  },
});
