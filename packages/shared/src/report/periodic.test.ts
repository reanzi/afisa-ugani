import { describe, expect, it } from "vitest";
import { buildMonthlyReport, type ReportRecord } from "./monthly.ts";
import { applyAdditions, validateAdditions } from "./additions.ts";
import { buildQuarterlyReport, QUARTERLY_TABLES } from "./quarterly.ts";
import { buildAnnualReport, ANNUAL_TABLES } from "./annual.ts";
import { inputTableBlock, unconfirmedCarry, type PeriodReview } from "./forms.ts";
import type { Report, TableBlock } from "./model.ts";
import { validatePayload } from "../actions.ts";
import {
  annualWindow,
  fyKey,
  isFyKey,
  isQuarterKey,
  quarterKey,
  quarterLabel,
  quarterMonths,
  quarterlyWindow,
  reportingFy,
  reportingQuarter,
  shiftQuarter,
} from "../period.ts";

const day = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();
const rec = (type: string, when: number, payload: Record<string, unknown>, extra: Partial<ReportRecord> = {}): ReportRecord => ({
  type,
  section: "kilimo",
  occurredAt: when,
  payload,
  ...extra,
});
const tableOf = (r: Report, id: string): TableBlock => {
  const b = r.parts.flatMap((p) => p.blocks).find((x) => x.id === id);
  if (!b || b.kind !== "table") throw new Error(`no table ${id}`);
  return b;
};
const base = { areaLabel: "Kata ya Dunda", officerName: "Asha" };

describe("financial-year periods", () => {
  it("keys quarters and years by the July–June financial year", () => {
    expect(fyKey("2026-07")).toBe("2026-27");
    expect(fyKey("2027-06")).toBe("2026-27");
    expect(quarterKey("2026-11")).toBe("2026-27-Q2");
    expect(quarterKey("2027-02")).toBe("2026-27-Q3");
    expect(quarterMonths("2026-27-Q2")).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(quarterMonths("2026-27-Q4")).toEqual(["2027-04", "2027-05", "2027-06"]);
    expect(shiftQuarter("2026-27-Q4", 1)).toBe("2027-28-Q1");
    expect(isQuarterKey("2026-27-Q2")).toBe(true);
    expect(isQuarterKey("2026-28-Q2")).toBe(false);
    expect(isFyKey("2026-27")).toBe(true);
    expect(isFyKey("2026-11")).toBe(false);
    expect(quarterLabel("2026-27-Q2", "sw")).toBe("Robo ya 2: Oktoba – Desemba 2026");
  });

  it("opens quarterly reports on the 15th of the last month, due on the 7th", () => {
    const w = quarterlyWindow("2026-27-Q2");
    expect(w.opens).toBe(new Date(2026, 11, 15).getTime());
    expect(w.due).toBe(new Date(2027, 0, 7, 23, 59).getTime());
    expect(reportingQuarter(day(2026, 12, 14))).toBe("2026-27-Q1");
    expect(reportingQuarter(day(2026, 12, 15))).toBe("2026-27-Q2");
    expect(reportingQuarter(day(2027, 1, 5))).toBe("2026-27-Q2");
  });

  it("opens the annual report on 1 June, due on 7 July", () => {
    const w = annualWindow("2026-27");
    expect(w.opens).toBe(new Date(2027, 5, 1).getTime());
    expect(w.due).toBe(new Date(2027, 6, 7, 23, 59).getTime());
    expect(reportingFy(day(2027, 5, 31))).toBe("2025-26");
    expect(reportingFy(day(2027, 6, 1))).toBe("2026-27");
  });
});

describe("officer additions", () => {
  const slaughter = (r: Report) => tableOf(r, "4");

  it("adds to numeric cells, marks them typed and keeps sum totals right", () => {
    const records = [rec("slaughter", day(2026, 11, 3), { animal: "ngombe", count: 4, slaughterhouse: "X" }, { section: "mifugo" })];
    const plain = buildMonthlyReport({ month: "2026-11", records, ...base });
    const t0 = slaughter(plain);
    const total0 = t0.totalRows?.length ? t0.rows[t0.totalRows[0]!] : null;
    const r = buildMonthlyReport({
      month: "2026-11",
      records,
      ...base,
      review: { month: "2026-11", additions: { cells: [{ table: "4", row: "Ng’ombe", col: 1, value: 3 }] } },
    });
    const t = slaughter(r);
    expect(t.rows[0]![1]).toBe(7);
    expect(t.typed).toContainEqual([0, 1]);
    if (total0) {
      const total = t.rows[t.totalRows![0]!]!;
      expect(total[1]).toBe(Number(total0[1]) + 3);
    }
  });

  it("adds whole rows before the totals and marks every filled cell", () => {
    const report = buildQuarterlyReport({ period: "2026-27-Q2", records: [], ...base });
    const out = applyAdditions(report, { rows: [{ table: "q4.1", id: "r1", cells: ["Viwavijeshi vamizi", "Mahindi", "Mitego ya pheromone", 2, 10, ""] }] });
    const t = tableOf(out, "q4.1");
    expect(t.rows).toContainEqual(["Viwavijeshi vamizi", "Mahindi", "Mitego ya pheromone", 2, 10, ""]);
    const r = t.rows.findIndex((x) => x[0] === "Viwavijeshi vamizi");
    expect(t.typed).toContainEqual([r, 0]);
    expect(t.typed).toContainEqual([r, 4]);
    expect(t.hasData).toBe(true);
    expect(t.note).toContain("✎");
  });

  it("ignores additions for rows or tables that no longer exist", () => {
    const report = buildQuarterlyReport({ period: "2026-27-Q2", records: [], ...base });
    const out = applyAdditions(report, { cells: [{ table: "q3.1", row: "Hakuna", col: 2, value: 5 }, { table: "zz", row: "x", col: 1, value: 1 }] });
    expect(tableOf(out, "q3.1").rows).toEqual(tableOf(report, "q3.1").rows);
  });

  it("validates additions", () => {
    expect(validateAdditions({ cells: [{ table: "4", row: "Ng’ombe", col: 1, value: 3 }] })).toBeNull();
    expect(validateAdditions({ cells: [{ table: "4", row: "Ng’ombe", col: 1, value: -3 }] })).toMatch(/BAD_ADDITIONS/);
    expect(validateAdditions({ rows: [{ table: "4", id: "a", cells: [{}] }] })).toMatch(/BAD_ADDITIONS/);
    expect(validatePayload("monthly_review", { month: "2026-11", additions: { cells: "x" } })).toMatch(/BAD_ADDITIONS/);
  });
});

describe("quarterly report", () => {
  it("builds the official parts with the quarter in the header", () => {
    const r = buildQuarterlyReport({ period: "2026-27-Q2", records: [], ...base });
    expect(r.kind).toBe("quarterly");
    expect(r.header.title).toBe("FOMU YA TAARIFA YA ROBO MWAKA YA MPANGO WA MAENDELEO YA KILIMO WA KIJIJI/KATA");
    expect(r.header.monthLabel).toBe("Robo ya 2: Oktoba – Desemba 2026");
    expect(r.header.financialYear).toBe("2026/27");
    expect(r.parts.map((p) => p.number)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("fills 3.1 from training outside field schools, by sector and length", () => {
    const records = [
      rec("training", day(2026, 10, 5), { topic: "Kilimo bora cha muhogo", method: "mkutano", men: 10, women: 14, trainer: "Afisa kilimo" }),
      rec("training", day(2026, 11, 5), { topic: "Usindikaji wa muhogo", method: "onyesho", men: 3, women: 7, days: 10 }),
      rec("training", day(2026, 12, 5), { topic: "Chanjo ya kuku", method: "mkutano", men: 5, women: 5 }, { section: "mifugo" }),
      rec("training", day(2026, 12, 6), { topic: "Shamba darasa", method: "shamba_darasa", men: 50, women: 50 }),
      rec("training", day(2027, 1, 6), { topic: "Nje ya robo", method: "mkutano", men: 99, women: 99 }),
    ];
    const t = tableOf(buildQuarterlyReport({ period: "2026-27-Q2", records, ...base }), "q3.1");
    expect(t.rows.find((r) => r[0] === "Mazao")).toEqual(["Mazao", "Kilimo bora cha muhogo", 10, 14, 24, 0, "Mkutano", "Afisa kilimo", ""]);
    expect(t.rows.find((r) => r[0] === "Masoko na Usindikaji")).toEqual(["Masoko na Usindikaji", "Usindikaji wa muhogo", 3, 7, 0, 10, "Onyesho", "", ""]);
    expect(t.rows.find((r) => r[0] === "Ufugaji")![2]).toBe(5);
    expect(t.note).toContain("Washiriki 34");
  });

  it("fills 4.1 from biological control only", () => {
    const records = [
      rec("pest_outbreak", day(2026, 10, 9), { pest: "Viwavijeshi vamizi", crop: "mahindi", severity: "wastani", areaAffectedHa: 3, areaSavedHa: 2, households: 6, method: "kibaiolojia", pesticide: "Majivu na pilipili" }),
      rec("pest_outbreak", day(2026, 10, 9), { pest: "Kantangaze", crop: "mahindi", severity: "kubwa", areaAffectedHa: 9, method: "kemikali" }),
    ];
    const t = tableOf(buildQuarterlyReport({ period: "2026-27-Q2", records, ...base }), "q4.1");
    expect(t.rows).toEqual([["Viwavijeshi vamizi", "Mahindi", "Majivu na pilipili", 2, 6, ""]]);
  });

  it("renders typed tables with computed columns and zeros", () => {
    const review: PeriodReview = {
      period: "2026-27-Q2",
      tables: {
        "q1.1": { wastani: { alama: 1, maelezo: "Mvua za vuli zilichelewa" } },
        "q5.1": { xa: { zao: "mpunga", eneoMasika: 10, tijaMasika: 2.5 } },
        "q7.1": { pandwa: { trekta: 5, mkono: 20 } },
      },
    };
    const r = buildQuarterlyReport({ period: "2026-27-Q2", records: [], review, ...base });
    expect(tableOf(r, "q1.1").rows).toEqual([["Nzuri", "", ""], ["Wastani", "✓", "Mvua za vuli zilichelewa"], ["Mbaya", "", ""]]);
    expect(tableOf(r, "q5.1").rows[0]).toEqual(["Mpunga", 10, 0, 2.5, 0, 25, 0, ""]);
    expect(tableOf(r, "q7.1").rows[1]).toEqual(["Lililopandwa", 5, 0, 20, 0, 25]);
    expect(tableOf(r, "q7.2").hasData).toBe(false);
  });

  it("validates the quarter-end answers", () => {
    expect(validatePayload("quarterly_review", { period: "2026-27-Q2", tables: { "q7.1": { pandwa: { trekta: 5 } } } })).toBeNull();
    expect(validatePayload("quarterly_review", { period: "2026-11" })).toBe("BAD_PERIOD");
    expect(validatePayload("quarterly_review", { period: "2026-27-Q2", tables: { "q7.1": { nope: { trekta: 5 } } } })).toBe("BAD_ROW:q7.1");
    expect(validatePayload("quarterly_review", { period: "2026-27-Q2", tables: { "q7.1": { pandwa: { trekta: -1 } } } })).toBe("BAD_CELL:q7.1.trekta");
    expect(validatePayload("quarterly_review", { period: "2026-27-Q2", tables: { "q1.1": { nzuri: { alama: 2 } } } })).toBe("BAD_CELL:q1.1.alama");
    const many = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`x${i}`, { jina: "SACCO" }]));
    expect(validatePayload("quarterly_review", { period: "2026-27-Q2", tables: { "q2.1": many } })).toBe("TOO_MANY_ROWS:q2.1");
  });

  it("has unique table ids", () => {
    const ids = QUARTERLY_TABLES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("annual report", () => {
  const fy = "2026-27";

  it("builds all eleven parts for the financial year", () => {
    const r = buildAnnualReport({ period: fy, records: [], ...base });
    expect(r.kind).toBe("annual");
    expect(r.header.title).toBe("FOMU YA TAARIFA YA MWAKA YA MPANGO WA MAENDELEO YA KILIMO WA KIJIJI/KATA");
    expect(r.header.financialYear).toBe("2026/27");
    expect(r.header.monthLabel).toBe("Juni 2027");
    expect(r.parts.map((p) => p.number)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  });

  it("sums fertilizer use in tonnes by grade, and leaves organic out", () => {
    const records = [
      rec("fertilizer", day(2026, 8, 1), { fertilizer: "urea", quantity: 10, unit: "mfuko" }),
      rec("fertilizer", day(2027, 2, 1), { fertilizer: "urea", quantity: 250, unit: "kg" }),
      rec("fertilizer", day(2027, 2, 1), { fertilizer: "npk", npkGrade: "17_17_17", quantity: 1, unit: "tani" }),
      rec("fertilizer", day(2027, 2, 1), { fertilizer: "npk", quantity: 100, unit: "kg" }),
      rec("fertilizer", day(2027, 2, 1), { fertilizer: "samadi", quantity: 900, unit: "kg" }),
      rec("fertilizer", day(2027, 7, 1), { fertilizer: "urea", quantity: 999, unit: "tani" }),
    ];
    const review: PeriodReview = { period: fy, tables: { "a6.1": { urea: { mahitaji: 2 } } } };
    const t = tableOf(buildAnnualReport({ period: fy, records, review, ...base }), "a6.1");
    expect(t.rows.find((r) => r[0] === "UREA")).toEqual(["UREA", 2, 0.75, ""]);
    expect(t.rows.find((r) => r[0] === "NPK 17:17:17")).toEqual(["NPK 17:17:17", 0, 1, ""]);
    expect(t.rows.find((r) => r[0] === "NPK (daraja halikuandikwa)")).toEqual(["NPK (daraja halikuandikwa)", 0, 0.1, ""]);
    expect(t.rows.some((r) => String(r[0]).toLowerCase().includes("samadi"))).toBe(false);
  });

  it("counts farmer field schools once each, with starters from the largest session", () => {
    const ffs = (d: number, men: number, women: number, group: string, areaId = "v1") =>
      rec("training", day(2026, 9, d), { topic: "Kilimo bora", method: "shamba_darasa", men, women, group, days: 1 }, { areaId });
    const records = [ffs(1, 10, 12, "Juhudi"), ffs(8, 8, 15, "Juhudi"), ffs(9, 5, 5, "Upendo", "v2")];
    const t = tableOf(buildAnnualReport({ period: fy, records, ...base }), "a5.1");
    const mazao = t.rows.find((r) => r[0] === "Mazao")!;
    // [label, lengo, idadi, wanaume, wanawake, siku, hitimu M, hitimu W, vijiji, wanaotumia, maelezo]
    // Length: Juhudi 2 session days, Upendo 1 → 1.5 on average, printed as 2.
    expect(mazao.slice(2, 6)).toEqual([2, 15, 20, 2]);
    expect(mazao[8]).toBe(2);
  });

  it("groups pesticides by class and flags unclassed records", () => {
    const records = [
      rec("pest_outbreak", day(2026, 12, 1), { pest: "x", crop: "mahindi", severity: "kubwa", areaAffectedHa: 1, method: "kemikali", pesticide: "Lambda", quantity: 2, unit: "lita", pesticideClass: "viuadudu" }),
      rec("pest_outbreak", day(2026, 12, 2), { pest: "x", crop: "mahindi", severity: "kubwa", areaAffectedHa: 1, method: "kemikali", pesticide: "Lambda", quantity: 1.5, unit: "lita", pesticideClass: "viuadudu" }),
      rec("pest_outbreak", day(2026, 12, 3), { pest: "y", crop: "mahindi", severity: "kubwa", areaAffectedHa: 1, method: "kemikali", pesticide: "Mancozeb", quantity: 1, unit: "kg" }),
    ];
    const t = tableOf(buildAnnualReport({ period: fy, records, ...base }), "a6.2");
    expect(t.rows[0]).toEqual(["A: Viuadudu", "Lambda", "lita", 3.5, ""]);
    expect(t.rows.find((r) => r[1] === "Mancozeb")?.[0]).toBe("Kundi halikuandikwa");
    expect(t.note).toContain("Kumbukumbu 1 hazina kundi");
  });

  it("adds livestock subtotals and computed totals", () => {
    const review: PeriodReview = { period: fy, tables: { "a7.1": { ngDume: { asili: 10, nyama: 2 }, ngJike: { asili: 30, maziwa: 5 } } } };
    const t = tableOf(buildAnnualReport({ period: fy, records: [], review, ...base }), "a7.1");
    expect(t.rows.find((r) => r[0] === "Ng’ombe dume*")).toEqual(["Ng’ombe dume*", 10, 2, 0, 12, 0]);
    const sub = t.rows.findIndex((r) => r[0] === "Jumla ndogo ng’ombe");
    expect(t.rows[sub]).toEqual(["Jumla ndogo ng’ombe", 40, 2, 5, 47, 0]);
    expect(t.totalRows).toContain(sub);
  });

  it("carries inventory tables over from last year until replaced", () => {
    const previous: PeriodReview = { period: "2025-26", tables: { "a4.1": { trekta: { nzimaBinafsi: 3 } }, "a6.1": { urea: { mahitaji: 9 } } } };
    const r = buildAnnualReport({ period: fy, records: [], previous, ...base });
    expect(tableOf(r, "a4.1").rows[0]).toEqual(["Trekta (Tractor)", 3, 0, 0, 0, ""]);
    // Fertilizer need is not carried: it changes every year.
    expect(tableOf(r, "a6.1").rows.find((x) => x[0] === "UREA")![1]).toBe(0);
    expect(unconfirmedCarry(ANNUAL_TABLES, { period: fy }, previous).map((t) => t.id)).toEqual(["a4.1"]);
    expect(unconfirmedCarry(ANNUAL_TABLES, { period: fy, confirmed: ["a4.1"] }, previous)).toEqual([]);
    const mine: PeriodReview = { period: fy, tables: { "a4.1": { trekta: { nzimaBinafsi: 4 } } } };
    expect(tableOf(buildAnnualReport({ period: fy, records: [], review: mine, previous, ...base }), "a4.1").rows[0]![1]).toBe(4);
  });

  it("allows 'Mengineyo' rows under fixed rows", () => {
    const review: PeriodReview = { period: fy, tables: { "a8": { x1: { _label: "Kisima cha mifugo", nzima: 2 } } } };
    expect(validatePayload("annual_review", review)).toBeNull();
    const t = tableOf(buildAnnualReport({ period: fy, records: [], review, ...base }), "a8");
    expect(t.rows.at(-1)).toEqual(["Kisima cha mifugo", 2, 0, 0, 0, ""]);
  });

  it("has unique table ids", () => {
    const ids = ANNUAL_TABLES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("form layout", () => {
  it("every header group spans exactly the table's columns", () => {
    for (const spec of [...QUARTERLY_TABLES, ...ANNUAL_TABLES]) {
      const b = inputTableBlock(spec, undefined);
      if (!b.groups) continue;
      expect([spec.id, b.groups.reduce((a, g) => a + g.span, 0)]).toEqual([spec.id, b.columns.length]);
    }
    for (const r of [buildQuarterlyReport({ period: "2026-27-Q2", records: [], ...base }), buildAnnualReport({ period: "2026-27", records: [], ...base })]) {
      for (const b of r.parts.flatMap((p) => p.blocks)) {
        if (b.kind !== "table") continue;
        for (const row of b.rows) expect([b.id, row.length]).toEqual([b.id, b.columns.length]);
        if (b.groups) expect([b.id, b.groups.reduce((a, g) => a + g.span, 0)]).toEqual([b.id, b.columns.length]);
      }
    }
  });
});
