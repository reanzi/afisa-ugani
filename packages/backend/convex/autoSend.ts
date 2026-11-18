/**
 * Auto-send: when the Head of Department switches it on, reports send
 * themselves on their due dates with whatever the officer had entered (and
 * synced). An officer who entered nothing sends no report, and appears on
 * HQ's "not sent" list. Reports already sent are never touched.
 *
 *   Food availability and prices: the 22nd, 23:30 East Africa Time.
 *   Monthly ARDS report: the 5th of the next month, 23:30 East Africa Time.
 *
 * The server runs in UTC; timestamps are shifted to council wall-clock time
 * (toCouncilWallClock) before using the shared period helpers.
 */
import { v } from "convex/values";
import {
  buildMonthlyReport,
  compileFoodPrices,
  financialYear,
  COUNCIL_UTC_OFFSET_MINUTES,
  foodCycle,
  monthKey,
  monthRange,
  shiftMonth,
  toCouncilWallClock,
  PAYLOAD_VERSION,
  type MonthlyReview,
} from "@afisa/shared";
import { internal } from "./_generated/api";
import { approvedPresetsOf } from "./presets";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { areaLabelOf, findSubmission, insertSubmission } from "./submissions";

const OFFSET = COUNCIL_UTC_OFFSET_MINUTES * 60_000;
const DAY = 86_400_000;

async function officersOf(ctx: MutationCtx, councilId: Id<"councils">) {
  return (
    await ctx.db
      .query("memberships")
      .withIndex("by_council_status", (q) => q.eq("councilId", councilId).eq("status", "active"))
      .collect()
  ).filter((m) => m.role === "officer");
}

/** Records of one officer between two wall-clock times, with times shifted to wall clock. */
async function wallClockRecords(ctx: MutationCtx, m: Doc<"memberships">, fromWall: number, toWall: number) {
  const rows = await ctx.db
    .query("records")
    .withIndex("by_owner_council_occurred", (q) =>
      q.eq("ownerId", m.userId).eq("councilId", m.councilId).gte("occurredAt", fromWall - OFFSET).lt("occurredAt", toWall - OFFSET),
    )
    .collect();
  return rows.map((r) => ({
    type: r.type,
    section: r.section,
    areaId: r.areaId,
    occurredAt: toCouncilWallClock(r.occurredAt),
    payload: r.payload as Record<string, unknown>,
    deletedAt: r.deletedAt,
  }));
}

async function owner(ctx: MutationCtx, m: Doc<"memberships">) {
  const user = await ctx.db.get(m.userId);
  return {
    who: { councilId: m.councilId, userId: m.userId, name: user?.name ?? "", areaIds: m.areaIds, primarySection: m.primarySection },
    phone: user?.phone ?? null,
    areaLabel: await areaLabelOf(ctx, m, ""),
  };
}

/** Cron, the 22nd: queue one small job per officer of each council that switched food auto-send on. */
export const runFood = internalMutation({
  args: { period: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const period = args.period ?? monthKey(new Date(toCouncilWallClock(Date.now())));
    const councils = (await ctx.db.query("councils").withIndex("by_status", (q) => q.eq("status", "active")).collect()).filter((c) => c.autoSend?.food);
    let queued = 0;
    for (const c of councils) {
      for (const m of await officersOf(ctx, c._id)) {
        await ctx.scheduler.runAfter(0, internal.autoSend.foodForOfficer, { membershipId: m._id, period });
        queued++;
      }
    }
    return { period, councils: councils.length, queued };
  },
});

export const foodForOfficer = internalMutation({
  args: { membershipId: v.id("memberships"), period: v.string() },
  handler: async (ctx, { membershipId, period }) => {
    const m = await ctx.db.get(membershipId);
    if (!m || m.status !== "active") return "skipped";
    if (await findSubmission(ctx, m.userId, m.councilId, "food_prices", period)) return "already-sent";
    const cycle = foodCycle(period);
    // Tagged prices can sit outside the cycle's dates; look a month either side.
    const records = await wallClockRecords(ctx, m, cycle.start - 31 * DAY, cycle.end + 31 * DAY);
    const rows = compileFoodPrices(records, cycle);
    if (rows.length === 0) return "nothing-entered";
    const { who, areaLabel } = await owner(ctx, m);
    await insertSubmission(ctx, who, null, {
      clientId: crypto.randomUUID(),
      kind: "food_prices",
      period,
      areaLabel,
      payload: { rows: rows.map(({ commodity, unit, average, min, max, count, availability }) => ({ commodity, unit, average, min, max, count, availability })) },
      payloadVersion: PAYLOAD_VERSION,
      clientSubmittedAt: Date.now(),
      auto: true,
    });
    return "sent";
  },
});

/** Cron, the 5th: last month's ARDS report for each officer of councils that switched monthly auto-send on. */
export const runMonthly = internalMutation({
  args: { period: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const period = args.period ?? shiftMonth(monthKey(new Date(toCouncilWallClock(Date.now()))), -1);
    const councils = (await ctx.db.query("councils").withIndex("by_status", (q) => q.eq("status", "active")).collect()).filter((c) => c.autoSend?.monthly);
    let queued = 0;
    for (const c of councils) {
      for (const m of await officersOf(ctx, c._id)) {
        await ctx.scheduler.runAfter(0, internal.autoSend.monthlyForOfficer, { membershipId: m._id, period });
        queued++;
      }
    }
    return { period, councils: councils.length, queued };
  },
});

export const monthlyForOfficer = internalMutation({
  args: { membershipId: v.id("memberships"), period: v.string() },
  handler: async (ctx, { membershipId, period }) => {
    const m = await ctx.db.get(membershipId);
    if (!m || m.status !== "active") return "skipped";
    if (await findSubmission(ctx, m.userId, m.councilId, "monthly", period)) return "already-sent";
    const { start, end } = monthRange(period);
    const records = await wallClockRecords(ctx, m, start, end);
    const reviewRec = records.find((r) => r.type === "monthly_review" && !r.deletedAt && r.payload.month === period);
    const entries = records.filter((r) => r.type !== "monthly_review" && !r.deletedAt);
    if (entries.length === 0 && !reviewRec) return "nothing-entered";

    const areas = new Map<string, string>();
    for (const kind of ["ward", "village"] as const) {
      for (const a of await ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", m.councilId).eq("kind", kind)).collect()) {
        areas.set(a._id, a.name);
      }
    }
    const { who, phone, areaLabel } = await owner(ctx, m);
    const council = await ctx.db.get(m.councilId);
    // The officer's approved yields and plan fill the crop tables, as on the phone.
    const approved = await approvedPresetsOf(ctx, m.userId, m.councilId, financialYear(period));
    const report = buildMonthlyReport({
      month: period,
      yields: approved.yields,
      plan: approved.plans.kilimo ?? null,
      records,
      review: (reviewRec?.payload as MonthlyReview | undefined) ?? null,
      areaLabel: areaLabel || council?.name || "",
      officerName: who.name,
      phone,
      areaName: (id) => areas.get(id),
    });
    await insertSubmission(ctx, who, null, {
      clientId: crypto.randomUUID(),
      kind: "monthly",
      period,
      areaLabel: report.header.areaLabel,
      payload: report,
      payloadVersion: PAYLOAD_VERSION,
      clientSubmittedAt: Date.now(),
      auto: true,
    });
    return "sent";
  },
});
