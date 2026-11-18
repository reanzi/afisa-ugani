/**
 * Food prices on the phone: which report is open, which are sealed, and the
 * prices recorded for each. A report is sealed once it is sent (by the
 * officer or by auto-send); new prices then start the next report.
 */
import { useLiveQuery } from "dexie-react-hooks";
import {
  compileFoodPrices,
  foodCycle,
  foodPeriodForEntry,
  foodReportReady,
  type FoodCycle,
  type FoodPriceRow,
} from "@afisa/shared";
import { db, type LocalRecord, type LocalSubmission } from "./db";
import { useWork } from "./session";

/**
 * Sent reports of a kind for this council, by period. Rejected sends do not
 * seal, and neither does a report sent back for correction (until the
 * corrected one is sent).
 */
export function useSealed(kind: LocalSubmission["kind"]): Map<string, LocalSubmission> | undefined {
  const { councilId } = useWork();
  return useLiveQuery(async () => {
    const rows = await db.submissions.where("[councilId+syncState]").anyOf([councilId, "pending"], [councilId, "synced"]).toArray();
    const map = new Map<string, LocalSubmission>();
    for (const s of rows.sort((a, b) => b.clientSubmittedAt - a.clientSubmittedAt)) {
      if (s.kind === kind && !s.reopened && !map.has(s.period)) map.set(s.period, s);
    }
    return map;
  }, [councilId, kind]);
}

/** Reports sent back for correction and not yet sent again, newest first. */
export function useReopened(): LocalSubmission[] | undefined {
  const { councilId } = useWork();
  return useLiveQuery(async () => {
    const rows = await db.submissions.where("[councilId+syncState]").anyOf([councilId, "pending"], [councilId, "synced"]).toArray();
    const open = rows.filter((s) => s.reopened);
    // Already corrected on this phone: a newer send for the same report is queued or sent.
    return open
      .filter((s) => !rows.some((o) => o.kind === s.kind && o.period === s.period && !o.reopened && o.clientSubmittedAt > s.clientSubmittedAt))
      .sort((a, b) => (b.reopened!.at ?? 0) - (a.reopened!.at ?? 0));
  }, [councilId]);
}

/** The report that new prices go into right now. */
export function useOpenFoodPeriod(): string | undefined {
  const sealed = useSealed("food_prices");
  if (!sealed) return undefined;
  return foodPeriodForEntry(Date.now(), new Set(sealed.keys()));
}

export type FoodState = {
  cycle: FoodCycle;
  entries: LocalRecord[];
  rows: FoodPriceRow[];
  sealed: LocalSubmission | null;
  /** Sent back for correction: what was sent, and the note saying what to correct. */
  reopened: LocalSubmission | null;
  ready: boolean;
};

/** Prices of one report: those tagged with it, and older untagged ones by date. */
export function useFoodState(period: string | undefined): FoodState | undefined {
  const { councilId } = useWork();
  const sealed = useSealed("food_prices");
  const reopened = useReopened();
  const data = useLiveQuery(async () => {
    if (!period) return undefined;
    const cycle = foodCycle(period);
    const month = 31 * 86_400_000;
    const candidates = await db.records
      .where("[councilId+occurredAt]")
      .between([councilId, cycle.start - month], [councilId, cycle.end + month], true, false)
      .filter((r) => r.type === "price" && !r.deletedAt)
      .toArray();
    const entries = candidates
      .filter((r) => (typeof r.payload.foodPeriod === "string" ? r.payload.foodPeriod === period : r.occurredAt >= cycle.start && r.occurredAt < cycle.end))
      .sort((a, b) => b.clientUpdatedAt - a.clientUpdatedAt);
    return { cycle, entries };
  }, [councilId, period]);
  if (!data || !sealed || !reopened || !period) return undefined;
  return {
    cycle: data.cycle,
    entries: data.entries,
    rows: compileFoodPrices(data.entries, data.cycle),
    sealed: sealed.get(period) ?? null,
    reopened: reopened.find((s) => s.kind === "food_prices" && s.period === period) ?? null,
    ready: foodReportReady(Date.now(), data.cycle),
  };
}
