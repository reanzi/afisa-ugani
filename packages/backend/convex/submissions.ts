/**
 * Reports officers send to HQ. Field records never leave the officer's
 * control; a submission is a frozen summary of them. Once a report for a
 * period is sent (by the officer, or by auto-send on the due date) it is
 * sealed: one report per officer, kind and period.
 */
import { v } from "convex/values";
import {
  canViewMembership,
  foodCycle,
  monthlyWindow,
  toCouncilWallClock,
  validateFoodReport,
  validateMonthlyReport,
  type Target,
} from "@afisa/shared";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, hiddenUserIds, hqQuery, memberMutation, memberQuery, type MemberViewer } from "./lib/guards";
import { writeAudit } from "./lib/audit";

export const vKind = v.union(v.literal("food_prices"), v.literal("monthly"));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Due date of a report, in council wall-clock time (see toCouncilWallClock). */
export function dueOf(kind: Doc<"submissions">["kind"], period: string): number {
  return kind === "food_prices" ? foodCycle(period).due : monthlyWindow(period).due;
}

export async function findSubmission(ctx: QueryCtx, ownerId: Id<"users">, councilId: Id<"councils">, kind: Doc<"submissions">["kind"], period: string) {
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_owner_kind_period", (q) => q.eq("ownerId", ownerId).eq("kind", kind).eq("period", period))
    .collect();
  return rows.find((r) => r.councilId === councilId) ?? null;
}

/** "Kijiji cha Changarawe, Kata ya Mzumbe" from a membership's assigned areas. */
export async function areaLabelOf(ctx: QueryCtx, m: Doc<"memberships"> | null, fallback: string): Promise<string> {
  if (!m || m.areaIds.length === 0) return fallback;
  const names: string[] = [];
  for (const id of m.areaIds) {
    const a = await ctx.db.get(id);
    if (a) names.push(a.kind === "ward" ? `Kata ya ${a.name}` : `Kijiji cha ${a.name}`);
  }
  return names.join(", ") || fallback;
}

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
    const problem = args.kind === "food_prices" ? validateFoodReport(args.payload) : validateMonthlyReport(args.payload, args.period);
    if (problem) fail("INVALID", `Ripoti haijakamilika (${problem}).`);

    const now = toCouncilWallClock(Date.now());
    if (args.kind === "monthly" && now < monthlyWindow(args.period).opens) {
      fail("INVALID", "Ripoti ya mwezi hutumwa baada ya mwezi kuisha.");
    }

    const existing = await findSubmission(ctx, viewer.userId, viewer.councilId, args.kind, args.period);
    if (existing) {
      // A retry after a lost response gets the first result; anything else is refused.
      if (existing.clientId === args.clientId) return { revision: existing.revision, submittedAt: existing.submittedAt, late: existing.late ?? false };
      fail("INVALID", "Ripoti ya kipindi hiki imeshatumwa na imefungwa.");
    }

    const who = {
      councilId: viewer.councilId,
      userId: viewer.userId,
      name: viewer.user.name ?? "",
      areaIds: viewer.membership?.areaIds ?? [],
      primarySection: viewer.membership?.primarySection ?? ("kilimo" as const),
    };
    return await insertSubmission(ctx, who, viewer, {
      clientId: args.clientId,
      kind: args.kind,
      period: args.period,
      areaLabel: args.areaLabel,
      payload: args.payload,
      payloadVersion: args.payloadVersion,
      clientSubmittedAt: args.clientSubmittedAt,
      auto: false,
    });
  },
});

type NewSubmission = {
  clientId: string;
  kind: Doc<"submissions">["kind"];
  period: string;
  areaLabel: string;
  payload: unknown;
  payloadVersion: number;
  clientSubmittedAt: number;
  auto: boolean;
};

export type SubmissionOwner = {
  councilId: Id<"councils">;
  userId: Id<"users">;
  name: string;
  areaIds: Id<"areas">[];
  primarySection: Doc<"memberships">["primarySection"];
};

/** Store a report. `viewer` is the officer sending it, or null when auto-send acts on the due date. */
export async function insertSubmission(ctx: MutationCtx, who: SubmissionOwner, viewer: MemberViewer | null, s: NewSubmission) {
  const submittedAt = Date.now();
  const late = toCouncilWallClock(submittedAt) > dueOf(s.kind, s.period);
  const id = await ctx.db.insert("submissions", {
    councilId: who.councilId,
    ownerId: who.userId,
    clientId: s.clientId,
    kind: s.kind,
    period: s.period,
    revision: 1,
    auto: s.auto || undefined,
    late: late || undefined,
    officerName: who.name,
    areaLabel: s.areaLabel.trim().slice(0, 200),
    areaIds: who.areaIds,
    primarySection: who.primarySection,
    payload: s.payload,
    payloadVersion: s.payloadVersion,
    clientSubmittedAt: s.clientSubmittedAt,
    submittedAt,
  });
  await writeAudit(ctx, viewer, {
    action: s.auto ? "submission.auto" : "submission.create",
    entity: "submissions",
    entityId: id,
    councilId: who.councilId,
    section: who.primarySection,
    after: { kind: s.kind, period: s.period, late, officer: who.name },
    occurredAt: s.clientSubmittedAt,
  });
  return { revision: 1, submittedAt, late };
}

/** The officer's own reports (to show sealed reports, including auto-sent ones, on any phone). */
export const mine = memberQuery({
  args: { kind: v.optional(vKind) },
  handler: async (ctx, { kind }) => {
    const { viewer } = ctx;
    const kinds = kind ? [kind] : (["food_prices", "monthly"] as const);
    const out = [];
    for (const k of kinds) {
      const rows = await ctx.db
        .query("submissions")
        .withIndex("by_owner_kind_period", (q) => q.eq("ownerId", viewer.userId).eq("kind", k))
        .order("desc")
        .take(24);
      for (const s of rows) {
        if (s.councilId !== viewer.councilId) continue;
        out.push({
          clientId: s.clientId,
          kind: s.kind,
          period: s.period,
          areaLabel: s.areaLabel,
          payload: s.payload,
          payloadVersion: s.payloadVersion,
          clientSubmittedAt: s.clientSubmittedAt,
          submittedAt: s.submittedAt,
          auto: s.auto ?? false,
          late: s.late ?? false,
        });
      }
    }
    return out;
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

function targetOf(m: Doc<"memberships">): Target {
  return { userId: m.userId, role: m.role, status: m.status, primarySection: m.primarySection, sections: m.sections };
}

/**
 * Sent reports for one period, from the officers the viewer may see
 * (department: everyone; section leads: their section).
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
    const latest = new Map<string, Doc<"submissions">>();
    for (const r of rows) {
      if (hidden.has(r.ownerId)) continue;
      const cur = latest.get(r.ownerId);
      if (!cur || r.submittedAt > cur.submittedAt) latest.set(r.ownerId, r);
    }
    const out = [];
    for (const r of latest.values()) {
      const m = await ctx.db
        .query("memberships")
        .withIndex("by_user_council", (q) => q.eq("userId", r.ownerId).eq("councilId", viewer.councilId))
        .unique();
      const target: Target = m
        ? targetOf(m)
        : { userId: r.ownerId, role: "officer", status: "active", primarySection: r.primarySection, sections: [r.primarySection] };
      if (!canViewMembership(viewer.actor, target)) continue;
      out.push({
        _id: r._id,
        officerName: r.officerName,
        areaLabel: r.areaLabel,
        primarySection: r.primarySection,
        submittedAt: r.submittedAt,
        auto: r.auto ?? false,
        late: r.late ?? false,
        payload: r.payload as unknown,
      });
    }
    return out.sort((a, b) => a.areaLabel.localeCompare(b.areaLabel));
  },
});

/** Officers who have not sent this report yet (for follow-up), among those the viewer may see. */
export const missingForHq = hqQuery({
  args: { kind: vKind, period: v.string() },
  handler: async (ctx, { kind, period }) => {
    const { viewer } = ctx;
    const officers = (
      await ctx.db
        .query("memberships")
        .withIndex("by_council_status", (q) => q.eq("councilId", viewer.councilId).eq("status", "active"))
        .collect()
    ).filter((m) => m.role === "officer" && canViewMembership(viewer.actor, targetOf(m)));
    const sent = new Set(
      (
        await ctx.db
          .query("submissions")
          .withIndex("by_council_kind_period", (q) => q.eq("councilId", viewer.councilId).eq("kind", kind).eq("period", period))
          .collect()
      ).map((s) => s.ownerId as string),
    );
    const out = [];
    for (const m of officers) {
      if (sent.has(m.userId)) continue;
      const user = await ctx.db.get(m.userId);
      out.push({ userId: m.userId, name: user?.name ?? "—", phone: user?.phone ?? null, areaLabel: await areaLabelOf(ctx, m, ""), primarySection: m.primarySection });
    }
    return out.sort((a, b) => a.areaLabel.localeCompare(b.areaLabel) || a.name.localeCompare(b.name));
  },
});
