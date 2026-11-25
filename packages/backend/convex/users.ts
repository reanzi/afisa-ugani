import { v } from "convex/values";
import { internalMutation, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { authedMutation, authedQuery } from "./lib/guards";
import { writeAudit } from "./lib/audit";
import { vClientMeta } from "./lib/validators";
import { cleanName, isFullName, isValidPhone, normalizePhone, POLICY_VERSION, presentMaybe, presentName, storeName } from "@afisa/shared";

/** The sign-in name, when it is a check number (accounts made before check numbers may use a phone or a word). */
async function checkNumberOf(ctx: QueryCtx, userId: Id<"users">): Promise<string | null> {
  const username = await ctx.runQuery(components.authUsername.public.getUsername, { userId });
  return username && /^\d{5,12}$/.test(username) && !/^0[67]\d{8}$/.test(username) ? username : null;
}

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
    // The sign-in name is the check number; keep a copy on the user for HQ lists.
    const checkNumber = (await checkNumberOf(ctx, userId)) ?? undefined;
    await ctx.db.patch(userId, { lastSignInAt: Date.now(), ...(checkNumber && checkNumber !== user.checkNumber ? { checkNumber } : {}) });
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
          councilName: presentName(council?.name),
          councilDisplayName: presentMaybe(council?.displayName),
          autoSend: { food: council?.autoSend?.food ?? false, monthly: council?.autoSend?.monthly ?? false },
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
      name: presentMaybe(user.name),
      phone: user.phone ?? null,
      checkNumber: user.checkNumber ?? (await checkNumberOf(ctx, user._id)),
      policyVersion: user.policyVersion ?? null,
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
    const clean = cleanName(name);
    if (!isFullName(clean)) throw new Error("Andika jina kamili: majina mawili au zaidi.");
    const tel = phone?.trim() ? normalizePhone(phone) : undefined;
    if (tel && !isValidPhone(tel)) throw new Error("Namba ya simu si sahihi.");
    const before = { name: user.name, phone: user.phone };
    const checkNumber = user.checkNumber ?? (await checkNumberOf(ctx, user._id)) ?? undefined;
    await ctx.db.patch(user._id, { name: storeName(clean), phone: tel, checkNumber });
    await writeAudit(ctx, ctx.viewer, {
      action: "user.updateProfile",
      entity: "users",
      entityId: user._id,
      before,
      after: { name: clean, phone: tel },
      client,
    });
    return null;
  },
});

/** Agree to the usage policy (once per version). Device time is kept for offline agreement. */
export const acceptPolicy = authedMutation({
  args: { version: v.string(), acceptedAt: v.number(), client: v.optional(vClientMeta) },
  handler: async (ctx, { version, acceptedAt }) => {
    const { user } = ctx.viewer;
    if (version !== POLICY_VERSION) throw new Error("Toleo la sera si la sasa. Sasisha programu.");
    if (user.policyVersion === version) return null;
    const at = Math.min(acceptedAt, Date.now());
    await ctx.db.patch(user._id, { policyVersion: version, policyAcceptedAt: at });
    await writeAudit(ctx, ctx.viewer, {
      action: "user.acceptPolicy",
      entity: "users",
      entityId: user._id,
      after: { policyVersion: version },
      occurredAt: at,
    });
    return null;
  },
});
