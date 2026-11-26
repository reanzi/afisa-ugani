/**
 * Quarterly and annual ARDS reports on the phone: the period's records, the
 * officer's end-of-period answers (a "quarterly_review" / "annual_review"
 * record with a fixed id, like the month-end answers), and saving them.
 */
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { v5 as uuidv5 } from "uuid";
import {
  annualWindow,
  buildAnnualReport,
  buildQuarterlyReport,
  fyKeyMonths,
  PAYLOAD_VERSION,
  periodRange,
  quarterlyWindow,
  quarterMonths,
  shiftFy,
  validatePayload,
  type MonthlyReview,
  type PeriodReview,
  type Report,
} from "@afisa/shared";
import { db, type LocalRecord } from "./db";
import { useWork } from "./session";
import { useAreaLabel, reviewClientId } from "./report";
import { useMyAreas } from "./areas";
import { requestSync } from "./sync";

export type PeriodicKind = "quarterly" | "annual";

const REVIEW_NS = "0b8e5f3a-7c1d-4e2b-9f6a-3d5c7e9b1a24";
const reviewType = (kind: PeriodicKind) => (kind === "quarterly" ? "quarterly_review" : "annual_review");

export function periodReviewId(kind: PeriodicKind, userId: string, councilId: string, period: string): string {
  return uuidv5(`${reviewType(kind)}:${userId}:${councilId}:${period}`, REVIEW_NS);
}

export const periodMonths = (kind: PeriodicKind, period: string) => (kind === "quarterly" ? quarterMonths(period) : fyKeyMonths(period));
export const periodWindow = (kind: PeriodicKind, period: string) => (kind === "quarterly" ? quarterlyWindow(period) : annualWindow(period));

function useRecordsBetween(start: number, end: number): LocalRecord[] | undefined {
  const { councilId } = useWork();
  return useLiveQuery(
    () => db.records.where("[councilId+occurredAt]").between([councilId, start], [councilId, end], true, false).toArray(),
    [councilId, start, end],
  );
}

function useReviewRecord(kind: PeriodicKind, period: string | null): LocalRecord | null | undefined {
  const { me, councilId } = useWork();
  const id = period ? periodReviewId(kind, me.userId, councilId, period) : "";
  return useLiveQuery(async () => (id ? ((await db.records.get(id)) ?? null) : null), [id]);
}

const live = (r: LocalRecord | null | undefined) => (r && !r.deletedAt ? (r.payload as PeriodReview) : null);

export type PeriodicState = {
  report: Report | undefined;
  /** The same report without the officer's additions (for the editor). */
  base: Report | undefined;
  review: PeriodReview | null;
  /** Last year's annual answers (carry-over). */
  previous: PeriodReview | null;
  records: LocalRecord[] | undefined;
};

export function usePeriodicReport(kind: PeriodicKind, period: string): PeriodicState {
  const { me } = useWork();
  const { byId } = useMyAreas();
  const areaLabel = useAreaLabel();
  const { start, end } = periodRange(periodMonths(kind, period));
  const records = useRecordsBetween(start, end);
  const review = live(useReviewRecord(kind, period));
  const previous = live(useReviewRecord("annual", kind === "annual" ? shiftFy(period, -1) : null));

  return useMemo(() => {
    if (!records) return { report: undefined, base: undefined, review, previous, records };
    const input = { period, records, previous, areaLabel, officerName: me.name ?? "", phone: me.phone, areaName: (id: string) => byId.get(id)?.name };
    const build = kind === "quarterly" ? buildQuarterlyReport : buildAnnualReport;
    return {
      report: build({ ...input, review }),
      base: build({ ...input, review: review ? { ...review, additions: undefined } : null }),
      review,
      previous,
      records,
    };
  }, [kind, period, records, review, previous, areaLabel, me.name, me.phone, byId]);
}

/** Save the end-of-period answers. Returns a validation problem, or null. */
export async function savePeriodReview(
  kind: PeriodicKind,
  ctx: { userId: string; councilId: string; section: LocalRecord["section"] },
  next: PeriodReview,
): Promise<string | null> {
  const clean = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
  const problem = validatePayload(reviewType(kind), clean);
  if (problem) return problem;
  const now = Date.now();
  const { start, end } = periodRange(periodMonths(kind, next.period));
  await db.records.put({
    clientId: periodReviewId(kind, ctx.userId, ctx.councilId, next.period),
    councilId: ctx.councilId,
    type: reviewType(kind),
    section: ctx.section,
    occurredAt: Math.max(start, Math.min(now, end - 1)),
    payload: clean,
    payloadVersion: PAYLOAD_VERSION,
    clientUpdatedAt: now,
    syncState: "pending",
  });
  requestSync();
  return null;
}

/** Save the month's additions inside the month-end answers record (creating it if needed). */
export async function saveMonthlyAdditions(
  ctx: { userId: string; councilId: string; section: LocalRecord["section"] },
  month: string,
  current: MonthlyReview | null,
  additions: MonthlyReview["additions"],
): Promise<string | null> {
  const next: MonthlyReview = { ...(current ?? { month }), month, additions };
  const clean = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
  const problem = validatePayload("monthly_review", clean);
  if (problem) return problem;
  const now = Date.now();
  const { start, end } = periodRange([month]);
  await db.records.put({
    clientId: reviewClientId(ctx.userId, ctx.councilId, month),
    councilId: ctx.councilId,
    type: "monthly_review",
    section: ctx.section,
    occurredAt: Math.max(start, Math.min(now, end - 1)),
    payload: clean,
    payloadVersion: PAYLOAD_VERSION,
    clientUpdatedAt: now,
    syncState: "pending",
  });
  requestSync();
  return null;
}

/**
 * Which quarterly / annual report to show, if any. A report appears when its
 * window opens (15th of the last month; annual: 1 June), stays until its due
 * date once sent, and stays while unsent (late) or sent back for correction.
 */
/** The first periods the app reports: earlier ones were before these forms existed in the app. */
export const FIRST_PERIOD: Record<PeriodicKind, string> = { quarterly: "2026-27-Q2", annual: "2026-27" };

export function visiblePeriod(
  kind: PeriodicKind,
  now: number,
  candidate: string,
  sealed: ReadonlySet<string>,
  reopened: readonly string[],
): { period: string; state: "open" | "late" | "sent" | "returned" } | null {
  if (reopened.length) return { period: reopened[0]!, state: "returned" };
  if (candidate < FIRST_PERIOD[kind]) return null;
  const w = periodWindow(kind, candidate);
  if (now < w.opens) return null;
  if (sealed.has(candidate)) return now <= w.due + 3 * 86_400_000 ? { period: candidate, state: "sent" } : null;
  return { period: candidate, state: now > w.due ? "late" : "open" };
}
