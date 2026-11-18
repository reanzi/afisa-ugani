import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { v5 as uuidv5 } from "uuid";
import { buildMonthlyReport, monthRange, type MonthlyReview, type Report } from "@afisa/shared";
import { db, type LocalRecord } from "./db";
import { useWork } from "./session";
import { useMyAreas } from "./areas";

/** Fixed namespace so the same officer, council and month always give the same review id, on any phone. */
const REVIEW_NS = "6f1f6b7e-3b0c-4d8e-9a4c-2f6d0e5b9a11";

export function reviewClientId(userId: string, councilId: string, month: string): string {
  return uuidv5(`monthly_review:${userId}:${councilId}:${month}`, REVIEW_NS);
}

export function useReviewRecord(month: string): LocalRecord | null | undefined {
  const { me, councilId } = useWork();
  const id = reviewClientId(me.userId, councilId, month);
  return useLiveQuery(async () => (await db.records.get(id)) ?? null, [id]);
}

/** Records of the month for this council (the officer's own phone data). */
export function useMonthRecords(month: string): LocalRecord[] | undefined {
  const { councilId } = useWork();
  const { start, end } = monthRange(month);
  return useLiveQuery(
    () => db.records.where("[councilId+occurredAt]").between([councilId, start], [councilId, end], true, false).toArray(),
    [councilId, start, end],
  );
}

/** "Kijiji cha Changarawe" or "Kata ya Mzumbe", from the officer's assigned areas. */
export function useAreaLabel(): string {
  const { membership } = useWork();
  const { byId } = useMyAreas();
  const named = membership.areaIds
    .map((id) => byId.get(id))
    .filter((a) => a !== undefined)
    .map((a) => (a.kind === "ward" ? `Kata ya ${a.name}` : `Kijiji cha ${a.name}`));
  return named.join(", ") || membership.councilName;
}

export function useMonthlyReport(month: string): { report: Report | undefined; review: MonthlyReview | null } {
  const { me } = useWork();
  const { byId } = useMyAreas();
  const records = useMonthRecords(month);
  const reviewRec = useReviewRecord(month);
  const areaLabel = useAreaLabel();
  const review = (reviewRec && !reviewRec.deletedAt ? (reviewRec.payload as MonthlyReview) : null) ?? null;

  const report = useMemo(() => {
    if (!records) return undefined;
    return buildMonthlyReport({
      month,
      records,
      review,
      areaLabel,
      officerName: me.name ?? "",
      phone: me.phone,
      areaName: (id) => byId.get(id)?.name,
    });
  }, [records, review, month, areaLabel, me.name, me.phone, byId]);

  return { report, review };
}
