import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { monthKey, monthRange, recentKinds, reminders, reportingWeek, shiftMonth, weeklyKind, weeklyWindow, type Reminder, isReviewType } from "@afisa/shared";
import { db } from "./db";
import { useWork } from "./session";
import { reviewClientId } from "./report";

/** Everything the home screen needs, read from the phone's own data. */
export function useHomeData() {
  const { me, councilId, membership, sections } = useWork();
  const now = new Date();
  // From Sunday 18:00 this week's report can be sent; before that, last week's.
  const lastWeek = reportingWeek(now);
  // Weekly reports HQ asks of this officer (sections switched on, and the officer works in them).
  const asked = (["mifugo", "kilimo"] as const).filter((s) => membership.weekly?.[s]?.on && sections.includes(s));
  const askedKey = asked.join(",");
  const month = monthKey(now);
  const prev = shiftMonth(month, -1);

  const data = useLiveQuery(async () => {
    const all = db.records.where("[councilId+occurredAt]").between([councilId, 0], [councilId, Number.MAX_SAFE_INTEGER]);
    const recent = await all.clone().reverse().filter((r) => !r.deletedAt && !isReviewType(r.type)).limit(80).toArray();
    const { start, end } = monthRange(month);
    const { start: pStart, end: pEnd } = monthRange(prev);
    const monthRecords = await db.records.where("[councilId+occurredAt]").between([councilId, start], [councilId, end], true, false).toArray();
    const prevEntries = await db.records
      .where("[councilId+occurredAt]")
      .between([councilId, pStart], [councilId, pEnd], true, false)
      .filter((r) => !r.deletedAt && !isReviewType(r.type))
      .count();
    const pending = await db.records.where("[councilId+syncState]").equals([councilId, "pending"]).toArray();
    const rejected = await db.records.where("[councilId+syncState]").equals([councilId, "rejected"]).filter((r) => !r.deletedAt).count();
    const reviewNow = await db.records.get(reviewClientId(me.userId, councilId, month));
    const reviewPrev = await db.records.get(reviewClientId(me.userId, councilId, prev));
    const sent = await db.submissions.where("[councilId+syncState]").anyOf([councilId, "pending"], [councilId, "synced"]).toArray();
    const weeklyDue = asked
      .filter((s) => !sent.some((x) => x.kind === weeklyKind(s) && x.period === lastWeek && !x.reopened))
      .map((s) => ({ section: s, week: lastWeek, due: weeklyWindow(lastWeek).due }));
    return { recent, monthRecords, prevEntries, pending, rejected, reviewNow, reviewPrev, weeklyDue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [councilId, month, prev, me.userId, lastWeek, askedKey]);

  return useMemo(() => {
    if (!data) return undefined;
    const lastEntryAt = data.recent[0]?.occurredAt ?? null;
    const list: Reminder[] = reminders({
      now,
      hasReviewThisMonth: Boolean(data.reviewNow && !data.reviewNow.deletedAt),
      prevMonthEntries: data.prevEntries,
      hasReviewPrevMonth: Boolean(data.reviewPrev && !data.reviewPrev.deletedAt),
      lastEntryAt,
      pendingCount: data.pending.length,
      oldestPendingAt: data.pending.length ? Math.min(...data.pending.map((p) => p.clientUpdatedAt)) : null,
      rejectedCount: data.rejected,
      weeklyDue: data.weeklyDue,
      // Food prices have their own card on the home screen, so no reminder here.
    });
    return {
      month,
      monthRecords: data.monthRecords,
      recent: recentKinds(data.recent),
      reminders: list,
    };
    // `now` changes every render; the day is what matters and is captured by `month` and the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, month]);
}
