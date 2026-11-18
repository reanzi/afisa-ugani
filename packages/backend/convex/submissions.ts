/**
 * Reports officers send to HQ. Field records never leave the officer's
 * control; a submission is a frozen summary of them. Once a report for a
 * period is sent (by the officer, or by auto-send on the due date) it is
 * sealed: one report per officer, kind and period.
 */
import { v } from "convex/values";
import {
  canReopenReport,
  canViewMembership,
  COUNCIL_UTC_OFFSET_MINUTES,
  foodCycle,
  monthlyWindow,
  monthRange,
  photoLabels,
  summarize,
  toCouncilWallClock,
  validateFoodReport,
  validateMonthlyReport,
  type Target,
} from "@afisa/shared";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, hiddenUserIds, hqMutation, hqQuery, memberMutation, memberQuery, type MemberViewer } from "./lib/guards";
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
      if (!existing.reopened) fail("INVALID", "Ripoti ya kipindi hiki imeshatumwa na imefungwa.");
      // Reopened for correction: the corrected report replaces the old one and is sealed again.
      const submittedAt = Date.now();
      const revision = existing.revision + 1;
      const corrections = (existing.corrections ?? []).map((c, i, all) => (i === all.length - 1 && !c.resubmittedAt ? { ...c, resubmittedAt: submittedAt } : c));
      await ctx.db.patch(existing._id, {
        clientId: args.clientId,
        payload: args.payload,
        payloadVersion: args.payloadVersion,
        clientSubmittedAt: args.clientSubmittedAt,
        submittedAt,
        areaLabel: args.areaLabel.trim().slice(0, 200),
        revision,
        auto: undefined,
        reopened: undefined,
        corrections,
      });
      await writeAudit(ctx, viewer, {
        action: "submission.resubmit",
        entity: "submissions",
        entityId: existing._id,
        section: existing.primarySection,
        before: { revision: existing.revision },
        after: { kind: args.kind, period: args.period, revision },
        occurredAt: args.clientSubmittedAt,
      });
      return { revision, submittedAt, late: existing.late ?? false };
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
          revision: s.revision,
          reopened: s.reopened ? { at: s.reopened.at, byName: s.reopened.byName, note: s.reopened.note } : null,
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
        revision: r.revision,
        reopened: r.reopened ? { at: r.reopened.at, byName: r.reopened.byName, note: r.reopened.note } : null,
        corrections: (r.corrections ?? []).length,
        canReopen: canReopenReport(viewer.actor, r.primarySection),
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

/**
 * Send a report back to its officer for correction, saying what to correct.
 * The officer corrects it on the phone and sends it again; until then HQ
 * keeps showing the last version, marked as being corrected.
 */
export const reopen = hqMutation({
  args: { submissionId: v.id("submissions"), note: v.string() },
  handler: async (ctx, { submissionId, note }) => {
    const { viewer } = ctx;
    const s = await ctx.db.get(submissionId);
    if (!s || s.councilId !== viewer.councilId) fail("NOT_FOUND", "Ripoti haipo.");
    if (!canReopenReport(viewer.actor, s.primarySection)) fail("FORBIDDEN", "Huna mamlaka ya kurudisha ripoti ya sehemu hii.");
    const clean = note.trim();
    if (clean.length < 5) fail("INVALID", "Eleza afisa anatakiwa kurekebisha nini.");
    if (clean.length > 1000) fail("INVALID", "Maelezo ni marefu mno.");
    if (s.reopened) fail("INVALID", "Ripoti hii tayari imerudishwa kwa marekebisho.");
    const at = Date.now();
    // Root stays hidden: the officer sees "Makao makuu", not root's name.
    const byName = viewer.actor.isRoot ? "Makao makuu" : (viewer.user.name ?? "");
    await ctx.db.patch(s._id, {
      reopened: { at, byId: viewer.userId, byName, note: clean },
      corrections: [...(s.corrections ?? []), { reopenedAt: at, byName, note: clean }],
    });
    await writeAudit(ctx, viewer, {
      action: "submission.reopen",
      entity: "submissions",
      entityId: s._id,
      section: s.primarySection,
      after: { kind: s.kind, period: s.period, officer: s.officerName, note: clean },
    });
    return null;
  },
});

/**
 * Photos that go with a sent report: those attached to the officer's records
 * in the report's period. HQ sees them only once the report is sent, and
 * only for officers whose reports the viewer may see.
 */
export const photosForHq = hqQuery({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const { viewer } = ctx;
    const s = await ctx.db.get(submissionId);
    if (!s || s.councilId !== viewer.councilId) return [];
    const hidden = await hiddenUserIds(ctx, viewer);
    if (hidden.has(s.ownerId)) return [];
    const m = await ctx.db
      .query("memberships")
      .withIndex("by_user_council", (q) => q.eq("userId", s.ownerId).eq("councilId", viewer.councilId))
      .unique();
    const target: Target = m ? targetOf(m) : { userId: s.ownerId, role: "officer", status: "active", primarySection: s.primarySection, sections: [s.primarySection] };
    if (!canViewMembership(viewer.actor, target)) return [];

    // The period in council time (UTC+3): local midnight is 21:00 UTC the day before.
    const offset = COUNCIL_UTC_OFFSET_MINUTES * 60_000;
    const window = s.kind === "monthly" ? monthRange(s.period) : foodCycle(s.period);
    const start = window.start - offset;
    const end = window.end - offset;

    const records = await ctx.db
      .query("records")
      .withIndex("by_owner_council_occurred", (q) => q.eq("ownerId", s.ownerId).eq("councilId", viewer.councilId).gte("occurredAt", start).lt("occurredAt", end))
      .collect();
    const out = [];
    for (const r of records) {
      if (r.deletedAt) continue;
      const media = await ctx.db
        .query("media")
        .withIndex("by_record", (q) => q.eq("recordClientId", r.clientId))
        .collect();
      for (const p of media) {
        if (p.deletedAt || p.ownerId !== s.ownerId) continue;
        const url = await ctx.storage.getUrl(p.storageId);
        if (!url) continue;
        out.push({
          clientId: p.clientId,
          url,
          width: p.width,
          height: p.height,
          shot: p.shot,
          caption: p.caption ?? null,
          takenAt: p.takenAt,
          record: {
            type: r.type,
            section: r.section,
            occurredAt: r.occurredAt,
            summary: summarize(r.type, r.payload as Record<string, unknown>),
            labels: photoLabels({ type: r.type, section: r.section, payload: r.payload as Record<string, unknown> }),
          },
        });
      }
    }
    return out.sort((a, b) => a.record.occurredAt - b.record.occurredAt || a.takenAt - b.takenAt);
  },
});
