import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/guards";
import { writeAudit } from "./lib/audit";
import { vClientMeta } from "./lib/validators";

/** Called by convex-auth once, when an account is created. */
export const createUser = internalMutation({
  args: {
    method: v.object({ name: v.literal("usernamePassword"), profile: v.object({}) }),
  },
  returns: v.id("users"),
  handler: async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { createdAt: now });
    await writeAudit(ctx, null, {
      action: "user.signUp",
      entity: "users",
      entityId: userId,
      actorIdOverride: userId,
    });
    return userId;
  },
});

/** Called by convex-auth on every sign-in, including the first. */
export const onSignIn = internalMutation({
  args: {
    method: v.object({ name: v.literal("usernamePassword"), profile: v.object({}) }),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    await ctx.db.patch(userId, { lastSignInAt: Date.now() });
    await writeAudit(ctx, null, {
      action: "user.signIn",
      entity: "users",
      entityId: userId,
      actorIdOverride: userId,
      actorIsRootOverride: user.isRoot === true,
    });
    return null;
  },
});

/**
 * Everything the apps need to decide what to show: the profile and every
 * membership with its council. Root learns it is root; nobody else sees the flag.
 */
export const me = authedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx.viewer;
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const withCouncil = await Promise.all(
      memberships.map(async (m) => {
        const council = await ctx.db.get(m.councilId);
        return {
          _id: m._id,
          councilId: m.councilId,
          councilName: council?.name ?? "",
          role: m.role,
          requestedRole: m.requestedRole ?? null,
          status: m.status,
          primarySection: m.primarySection,
          sections: m.sections,
          level: m.level ?? null,
          areaIds: m.areaIds,
          decisionNote: m.decisionNote ?? null,
        };
      }),
    );
    return {
      userId: user._id,
      name: user.name ?? null,
      phone: user.phone ?? null,
      ...(user.isRoot ? { isRoot: true as const } : {}),
      memberships: withCouncil,
    };
  },
});

export const updateProfile = authedMutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    client: v.optional(vClientMeta),
  },
  handler: async (ctx, { name, phone, client }) => {
    const { user } = ctx.viewer;
    const clean = name.trim();
    if (clean.length < 3) throw new Error("Jina ni fupi mno.");
    const before = { name: user.name, phone: user.phone };
    await ctx.db.patch(user._id, { name: clean, phone: phone?.trim() || undefined });
    await writeAudit(ctx, ctx.viewer, {
      action: "user.updateProfile",
      entity: "users",
      entityId: user._id,
      before,
      after: { name: clean, phone },
      client,
    });
    return null;
  },
});
