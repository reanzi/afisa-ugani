/**
 * Reports officers send to HQ. Field records never leave the officer's
 * control; a submission is the officer's deliberate, frozen summary of them.
 */
import { v } from "convex/values";
import { canViewMembership, validateFoodReport } from "@afisa/shared";
import { fail, hiddenUserIds, hqQuery, memberMutation, memberQuery } from "./lib/guards";
import { writeAudit } from "./lib/audit";

const vKind = v.literal("food_prices");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const submit = memberMutation({
  args: {
    clientId: v.string(),
    kind: vKind,
    period: v.string(),
    areaLabel: v.string(),
    payload: v.any(),
    payloadVersion: v.number(),
    clientSubmittedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    if (!UUID_RE.test(args.clientId)) fail("INVALID", "Kitambulisho cha ripoti si sahihi.");
    if (!PERIOD_RE.test(args.period)) fail("INVALID", "Kipindi cha ripoti si sahihi.");
    const problem = validateFoodReport(args.payload);
    if (problem) fail("INVALID", `Ripoti haijakamilika (${problem}).`);

    // A retry after a lost response returns the first result.
    const existing = await ctx.db.query("submissions").withIndex("by_clientId", (q) => q.eq("clientId", args.clientId)).unique();
    if (existing) {
      if (existing.ownerId !== viewer.userId) fail("FORBIDDEN", "Ripoti hii si yako.");
      return { revision: existing.revision, submittedAt: existing.submittedAt };
    }

    const earlier = await ctx.db
      .query("submissions")
      .withIndex("by_owner_kind_period", (q) => q.eq("ownerId", viewer.userId).eq("kind", args.kind).eq("period", args.period))
      .collect();
    const mine = earlier.filter((s) => s.councilId === viewer.councilId);
    const revision = mine.length + 1;
    const submittedAt = Date.now();
    const id = await ctx.db.insert("submissions", {
      councilId: viewer.councilId,
      ownerId: viewer.userId,
      clientId: args.clientId,
      kind: args.kind,
      period: args.period,
      revision,
      officerName: viewer.user.name ?? "",
      areaLabel: args.areaLabel.trim().slice(0, 200),
      areaIds: viewer.membership?.areaIds ?? [],
      primarySection: viewer.membership?.primarySection ?? "kilimo",
      payload: args.payload,
      payloadVersion: args.payloadVersion,
      clientSubmittedAt: args.clientSubmittedAt,
      submittedAt,
    });
    await writeAudit(ctx, viewer, {
      action: revision > 1 ? "submission.resubmit" : "submission.create",
      entity: "submissions",
      entityId: id,
      section: viewer.membership?.primarySection,
      after: { kind: args.kind, period: args.period, revision, rows: (args.payload as { rows: unknown[] }).rows.length },
      occurredAt: args.clientSubmittedAt,
    });
    return { revision, submittedAt };
  },
});

/** The officer's own sends of one kind, newest first (to restore status on a new phone). */
export const mine = memberQuery({
  args: { kind: vKind },
  handler: async (ctx, { kind }) => {
    const { viewer } = ctx;
    const rows = await ctx.db
      .query("submissions")
      .withIndex("by_owner_kind_period", (q) => q.eq("ownerId", viewer.userId).eq("kind", kind))
      .order("desc")
      .take(60);
    return rows
      .filter((s) => s.councilId === viewer.councilId)
      .map((s) => ({ clientId: s.clientId, period: s.period, revision: s.revision, submittedAt: s.submittedAt }));
  },
});

/** Periods for which HQ has received reports of this kind, newest first. */
export const periodsForHq = hqQuery({
  args: { kind: vKind },
  handler: async (ctx, { kind }) => {
    const rows = await ctx.db
      .query("submissions")
      .withIndex("by_council_kind_period", (q) => q.eq("councilId", ctx.viewer.councilId).eq("kind", kind))
      .order("desc")
      .take(1000);
    return [...new Set(rows.map((r) => r.period))].sort().reverse().slice(0, 24);
  },
});

/**
 * Submitted reports for one period: the latest revision from each officer the
 * viewer may see (department: everyone; section leads: their section).
 */
export const forHq = hqQuery({
  args: { kind: vKind, period: v.string() },
  handler: async (ctx, { kind, period }) => {
    const { viewer } = ctx;
    const rows = await ctx.db
      .query("submissions")
      .withIndex("by_council_kind_period", (q) => q.eq("councilId", viewer.councilId).eq("kind", kind).eq("period", period))
      .collect();
    const hidden = await hiddenUserIds(ctx, viewer);
    const latest = new Map<string, (typeof rows)[number]>();
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (hidden.has(r.ownerId)) continue;
      counts.set(r.ownerId, (counts.get(r.ownerId) ?? 0) + 1);
      const cur = latest.get(r.ownerId);
      if (!cur || r.revision > cur.revision) latest.set(r.ownerId, r);
    }
    const out = [];
    for (const r of latest.values()) {
      const m = await ctx.db
        .query("memberships")
        .withIndex("by_user_council", (q) => q.eq("userId", r.ownerId).eq("councilId", viewer.councilId))
        .unique();
      const target = m
        ? { userId: m.userId, role: m.role, status: m.status, primarySection: m.primarySection, sections: m.sections }
        : { userId: r.ownerId, role: "officer" as const, status: "active" as const, primarySection: r.primarySection, sections: [r.primarySection] };
      if (!canViewMembership(viewer.actor, target)) continue;
      out.push({
        _id: r._id,
        officerName: r.officerName,
        areaLabel: r.areaLabel,
        primarySection: r.primarySection,
        revision: r.revision,
        sends: counts.get(r.ownerId) ?? 1,
        submittedAt: r.submittedAt,
        payload: r.payload as { rows: { commodity: string; unit: string; average: number; min: number; max: number; count: number; availability: string | null }[]; note?: string },
      });
    }
    return out.sort((a, b) => a.areaLabel.localeCompare(b.areaLabel));
  },
});
