import { describe, expect, it } from "vitest";
import {
  ARABLE_KEY,
  buildPerformance,
  monthsToDate,
  periodLabel,
  periodMonths,
  periodOf,
  planKey,
  presetSection,
  validatePreset,
  yieldKey,
} from "./production.ts";
import { buildMonthlyReport, type ReportRecord, type TableBlock } from "./report/monthly.ts";
import { monthRange } from "./period.ts";

const at = (month: string, day = 10) => monthRange(month).start + (day - 1) * 86_400_000 + 3_600_000;
const review = (month: string, crops: Record<string, Record<string, number>>): ReportRecord => ({
  type: "monthly_review",
  section: "kilimo",
  occurredAt: at(month, 28),
  payload: { month, crops },
});
const tableOf = (rep: { parts: { blocks: unknown[] }[] }, id: string) =>
  rep.parts.flatMap((p) => p.blocks).find((b) => (b as TableBlock).id === id) as TableBlock;

describe("presets and plans", () => {
  it("checks yields, arable area and plans", () => {
    expect(validatePreset(yieldKey("mahindi"), 2.5)).toBeNull();
    expect(validatePreset(yieldKey("mahindi"), 0)).toBe("OUT_OF_RANGE");
    expect(validatePreset(yieldKey("hakuna_zao"), 2)).toBe("UNKNOWN_PRESET");
    expect(validatePreset(ARABLE_KEY, 1200)).toBeNull();
    expect(validatePreset(planKey("2026/27", "kilimo"), { crops: { mahindi: { area: 500 } }, targets: { kilimo_mafunzo: 300 } })).toBeNull();
    expect(validatePreset(planKey("2026/27", "mifugo"), { crops: { mahindi: { area: 5 } } })).toBe("CROPS_ONLY_KILIMO");
    expect(validatePreset(planKey("2026/27", "mifugo"), { targets: { samaki: 5 } })).toBe("UNKNOWN_TARGET:samaki");
    expect(presetSection(planKey("2026/27", "uvuvi"))).toBe("uvuvi");
    expect(presetSection(yieldKey("mpunga"))).toBe("kilimo");
  });

  it("names the quarters of the financial year", () => {
    expect(periodOf("2026-11")).toEqual({ fy: "2026/27", quarter: 2 });
    expect(periodMonths({ fy: "2026/27", quarter: 3 })).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(monthsToDate({ fy: "2026/27", quarter: null }, "2026-09")).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(periodLabel({ fy: "2026/27", quarter: 2 })).toBe("Robo ya 2 ya 2026/27 (Oktoba–Desemba)");
  });
});

describe("performance", () => {
  const base = {
    sections: ["kilimo", "mifugo"] as const,
    areaLabel: "Kata ya Dunda",
    officerName: "Neema Mushi",
  };
  const records: ReportRecord[] = [
    review("2026-09", { mahindi: { planted: 200 } }),
    review("2026-12", { mahindi: { planted: 400, harvested: 100 }, maharage: { planted: 50, harvested: 50 } }),
    review("2027-02", { mahindi: { planted: 450, harvested: 300 } }),
    { type: "livestock_products", section: "mifugo", occurredAt: at("2026-10"), payload: { product: "maziwa_asili", quantity: 1000 } },
    { type: "livestock_products", section: "mifugo", occurredAt: at("2026-11"), payload: { product: "maziwa_kisasa", quantity: 500 } },
    { type: "livestock_products", section: "mifugo", occurredAt: at("2026-08"), payload: { product: "maziwa_asili", quantity: 300 } },
    { type: "training", section: "kilimo", occurredAt: at("2026-11"), payload: { men: 12, women: 18 } },
  ];
  const plans = {
    kilimo: { crops: { mahindi: { area: 500 }, maharage: { area: 100 } }, targets: { kilimo_mafunzo: 200 } },
    mifugo: { targets: { maziwa: 12_000 } },
  };

  it("compares the plan with results to the end of the quarter, using approved yields", () => {
    const { report, missing } = buildPerformance({
      ...base,
      period: { fy: "2026/27", quarter: 2 },
      asOf: "2027-01",
      records,
      plans,
      presets: { [yieldKey("mahindi")]: 2, [yieldKey("maharage")]: 0.8 },
    });
    const crops = tableOf(report, "k1");
    // Season to date at the end of December: the December review, not later ones.
    expect(crops.rows[0]).toEqual(["Mahindi", 500, 2, 1000, 400, 80, 100, 200, 20]);
    expect(crops.rows[1]).toEqual(["Maharage", 100, 0.8, 80, 50, 50, 50, 40, 50]);
    expect(crops.rows[2]).toEqual(["Jumla", 600, "", 1080, 450, 75, 150, 240, 22]);
    const milk = tableOf(report, "mifugo-m").rows[0]!;
    // Year target 12,000 l; six months gone; 1,500 l this quarter; 1,800 l in the year so far.
    expect(milk).toEqual(["Maziwa yaliyozalishwa", "lita", 12000, 6000, 1500, 1800, 15]);
    expect(missing.map((m) => m.key)).toEqual([ARABLE_KEY]);
    expect(report.kind).toBe("performance");
    expect(report.parts[0]!.blocks[0]).toMatchObject({ kind: "text" });
  });

  it("asks for a yield only when a crop needs one", () => {
    const { report, missing } = buildPerformance({
      ...base,
      sections: ["kilimo"],
      period: { fy: "2026/27", quarter: null },
      asOf: "2027-06",
      records,
      plans,
      presets: { [yieldKey("mahindi")]: 2 },
    });
    expect(missing.map((m) => m.key)).toContain(yieldKey("maharage"));
    expect(missing.map((m) => m.key)).not.toContain(yieldKey("mahindi"));
    const mahindi = tableOf(report, "k1").rows[0]!;
    expect(mahindi.slice(4, 9)).toEqual([450, 90, 300, 600, 60]);
    // Without the bean yield the totals cannot be known.
    expect(tableOf(report, "k1").rows[2]![7]).toBe("");
  });
});

describe("monthly report uses approved presets", () => {
  it("fills yields, harvests and July targets from the approved plan", () => {
    const july = buildMonthlyReport({
      month: "2026-07",
      records: [],
      review: { month: "2026-07", crops: { mahindi: { planted: 40, harvested: 10 } }, forecast: { mahindi: { area: 60 } } },
      areaLabel: "",
      officerName: "",
      yields: { mahindi: 2.5 },
      plan: { crops: { mahindi: { area: 500 } } },
    });
    expect(tableOf(july, "2.1a").rows[0]).toEqual(["Mahindi", 500, 2.5, 1250]);
    expect(tableOf(july, "2.1b").rows[0]!.slice(0, 5)).toEqual(["Mahindi", 40, 10, 2.5, 25]);
    expect(tableOf(july, "2.2").rows[0]).toEqual(["Mahindi", 60, 150]);
  });
});
