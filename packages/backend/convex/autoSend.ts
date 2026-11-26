/**
 * Auto-send: when the Head of Department switches it on, reports send
 * themselves on their due dates with whatever the officer had entered (and
 * synced). An officer who entered nothing sends no report, and appears on
 * HQ's "not sent" list. Reports already sent are never touched.
 *
 *   Food availability and prices: the 22nd, 23:30 East Africa Time.
 *   Monthly ARDS report: the 5th of the next month, 23:30 East Africa Time.
 *   Weekly reports (per section, when switched on): Monday, 05:00, for the week before.
 *   Quarterly and annual ARDS reports (with the monthly switch): the 7th after the
 *   quarter (January, April, July, October), 23:30; the annual one on 7 July.
 *
 * The server runs in UTC; timestamps are shifted to council wall-clock time
 * (toCouncilWallClock) before using the shared period helpers.
 */
import { v } from "convex/values";
import {
  buildMonthlyReport,
  buildWeeklyReport,
  shiftWeek,
  weekKey,
  weekRange,
  weeklyKind,
  type WeeklyReview,
  type WeeklySection,
  compileFoodPrices,
  financialYear,
  COUNCIL_UTC_OFFSET_MINUTES,
  foodCycle,
  monthKey,
  monthRange,
  shiftMonth,
  toCouncilWallClock,
  PAYLOAD_VERSION,
  type MonthlyReview, presentName, isReviewType,
  buildAnnualReport,
  buildQuarterlyReport,
  fyKey,
  fyKeyMonths,
  periodRange,
  quarterKey,
  quarterMonths,
  shiftFy,
  type PeriodReview,
} from "@afisa/shared";
import { internal } from "./_generated/api";
import { approvedPresetsOf } from "./presets";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { areaLabelOf, findSubmission, insertSubmission, weeklyOf } from "./submissions";

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
    who: { councilId: m.councilId, userId: m.userId, name: presentName(user?.name), areaIds: m.areaIds, primarySection: m.primarySection },
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
    const entries = records.filter((r) => !isReviewType(r.type) && !r.deletedAt);
    if (entries.length === 0 && !reviewRec) return "nothing-entered";

    const areas = new Map<string, string>();
    for (const kind of ["ward", "village"] as const) {
      for (const a of await ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", m.councilId).eq("kind", kind)).collect()) {
        areas.set(a._id, presentName(a.name));
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
      areaLabel: areaLabel || presentName(council?.name),
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

/** Cron, Mondays 05:00: last week's report for each section a council switched weekly reports on for. */
export const runWeekly = internalMutation({
  args: { week: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const week = args.week ?? shiftWeek(weekKey(new Date(toCouncilWallClock(Date.now()))), -1);
    const councils = await ctx.db.query("councils").withIndex("by_status", (q) => q.eq("status", "active")).collect();
    let queued = 0;
    for (const c of councils) {
      const weekly = weeklyOf(c);
      for (const section of ["mifugo", "kilimo"] as const) {
        // Switched on means asked for, and auto-sent when the officer has not sent it.
        if (!weekly[section].on) continue;
        for (const m of await officersOf(ctx, c._id)) {
          if (!m.sections.includes(section)) continue;
          await ctx.scheduler.runAfter(0, internal.autoSend.weeklyForOfficer, { membershipId: m._id, week, section });
          queued++;
        }
      }
    }
    return { week, queued };
  },
});

export const weeklyForOfficer = internalMutation({
  args: { membershipId: v.id("memberships"), week: v.string(), section: v.union(v.literal("mifugo"), v.literal("kilimo")) },
  handler: async (ctx, { membershipId, week, section }) => {
    const m = await ctx.db.get(membershipId);
    if (!m || m.status !== "active" || !m.sections.includes(section)) return "skipped";
    const kind = weeklyKind(section as WeeklySection);
    if (await findSubmission(ctx, m.userId, m.councilId, kind, week)) return "already-sent";
    const { start, end } = weekRange(week);
    const records = await wallClockRecords(ctx, m, start, end);
    const reviewRec = records.find((r) => r.type === "weekly_review" && !r.deletedAt && r.payload.week === week && r.payload.section === section);
    const entries = records.filter((r) => !isReviewType(r.type) && !r.deletedAt && r.section === section);
    if (entries.length === 0 && !reviewRec) return "nothing-entered";

    const { who, phone, areaLabel } = await owner(ctx, m);
    const council = await ctx.db.get(m.councilId);
    const report = buildWeeklyReport({
      week,
      section,
      records,
      review: (reviewRec?.payload as WeeklyReview | undefined) ?? null,
      areaLabel: areaLabel || presentName(council?.name),
      officerName: who.name,
      phone,
    });
    await insertSubmission(ctx, who, null, {
      clientId: crypto.randomUUID(),
      kind,
      period: week,
      areaLabel: report.header.areaLabel,
      payload: report,
      payloadVersion: PAYLOAD_VERSION,
      clientSubmittedAt: Date.now(),
      auto: true,
    });
    return "sent";
  },
});

/**
 * Cron, the 7th of every month at 23:30: in January, April, July and October,
 * the quarter just ended (and in July, the financial year) for councils whose
 * Head of Department switched ARDS auto-send on.
 */
export const runPeriodic = internalMutation({
  args: { quarter: v.optional(v.string()), year: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const lastMonth = shiftMonth(monthKey(new Date(toCouncilWallClock(Date.now()))), -1);
    const endsQuarter = ["03", "06", "09", "12"].includes(lastMonth.slice(5));
    const quarter = args.quarter ?? (endsQuarter ? quarterKey(lastMonth) : null);
    const year = args.year ?? (lastMonth.endsWith("-06") ? fyKey(lastMonth) : null);
    if (!quarter && !year) return { quarter, year, councils: 0, queued: 0 };
    const councils = (await ctx.db.query("councils").withIndex("by_status", (q) => q.eq("status", "active")).collect()).filter((c) => c.autoSend?.monthly);
    let queued = 0;
    for (const c of councils) {
      for (const m of await officersOf(ctx, c._id)) {
        if (quarter) await ctx.scheduler.runAfter(0, internal.autoSend.periodicForOfficer, { membershipId: m._id, kind: "quarterly", period: quarter });
        if (year) await ctx.scheduler.runAfter(0, internal.autoSend.periodicForOfficer, { membershipId: m._id, kind: "annual", period: year });
        queued++;
      }
    }
    return { quarter, year, councils: councils.length, queued };
  },
});

export const periodicForOfficer = internalMutation({
  args: { membershipId: v.id("memberships"), kind: v.union(v.literal("quarterly"), v.literal("annual")), period: v.string() },
  handler: async (ctx, { membershipId, kind, period }) => {
    const m = await ctx.db.get(membershipId);
    if (!m || m.status !== "active") return "skipped";
    if (await findSubmission(ctx, m.userId, m.councilId, kind, period)) return "already-sent";
    const months = kind === "quarterly" ? quarterMonths(period) : fyKeyMonths(period);
    const { start, end } = periodRange(months);
    const records = await wallClockRecords(ctx, m, start, end);
    const reviewType = kind === "quarterly" ? "quarterly_review" : "annual_review";
    const review = (records.find((r) => r.type === reviewType && !r.deletedAt && r.payload.period === period)?.payload as PeriodReview | undefined) ?? null;
    const entries = records.filter((r) => !isReviewType(r.type) && !r.deletedAt);
    if (entries.length === 0 && !review) return "nothing-entered";

    let previous: PeriodReview | null = null;
    if (kind === "annual") {
      const last = shiftFy(period, -1);
      const range = periodRange(fyKeyMonths(last));
      const before = await wallClockRecords(ctx, m, range.start, range.end);
      previous = (before.find((r) => r.type === "annual_review" && !r.deletedAt && r.payload.period === last)?.payload as PeriodReview | undefined) ?? null;
    }
    const areas = new Map<string, string>();
    for (const k of ["ward", "village"] as const) {
      for (const a of await ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", m.councilId).eq("kind", k)).collect()) {
        areas.set(a._id, presentName(a.name));
      }
    }
    const { who, phone, areaLabel } = await owner(ctx, m);
    const council = await ctx.db.get(m.councilId);
    const input = {
      period,
      records,
      review,
      previous,
      areaLabel: areaLabel || presentName(council?.name),
      officerName: who.name,
      phone,
      areaName: (id: string) => areas.get(id),
    };
    const report = kind === "quarterly" ? buildQuarterlyReport(input) : buildAnnualReport(input);
    await insertSubmission(ctx, who, null, {
      clientId: crypto.randomUUID(),
      kind,
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
