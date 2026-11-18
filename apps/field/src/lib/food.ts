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

/** Sent reports of a kind for this council, by period (rejected sends do not seal). */
export function useSealed(kind: LocalSubmission["kind"]): Map<string, LocalSubmission> | undefined {
  const { councilId } = useWork();
  return useLiveQuery(async () => {
    const rows = await db.submissions.where("[councilId+syncState]").anyOf([councilId, "pending"], [councilId, "synced"]).toArray();
    const map = new Map<string, LocalSubmission>();
    for (const s of rows.sort((a, b) => a.clientSubmittedAt - b.clientSubmittedAt)) if (s.kind === kind && !map.has(s.period)) map.set(s.period, s);
    return map;
  }, [councilId, kind]);
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
  ready: boolean;
};

/** Prices of one report: those tagged with it, and older untagged ones by date. */
export function useFoodState(period: string | undefined): FoodState | undefined {
  const { councilId } = useWork();
  const sealed = useSealed("food_prices");
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
  if (!data || !sealed || !period) return undefined;
  return {
    cycle: data.cycle,
    entries: data.entries,
    rows: compileFoodPrices(data.entries, data.cycle),
    sealed: sealed.get(period) ?? null,
    ready: foodReportReady(Date.now(), data.cycle),
  };
}
