/**
 * Officers' presets and yearly production plans, with approval by the section
 * lead. HQ sees them (unlike raw records): they are settings that shape the
 * officer's reports, so they are checked before they are used.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  canApprovePreset,
  canViewMembership,
  canWriteSection,
  parsePlanKey,
  presetDef,
  presetSection,
  validatePreset,
  type ProductionPlan,
  type Section, presentMaybe, presentName
} from "@afisa/shared";
import { fail, hiddenUserIds, hqMutation, hqQuery, memberMutation, memberQuery } from "./lib/guards";
import { writeAudit } from "./lib/audit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const vStatus = v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"));

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const propose = memberMutation({
  args: { clientId: v.string(), key: v.string(), value: v.any(), proposedAt: v.number() },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    if (!UUID_RE.test(args.clientId)) fail("INVALID", "Kitambulisho si sahihi.");
    const problem = validatePreset(args.key, args.value);
    if (problem) fail("INVALID", `Thamani si sahihi (${problem}).`);
    const section = presetSection(args.key)!;
    if (!canWriteSection(viewer.actor, section)) fail("FORBIDDEN", "Sehemu hii si yako.");

    const now = Date.now();
    const proposedAt = Math.min(args.proposedAt, now);
    const existing = await ctx.db
      .query("presets")
      .withIndex("by_owner_council_key", (q) => q.eq("ownerId", viewer.userId).eq("councilId", viewer.councilId).eq("key", args.key))
      .unique();

    if (existing) {
      if (existing.clientId === args.clientId) return { status: existing.status };
      if (existing.approvedValue !== undefined && same(existing.approvedValue, args.value)) {
        // Back to the value already approved: nothing to approve.
        await ctx.db.patch(existing._id, { value: args.value, status: "approved", note: undefined, clientId: args.clientId, proposedAt, updatedAt: now });
        return { status: "approved" as const };
      }
      await ctx.db.patch(existing._id, { value: args.value, status: "pending", note: undefined, clientId: args.clientId, proposedAt, updatedAt: now });
      await writeAudit(ctx, viewer, {
        action: "preset.propose",
        entity: "presets",
        entityId: existing._id,
        section,
        before: { value: existing.value, status: existing.status },
        after: { key: args.key, value: args.value },
        occurredAt: proposedAt,
      });
      return { status: "pending" as const };
    }

    const id = await ctx.db.insert("presets", {
      councilId: viewer.councilId,
      ownerId: viewer.userId,
      key: args.key,
      section,
      value: args.value,
      status: "pending",
      clientId: args.clientId,
      proposedAt,
      updatedAt: now,
    });
    await writeAudit(ctx, viewer, {
      action: "preset.propose",
      entity: "presets",
      entityId: id,
      section,
      after: { key: args.key, value: args.value },
      occurredAt: proposedAt,
    });
    return { status: "pending" as const };
  },
});

function view(p: Doc<"presets">) {
  return {
    key: p.key,
    section: p.section,
    value: p.value as unknown,
    status: p.status,
    approvedValue: (p.approvedValue ?? null) as unknown,
    approvedAt: p.approvedAt ?? null,
    approvedByName: presentMaybe(p.approvedByName),
    note: p.note ?? null,
    clientId: p.clientId,
    proposedAt: p.proposedAt,
    updatedAt: p.updatedAt,
  };
}

/** The viewer's own presets and plans in this council. */
export const mine = memberQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("presets")
      .withIndex("by_owner_council_key", (q) => q.eq("ownerId", ctx.viewer.userId).eq("councilId", ctx.viewer.councilId))
      .collect();
    return rows.map(view);
  },
});

/** Council-wide defaults by key (numeric presets only). */
export async function councilDefaultsOf(ctx: QueryCtx, councilId: Id<"councils">): Promise<Record<string, number>> {
  const rows = await ctx.db
    .query("councilPresets")
    .withIndex("by_council_key", (q) => q.eq("councilId", councilId))
    .collect();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Approved values of one officer, over the council's defaults: yields by
 * crop, and plans by section for a financial year.
 */
export async function approvedPresetsOf(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  councilId: Id<"councils">,
  fy?: string,
): Promise<{ values: Record<string, number>; yields: Record<string, number>; plans: Partial<Record<Section, ProductionPlan>> }> {
  const rows = await ctx.db
    .query("presets")
    .withIndex("by_owner_council_key", (q) => q.eq("ownerId", ownerId).eq("councilId", councilId))
    .collect();
  const values: Record<string, number> = { ...(await councilDefaultsOf(ctx, councilId)) };
  const yields: Record<string, number> = {};
  for (const [k, val] of Object.entries(values)) if (k.startsWith("tija:")) yields[k.slice(5)] = val;
  const plans: Partial<Record<Section, ProductionPlan>> = {};
  for (const r of rows) {
    if (r.approvedValue === undefined) continue;
    if (typeof r.approvedValue === "number" && presetDef(r.key)) {
      values[r.key] = r.approvedValue;
      if (r.key.startsWith("tija:")) yields[r.key.slice(5)] = r.approvedValue;
    }
    const plan = parsePlanKey(r.key);
    if (plan && (!fy || plan.fy === fy)) plans[plan.section] = r.approvedValue as ProductionPlan;
  }
  return { values, yields, plans };
}

/**
 * Presets and plans of the officers the viewer may see. For yields, the
 * council's average of approved values helps the approver judge a proposal.
 */
export const forHq = hqQuery({
  args: { status: v.optional(vStatus) },
  handler: async (ctx, { status }) => {
    const { viewer } = ctx;
    const rows = status
      ? await ctx.db
          .query("presets")
          .withIndex("by_council_status", (q) => q.eq("councilId", viewer.councilId).eq("status", status))
          .collect()
      : await ctx.db
          .query("presets")
          .withIndex("by_council_status", (q) => q.eq("councilId", viewer.councilId))
          .collect();
    const hidden = await hiddenUserIds(ctx, viewer);
    const people = new Map<string, { name: string; area: string; visible: boolean }>();
    const averages = new Map<string, number | null>();

    const out = [];
    for (const r of rows) {
      if (hidden.has(r.ownerId)) continue;
      if (!people.has(r.ownerId)) {
        const m = await ctx.db
          .query("memberships")
          .withIndex("by_user_council", (q) => q.eq("userId", r.ownerId).eq("councilId", viewer.councilId))
          .unique();
        const user = await ctx.db.get(r.ownerId);
        const areas = m ? await Promise.all(m.areaIds.slice(0, 3).map((id) => ctx.db.get(id))) : [];
        people.set(r.ownerId, {
          name: presentName(user?.name) || "—",
          area: areas.filter(Boolean).map((a) => presentName(a!.name)).join(", "),
          visible: m
            ? canViewMembership(viewer.actor, { userId: m.userId, role: m.role, status: m.status, primarySection: m.primarySection, sections: m.sections })
            : false,
        });
      }
      const who = people.get(r.ownerId)!;
      if (!who.visible) continue;

      let councilAverage: number | null = null;
      if (presetDef(r.key) && typeof r.value === "number") {
        if (!averages.has(r.key)) {
          const same = (
            await ctx.db
              .query("presets")
              .withIndex("by_council_key", (q) => q.eq("councilId", viewer.councilId).eq("key", r.key))
              .collect()
          ).filter((x) => typeof x.approvedValue === "number");
          averages.set(r.key, same.length ? same.reduce((a, x) => a + (x.approvedValue as number), 0) / same.length : null);
        }
        councilAverage = averages.get(r.key) ?? null;
      }
      // A plan's targets read better with the officer's approved yields next to them.
      const yields = parsePlanKey(r.key) ? (await approvedPresetsOf(ctx, r.ownerId, viewer.councilId)).yields : null;

      out.push({
        _id: r._id,
        officerName: who.name,
        areaLabel: who.area,
        ...view(r),
        councilAverage,
        yields,
        canDecide: canApprovePreset(viewer.actor, r.section),
      });
    }
    return out.sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.proposedAt - a.proposedAt);
  },
});

export const decide = hqMutation({
  args: { presetId: v.id("presets"), approve: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, { presetId, approve, note }) => {
    const { viewer } = ctx;
    const p = await ctx.db.get(presetId);
    if (!p || p.councilId !== viewer.councilId) fail("NOT_FOUND", "Haipo.");
    if (!canApprovePreset(viewer.actor, p.section)) fail("FORBIDDEN", "Huna mamlaka ya kuidhinisha viwango vya sehemu hii.");
    if (p.status !== "pending") fail("INVALID", "Hili limeshaamuliwa.");
    const now = Date.now();
    const byName = presentName(viewer.user.name);
    if (approve) {
      await ctx.db.patch(p._id, { status: "approved", approvedValue: p.value, approvedAt: now, approvedByName: viewer.isRoot ? "" : byName, note: undefined, updatedAt: now });
    } else {
      const reason = note?.trim();
      if (!reason) fail("INVALID", "Andika sababu ya kukataa, ili afisa ajue cha kurekebisha.");
      await ctx.db.patch(p._id, { status: "rejected", note: reason.slice(0, 500), updatedAt: now });
    }
    await writeAudit(ctx, viewer, {
      action: approve ? "preset.approve" : "preset.reject",
      entity: "presets",
      entityId: p._id,
      section: p.section,
      before: { approvedValue: p.approvedValue },
      after: { key: p.key, value: p.value, note: approve ? undefined : note },
    });
    return null;
  },
});

/** The council's defaults, for the phone: used where the officer has no approved value of their own. */
export const councilDefaults = memberQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("councilPresets")
      .withIndex("by_council_key", (q) => q.eq("councilId", ctx.viewer.councilId))
      .collect();
    return rows.map((r) => ({ key: r.key, value: r.value, setByName: presentName(r.setByName), updatedAt: r.updatedAt }));
  },
});

/** Council defaults for HQ, with who may change each. */
export const councilDefaultsForHq = hqQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("councilPresets")
      .withIndex("by_council_key", (q) => q.eq("councilId", ctx.viewer.councilId))
      .collect();
    return {
      values: rows.map((r) => ({ key: r.key, value: r.value, setByName: presentName(r.setByName), updatedAt: r.updatedAt })),
      canEdit: canApprovePreset(ctx.viewer.actor, "kilimo"),
    };
  },
});

/** Set (or clear, with null) a council-wide default. Kilimo leads, the HoD and vice, or root. */
export const setCouncilDefault = hqMutation({
  args: { key: v.string(), value: v.union(v.number(), v.null()) },
  handler: async (ctx, { key, value }) => {
    const { viewer } = ctx;
    const def = presetDef(key);
    if (!def || !key.startsWith("tija:")) fail("INVALID", "Kiwango hiki hakiwekwi kwa halmashauri nzima.");
    if (!canApprovePreset(viewer.actor, def.section)) fail("FORBIDDEN", "Huna mamlaka ya kuweka viwango vya sehemu hii.");
    if (value !== null) {
      const problem = validatePreset(key, value);
      if (problem) fail("INVALID", `Thamani si sahihi (${problem}).`);
    }
    const existing = await ctx.db
      .query("councilPresets")
      .withIndex("by_council_key", (q) => q.eq("councilId", viewer.councilId).eq("key", key))
      .unique();
    const now = Date.now();
    const byName = viewer.isRoot ? "" : presentName(viewer.user.name);
    if (value === null) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.patch(existing._id, { value, setById: viewer.userId, setByName: byName, updatedAt: now });
    } else {
      await ctx.db.insert("councilPresets", { councilId: viewer.councilId, key, value, setById: viewer.userId, setByName: byName, updatedAt: now });
    }
    await writeAudit(ctx, viewer, {
      action: "council.preset",
      entity: "councilPresets",
      entityId: key,
      section: def.section,
      before: { value: existing?.value },
      after: { value },
    });
    return null;
  },
});
