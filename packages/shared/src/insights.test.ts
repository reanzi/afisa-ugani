import { describe, expect, it } from "vitest";
import { monthStats, periodSummary, recentKinds, reminders, type InsightRecord, type ReminderInput } from "./insights.ts";

const r = (type: string, payload: Record<string, unknown>, section: InsightRecord["section"] = "kilimo", extra: Partial<InsightRecord> = {}): InsightRecord => ({
  type,
  section,
  occurredAt: Date.now(),
  payload,
  ...extra,
});

describe("month stats", () => {
  it("shows figures only for the officer's sections, and skips zeros", () => {
    const records = [
      r("training", { men: 10, women: 15 }),
      r("pest_outbreak", { areaAffectedHa: 4, areaSavedHa: 3 }),
      r("livestock_treatment", { treated: 12 }, "mifugo"),
      r("monthly_review", {}),
      r("training", { men: 5 }, "kilimo", { deletedAt: 1 }),
    ];
    const crops = monthStats(records, ["kilimo"]).map((s) => [s.id, s.value]);
    expect(crops).toEqual([["entries", "3"], ["trained", "25"], ["pest_ha", "4"], ["saved_ha", "3"]]);
    expect(monthStats(records, ["mifugo"]).map((s) => s.id)).toEqual(["entries", "trained", "treated"]);
  });
});

describe("reminders", () => {
  const base = (over: Partial<ReminderInput> = {}): ReminderInput => ({
    now: new Date(2026, 10, 12, 9),
    hasReviewThisMonth: false,
    prevMonthEntries: 0,
    hasReviewPrevMonth: false,
    lastEntryAt: new Date(2026, 10, 12, 8).getTime(),
    pendingCount: 0,
    oldestPendingAt: null,
    rejectedCount: 0,
    ...over,
  });

  it("is quiet on an ordinary day", () => {
    expect(reminders(base())).toEqual([]);
  });
  it("asks for the month-end review in the last five days", () => {
    const lateMonth = { now: new Date(2026, 10, 27, 9), lastEntryAt: new Date(2026, 10, 27, 8).getTime() };
    const out = reminders(base(lateMonth));
    expect(out[0]?.id).toBe("review-2026-11");
    expect(out[0]?.text).toContain("siku 3");
    expect(reminders(base({ ...lateMonth, hasReviewThisMonth: true }))).toEqual([]);
  });
  it("reminds about last month's report in the first week", () => {
    const out = reminders(base({ now: new Date(2026, 11, 3, 9), prevMonthEntries: 12, lastEntryAt: new Date(2026, 11, 3).getTime() }));
    expect(out[0]).toMatchObject({ id: "prev-review-2026-11", action: { to: "/ripoti/majibu?mwezi=2026-11" } });
  });
  it("puts rejected entries first and never shows more than two", () => {
    const out = reminders(base({ now: new Date(2026, 10, 28), rejectedCount: 2, pendingCount: 3, oldestPendingAt: new Date(2026, 10, 20).getTime(), lastEntryAt: new Date(2026, 10, 20).getTime() }));
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe("rejected");
  });
  it("reminds about the food prices report in the days before the 22nd until it is sent", () => {
    const due = new Date(2026, 10, 22, 23, 59).getTime();
    const on = (d: number, submitted = false) =>
      reminders(base({ now: new Date(2026, 10, d, 9), lastEntryAt: new Date(2026, 10, d, 8).getTime(), foodReport: { label: "Novemba 2026", due, submitted, prices: 14 } }));
    expect(on(12)).toEqual([]);
    expect(on(19)[0]).toMatchObject({ id: "food-Novemba 2026", action: { to: "/ripoti?aina=chakula" } });
    expect(on(19)[0]?.text).toContain("tarehe 22");
    expect(on(19, true)).toEqual([]);
  });

  it("welcomes a new officer and nudges after three idle days", () => {
    expect(reminders(base({ lastEntryAt: null }))[0]?.id).toBe("welcome");
    expect(reminders(base({ lastEntryAt: new Date(2026, 10, 8).getTime() }))[0]?.text).toContain("Siku 4");
  });
});

describe("period summary", () => {
  it("totals pesticides by product and unit, and drugs by name", () => {
    const s = periodSummary([
      r("pest_outbreak", { pesticide: "Duduba 450EC", quantity: 3, unit: "lita", areaAffectedHa: 4 }),
      r("pest_outbreak", { pesticide: "duduba 450EC", quantity: 4, unit: "lita", areaAffectedHa: 6 }),
      r("pest_outbreak", { pesticide: "Duduba 450EC", quantity: 1, unit: "kg" }),
      r("livestock_treatment", { drug: "Butalex", treated: 9 }, "mifugo"),
      r("vaccination", { product: "I-2", count: 300 }, "mifugo"),
    ]);
    expect(s.pesticides[0]).toMatchObject({ name: "Duduba 450EC", unit: "lita", quantity: 7, uses: 2 });
    expect(s.pesticides).toHaveLength(2);
    expect(s.areaAffectedHa).toBe(10);
    expect(s.drugs.map((d) => [d.name, d.animals])).toEqual([["I-2", 300], ["Butalex", 9]]);
    expect(s.byType[0]).toMatchObject({ type: "pest_outbreak", count: 3 });
  });
});

describe("recent kinds", () => {
  it("lists distinct type and section pairs, newest first", () => {
    const at = (n: number) => ({ clientUpdatedAt: n });
    const out = recentKinds([
      { ...r("training", {}), ...at(1) },
      { ...r("price", {}), ...at(5) },
      { ...r("training", {}, "mifugo"), ...at(4) },
      { ...r("price", {}), ...at(3) },
      { ...r("monthly_review", {}), ...at(9) },
      { ...r("photo", {}), ...at(8) },
      { ...r("haipo_tena", {}), ...at(7) },
    ]);
    expect(out.map((x) => `${x.type}/${x.section}`)).toEqual(["photo/kilimo", "price/kilimo", "training/mifugo", "training/kilimo"]);
  });
});
