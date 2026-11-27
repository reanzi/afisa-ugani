/**
 * Every public function goes through one of these builders. Never export a
 * raw `query`/`mutation` that touches app data.
 *
 * - authedQuery / authedMutation: signed in; no council needed (profile, joining).
 * - memberQuery / memberMutation: active membership in `councilId` (or root).
 * - hqQuery / hqMutation: as member, and the role may use HQ.
 *
 * The builders consume `councilId` (and the optional `client` metadata) and
 * hand the handler a `ctx.viewer` describing who is acting and what they may
 * touch. Rules themselves live in @afisa/shared/permissions.
 */
import { ConvexError, v } from "convex/values";
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { getAuthUserId } from "@convex-dev/auth/server";
import { canUseHq, workingSections, authoritySections, type Actor } from "@afisa/shared";
import { query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "../_generated/dataModel";
import { vClientMeta } from "./validators";

export type ClientMeta = typeof vClientMeta.type;

export type ErrorCode =
  | "NOT_AUTHENTICATED"
  | "NOT_A_MEMBER"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID";

export function fail(code: ErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}

export type AuthedViewer = {
  user: Doc<"users">;
  userId: Id<"users">;
  isRoot: boolean;
  client?: ClientMeta;
};

export type MemberViewer = AuthedViewer & {
  councilId: Id<"councils">;
  /** Null only for root acting in a council where they hold no membership. */
  membership: Doc<"memberships"> | null;
  actor: Actor;
  /** Sections whose records the viewer may write. */
  working: ReturnType<typeof workingSections>;
  /** Sections the viewer leads (approve people, grant the section). */
  authority: ReturnType<typeof authoritySections>;
};

async function loadAuthed(ctx: QueryCtx): Promise<AuthedViewer> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) fail("NOT_AUTHENTICATED", "Tafadhali ingia kwanza.");
  const user = await ctx.db.get(userId);
  if (user === null) fail("NOT_AUTHENTICATED", "Akaunti haipo.");
  return { user, userId, isRoot: user.isRoot === true };
}

export function toActor(viewer: AuthedViewer, membership: Doc<"memberships"> | null): Actor {
  return {
    userId: viewer.userId,
    isRoot: viewer.isRoot,
    role: membership?.role ?? null,
    status: membership?.status ?? null,
    primarySection: membership?.primarySection ?? null,
    sections: membership?.sections ?? [],
  };
}

async function loadMember(
  ctx: QueryCtx,
  councilId: Id<"councils">,
  requireHq: boolean,
): Promise<MemberViewer> {
  const base = await loadAuthed(ctx);
  const council = await ctx.db.get(councilId);
  if (council === null) fail("NOT_FOUND", "Halmashauri haipo.");
  if (council.status !== "active" && !base.isRoot) {
    fail("FORBIDDEN", "Halmashauri hii imesitishwa.");
  }
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_council", (q) => q.eq("userId", base.userId).eq("councilId", councilId))
    .unique();
  if (membership === null && !base.isRoot) {
    fail("NOT_A_MEMBER", "Wewe si mwanachama wa halmashauri hii.");
  }
  if (membership !== null && membership.status !== "active" && !base.isRoot) {
    fail("MEMBERSHIP_NOT_ACTIVE", "Akaunti yako bado haijaidhinishwa au imesitishwa.");
  }
  const actor = toActor(base, membership);
  if (requireHq && !canUseHq(actor)) {
    fail("FORBIDDEN", "Huna ruhusa ya kutumia mfumo wa makao makuu.");
  }
  return {
    ...base,
    councilId,
    membership,
    actor,
    working: workingSections(actor),
    authority: authoritySections(actor),
  };
}

export const authedQuery = customQuery(query, {
  args: {},
  input: async (ctx) => ({ ctx: { viewer: await loadAuthed(ctx) }, args: {} }),
});

export const authedMutation = customMutation(mutation, {
  args: { client: v.optional(vClientMeta) },
  input: async (ctx: MutationCtx, { client }) => {
    const viewer = await loadAuthed(ctx);
    return { ctx: { viewer: { ...viewer, client } }, args: {} };
  },
});

export const memberQuery = customQuery(query, {
  args: { councilId: v.id("councils") },
  input: async (ctx, { councilId }) => ({
    ctx: { viewer: await loadMember(ctx, councilId, false) },
    args: {},
  }),
});

export const memberMutation = customMutation(mutation, {
  args: { councilId: v.id("councils"), client: v.optional(vClientMeta) },
  input: async (ctx: MutationCtx, { councilId, client }) => {
    const viewer = await loadMember(ctx, councilId, false);
    return { ctx: { viewer: { ...viewer, client } }, args: {} };
  },
});

export const hqQuery = customQuery(query, {
  args: { councilId: v.id("councils") },
  input: async (ctx, { councilId }) => ({
    ctx: { viewer: await loadMember(ctx, councilId, true) },
    args: {},
  }),
});

export const hqMutation = customMutation(mutation, {
  args: { councilId: v.id("councils"), client: v.optional(vClientMeta) },
  input: async (ctx: MutationCtx, { councilId, client }) => {
    const viewer = await loadMember(ctx, councilId, true);
    return { ctx: { viewer: { ...viewer, client } }, args: {} };
  },
});

/** Root only, and invisible: same error as any other forbidden call. */
export const rootMutation = customMutation(mutation, {
  args: { client: v.optional(vClientMeta) },
  input: async (ctx: MutationCtx, { client }) => {
    const viewer = await loadAuthed(ctx);
    if (!viewer.isRoot) fail("FORBIDDEN", "Huna ruhusa.");
    return { ctx: { viewer: { ...viewer, client } }, args: {} };
  },
});

export const rootQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    const viewer = await loadAuthed(ctx);
    if (!viewer.isRoot) fail("FORBIDDEN", "Huna ruhusa.");
    return { ctx: { viewer }, args: {} };
  },
});

/** Users whose identity must stay hidden from this viewer. */
export async function hiddenUserIds(ctx: QueryCtx, viewer: AuthedViewer): Promise<Set<string>> {
  if (viewer.isRoot) return new Set();
  // Root accounts are few; a full scan of this tiny filter is acceptable. If it
  // grows, add an index on isRoot.
  const roots = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("isRoot"), true))
    .collect();
  return new Set(roots.map((u) => u._id));
}
