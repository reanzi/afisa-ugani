/**
 * Weekly section reports on the phone: the week's records, the officer's
 * week-end notes (record type "weekly_review") and the built report.
 */
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { v5 as uuidv5 } from "uuid";
import { parseAsString, useQueryState } from "nuqs";
import { buildWeeklyReport, isWeekKey, reportingWeek, weekKey, weekRange, type Report, type WeeklyReview, type WeeklySection } from "@afisa/shared";
import { db, type LocalRecord } from "./db";
import { useWork } from "./session";
import { useAreaLabel } from "./report";

/** Same namespace idea as the monthly review: one notes record per officer, council, section and week. */
const WEEK_NS = "0b8e2f8c-5a7d-4e61-9c2b-7d4f1a6e3c90";

export function weekNotesClientId(userId: string, councilId: string, section: WeeklySection, week: string): string {
  return uuidv5(`weekly_review:${userId}:${councilId}:${section}:${week}`, WEEK_NS);
}

/** Sections of this officer that have weekly reports (livestock, crops). */
export function useWeeklySections(): WeeklySection[] {
  const { sections } = useWork();
  return (["mifugo", "kilimo"] as const).filter((s) => sections.includes(s));
}

/** Week and section from the address bar; by default the week being reported now (this week from Sunday 18:00). */
export function useWeekParams() {
  const current = weekKey(new Date());
  const reporting = reportingWeek(new Date());
  const mine = useWeeklySections();
  const [rawWeek, setWeek] = useQueryState("wiki", parseAsString.withDefault(reporting));
  const [rawSection, setSection] = useQueryState("sehemu", parseAsString);
  const week = isWeekKey(rawWeek) && rawWeek <= current ? rawWeek : reporting;
  const section = (mine.find((s) => s === rawSection) ?? mine[0]) as WeeklySection | undefined;
  return { week, setWeek, current, section, setSection, sections: mine };
}

export function useWeekNotes(section: WeeklySection | undefined, week: string): LocalRecord | null | undefined {
  const { me, councilId } = useWork();
  const id = section ? weekNotesClientId(me.userId, councilId, section, week) : "";
  return useLiveQuery(async () => (id ? ((await db.records.get(id)) ?? null) : null), [id]);
}

export function useWeekRecords(week: string): LocalRecord[] | undefined {
  const { councilId } = useWork();
  const { start, end } = weekRange(week);
  return useLiveQuery(
    () => db.records.where("[councilId+occurredAt]").between([councilId, start], [councilId, end], true, false).toArray(),
    [councilId, start, end],
  );
}

export function useWeeklyReport(section: WeeklySection | undefined, week: string): { report: Report | undefined; notes: WeeklyReview | null; records: LocalRecord[] | undefined } {
  const { me } = useWork();
  const records = useWeekRecords(week);
  const notesRec = useWeekNotes(section, week);
  const areaLabel = useAreaLabel();
  const notes = (notesRec && !notesRec.deletedAt ? (notesRec.payload as WeeklyReview) : null) ?? null;
  const report = useMemo(() => {
    if (!records || !section) return undefined;
    return buildWeeklyReport({ week, section, records, review: notes, areaLabel, officerName: me.name ?? "", phone: me.phone });
  }, [records, section, week, notes, areaLabel, me.name, me.phone]);
  return { report, notes, records };
}

/** Download or share a report as Word. */
export async function exportReport(report: Report, mode: "download" | "share") {
  const { reportToDocx, reportFileName } = await import("@afisa/ui/docx");
  const blob = await reportToDocx(report);
  const name = reportFileName(report);
  if (mode === "share") {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
