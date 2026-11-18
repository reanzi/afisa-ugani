/**
 * Operator functions. Internal: callable only from the CLI or the Convex
 * dashboard by someone holding the deployment key, never from a client.
 *
 *   npx convex run admin:makeRoot '{"username":"0712345678"}'
 *   npx convex run admin:createCouncil '{"name":"Halmashauri ya Wilaya ya Mvomero","code":"MVOMERO-DC","region":"Morogoro"}'
 *   npx convex run admin:setMinClientVersion '{"version":"0.2.0"}'
 */
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { vRole, vSection } from "./lib/validators";

export const makeRoot = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const userId = await ctx.runQuery(components.authUsername.public.getUserIdByUsername, { username });
    if (userId === null) throw new Error(`No account with username ${username}`);
    const id = ctx.db.normalizeId("users", userId);
    if (!id) throw new Error("Unexpected user id");
    await ctx.db.patch(id, { isRoot: true });
    await writeAudit(ctx, null, {
      action: "user.makeRoot",
      entity: "users",
      entityId: id,
      actorIsRootOverride: true,
    });
    return id;
  },
});

export const createCouncil = internalMutation({
  args: { name: v.string(), code: v.string(), region: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const existing = await ctx.db.query("councils").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (existing) return existing._id;
    const id = await ctx.db.insert("councils", {
      name: args.name.trim(),
      code,
      region: args.region.trim(),
      status: "active",
      registrationOpen: true,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, null, { action: "council.create", entity: "councils", entityId: id, councilId: id, actorIsRootOverride: true });
    return id;
  },
});

/**
 * Seat the first Head of Department of a council, so the approval chain can
 * start. Afterwards, roles are handed out from HQ.
 */
export const seatMember = internalMutation({
  args: {
    username: v.string(),
    councilCode: v.string(),
    role: vRole,
    primarySection: vSection,
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rawId = await ctx.runQuery(components.authUsername.public.getUserIdByUsername, { username: args.username });
    const userId = rawId === null ? null : ctx.db.normalizeId("users", rawId);
    if (!userId) throw new Error(`No account with username ${args.username}`);
    const council = await ctx.db
      .query("councils")
      .withIndex("by_code", (q) => q.eq("code", args.councilCode.trim().toUpperCase()))
      .unique();
    if (!council) throw new Error(`No council ${args.councilCode}`);
    if (args.name) await ctx.db.patch(userId, { name: args.name });
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user_council", (q) => q.eq("userId", userId).eq("councilId", council._id))
      .unique();
    const doc = {
      role: args.role,
      status: "active" as const,
      primarySection: args.primarySection,
      sections: [args.primarySection],
      decidedAt: Date.now(),
    };
    const id = existing
      ? (await ctx.db.patch(existing._id, doc), existing._id)
      : await ctx.db.insert("memberships", {
          ...doc,
          userId,
          councilId: council._id,
          areaIds: [],
          requestedAt: Date.now(),
        });
    await writeAudit(ctx, null, {
      action: "membership.seat",
      entity: "memberships",
      entityId: id,
      councilId: council._id,
      section: args.primarySection,
      after: doc,
      actorIsRootOverride: true,
    });
    return id;
  },
});

export const setMinClientVersion = internalMutation({
  args: { version: v.string() },
  handler: async (ctx, { version }) => {
    const row = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", "minClientVersion")).unique();
    if (row) await ctx.db.patch(row._id, { value: version });
    else await ctx.db.insert("settings", { key: "minClientVersion", value: version });
    await writeAudit(ctx, null, { action: "settings.minClientVersion", entity: "settings", after: { version }, actorIsRootOverride: true });
    return null;
  },
});
