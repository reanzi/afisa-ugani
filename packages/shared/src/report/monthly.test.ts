import { describe, expect, it } from "vitest";
import { buildMonthlyReport, suggestRainLevel, type ReportRecord, type TableBlock, type TextBlock } from "./monthly.ts";
import { validatePayload } from "../actions.ts";
import { financialYear, fyQuarter, monthRange } from "../period.ts";

const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).getTime(); // November 2026
const rec = (type: string, day: number, payload: Record<string, unknown>, extra: Partial<ReportRecord> = {}): ReportRecord => ({
  type,
  section: "kilimo",
  occurredAt: at(day),
  payload,
  ...extra,
});

function build(records: ReportRecord[], review = null as Parameters<typeof buildMonthlyReport>[0]["review"]) {
  return buildMonthlyReport({ month: "2026-11", records, review, areaLabel: "Kijiji cha Changarawe", officerName: "Neema" });
}
function tableOf(r: ReturnType<typeof build>, id: string): TableBlock {
  const b = r.parts.flatMap((p) => p.blocks).find((x) => x.id === id);
  if (!b || b.kind !== "table") throw new Error(`no table ${id}`);
  return b;
}
function textOf(r: ReturnType<typeof build>, id: string): TextBlock {
  const b = r.parts.flatMap((p) => p.blocks).find((x) => x.id === id);
  if (!b || b.kind !== "text") throw new Error(`no text ${id}`);
  return b;
}

describe("monthly report", () => {
  it("prints zeros, not blanks, for fixed rows with no records", () => {
    const r = build([]);
    const slaughter = tableOf(r, "4");
    expect(slaughter.rows[0]).toEqual(["Ng’ombe", 0, 0]);
    expect(slaughter.hasData).toBe(false);
    expect(tableOf(r, "6.3").rows[2]).toEqual(["Jumla", 0]);
  });

  it("ignores other months and deleted records", () => {
    const r = build([
      rec("slaughter", 3, { animal: "ngombe", count: 4 }),
      rec("slaughter", 3, { animal: "ngombe", count: 9 }, { deletedAt: at(4) }),
      { ...rec("slaughter", 1, { animal: "ngombe", count: 7 }), occurredAt: new Date(2026, 9, 31, 23).getTime() },
    ]);
    expect(tableOf(r, "4").rows[0]![1]).toBe(4);
  });

  it("counts rain days once per day and sums millimetres", () => {
    const r = build([
      rec("rainfall", 2, { mm: 12 }),
      { ...rec("rainfall", 2, { mm: 3.5 }), occurredAt: at(2, 17) },
      rec("rainfall", 9, {}),
    ]);
    const row = tableOf(r, "1.1a").rows[0]!;
    expect(row[0]).toBe(15.5);
    expect(row[2]).toBe(2);
    expect(row[1]).toBe("Kidogo");
  });

  it("uses the officer's review over suggestions", () => {
    const r = build([rec("rainfall", 2, {})], { month: "2026-11", rainLevel: "wastani", achievements: "Wakulima 40 wamepanda kwa mistari." });
    expect(tableOf(r, "1.1a").rows[0]![1]).toBe("Wastani");
    expect(textOf(r, "1.3a").text).toContain("Wakulima 40");
    expect(textOf(r, "1.3a").source).toBe("review");
  });

  it("drafts 1.2 from the month's work when the officer wrote nothing", () => {
    const r = build([
      rec("training", 4, { topic: "Kupanda kwa mistari", method: "shamba_darasa", men: 10, women: 15 }),
      rec("activity", 6, { text: "Kikao na viongozi wa kijiji" }),
    ]);
    const work = textOf(r, "1.2");
    expect(work.source).toBe("records");
    expect(work.text).toContain("Mafunzo 1 kwa wakulima/wafugaji 25 (wanawake 15)");
    expect(work.text).toContain("Kikao na viongozi wa kijiji");
  });

  it("groups outbreaks by pest and crop, with totals, and splits chemical from biological", () => {
    const r = build([
      rec("pest_outbreak", 3, { pest: "Viwavijeshi vamizi", crop: "mahindi", severity: "wastani", areaAffectedHa: 2, households: 5, pesticide: "Duduba", quantity: 1.5, unit: "lita", areaSavedHa: 1.5 }, { areaId: "v1" }),
      rec("pest_outbreak", 8, { pest: "viwavijeshi  vamizi", crop: "mahindi", severity: "kubwa", areaAffectedHa: 3, households: 8, pesticide: "Duduba", quantity: 2, unit: "lita" }, { areaId: "v2" }),
      rec("pest_outbreak", 9, { pest: "Kwelea kwelea", crop: "mpunga", severity: "kidogo", areaAffectedHa: 1, method: "kibaiolojia" }, { areaId: "v1" }),
    ]);
    const chem = tableOf(r, "3.1");
    expect(chem.rows).toHaveLength(2);
    expect(chem.rows[0]).toEqual(["Viwavijeshi vamizi", "Mahindi", "Kubwa", 5, 2, "Duduba", 3.5, "lt", 2, 13, 1.5, ""]);
    expect(chem.rows[1]![0]).toBe("Jumla");
    expect(chem.rows[1]![3]).toBe(5);
    expect(tableOf(r, "3.2").rows[0]![0]).toBe("Kwelea kwelea");
  });

  it("weights slaughter prices by number of animals", () => {
    const r = build([
      rec("slaughter", 3, { animal: "mbuzi", count: 3, pricePerKg: 9000 }),
      rec("slaughter", 5, { animal: "mbuzi", count: 1, pricePerKg: 13000 }),
    ]);
    expect(tableOf(r, "4").rows[2]).toEqual(["Mbuzi", 4, 10000]);
  });

  it("fills milk, hides and eggs", () => {
    const r = build([
      rec("livestock_products", 3, { product: "maziwa_kisasa", quantity: 300, price: 1200 }),
      rec("livestock_products", 4, { product: "maziwa_kisasa", quantity: 300, price: 1000 }),
      rec("livestock_products", 4, { product: "ngozi_mbuzi", quantity: 6, processing: "chumvi", price: 2500 }),
      rec("livestock_products", 4, { product: "mayai_kienyeji", quantity: 90 }),
    ]);
    expect(tableOf(r, "6.1").rows[1]).toEqual(["Maziwa ya ng’ombe wa kisasa (lita)", 600, 20, 1100]);
    expect(tableOf(r, "6.2a").rows[1]).toEqual(["Ngozi za mbuzi", 0, 6, 0, ""]);
    expect(tableOf(r, "6.2b").rows[1]![2]).toBe(2500);
    expect(tableOf(r, "6.3").rows[2]).toEqual(["Jumla", 90]);
  });

  it("builds treatment, vaccination and service tables", () => {
    const r = build([
      rec("livestock_treatment", 2, { animal: "ngombe", disease: "Ndigana kali (ECF)", affected: 6, treated: 6, recovered: 5, died: 1, drug: "Butalex" }),
      rec("livestock_treatment", 9, { animal: "ngombe", disease: "ndigana kali (ecf)", affected: 2, treated: 2, recovered: 2 }),
      rec("vaccination", 3, { animal: "kuku", method: "chanjo", count: 120, product: "I-2" }),
      rec("vaccination", 4, { animal: "ngombe", method: "kuogesha", count: 40, product: "Paranex" }),
      rec("livestock_service", 5, { animal: "ngombe", service: "ai", count: 3 }),
    ]);
    expect(tableOf(r, "7.1").rows[0]).toEqual(["Ng’ombe", "Ndigana kali (ECF)", 8, 8, 7, 1, "Butalex"]);
    const vac = tableOf(r, "7.2").rows;
    expect(vac.find((x) => x[0] === "Kuku")).toEqual(["Kuku", 0, 0, 120, "I-2", ""]);
    expect(vac.find((x) => x[0] === "Ng’ombe")).toEqual(["Ng’ombe", 40, 0, 0, "", "Paranex"]);
    expect(tableOf(r, "7.3").rows[0]![3]).toBe(3);
  });

  it("computes implementation harvest when only area and yield are given, and takes market prices per kg", () => {
    const r = build(
      [
        rec("price", 3, { commodity: "mahindi", priceType: "sokoni", unit: "kg", price: 700 }),
        rec("price", 4, { commodity: "mahindi", priceType: "shambani", unit: "kg", price: 500 }),
        rec("price", 4, { commodity: "mahindi", priceType: "sokoni", unit: "debe", price: 12000 }),
      ],
      { month: "2026-11", crops: { mahindi: { planted: 120, harvested: 100, yield: 1.8 } } },
    );
    expect(tableOf(r, "2.1b").rows[0]).toEqual(["Mahindi", 120, 100, 1.8, 180, 700, ""]);
  });

  it("leaves annual targets empty outside July", () => {
    const r = build([], { month: "2026-11", targets: { mahindi: { area: 500, yield: 2 } } });
    expect(tableOf(r, "2.1a").rows[0]).toEqual(["Mahindi", "", "", ""]);
    const july = buildMonthlyReport({ month: "2026-07", records: [], review: { month: "2026-07", targets: { mahindi: { area: 500, yield: 2 } } }, areaLabel: "", officerName: "" });
    expect(tableOf(july, "2.1a").rows[0]).toEqual(["Mahindi", 500, 2, 1000]);
  });

  it("header carries the financial year", () => {
    expect(build([]).header.financialYear).toBe("2026/27");
  });
});

describe("periods", () => {
  it("financial year and quarter start in July", () => {
    expect(financialYear("2027-03")).toBe("2026/27");
    expect(financialYear("2026-07")).toBe("2026/27");
    expect(fyQuarter("2026-07")).toBe(1);
    expect(fyQuarter("2026-11")).toBe(2);
    expect(fyQuarter("2027-02")).toBe(3);
    expect(fyQuarter("2027-06")).toBe(4);
  });
  it("month range covers the whole month", () => {
    const { start, end } = monthRange("2026-02");
    expect(new Date(start).getDate()).toBe(1);
    expect((end - start) / 86_400_000).toBe(28);
  });
  it("suggests a rain level from rainy days", () => {
    expect(suggestRainLevel(0, 30)).toBe("hakuna");
    expect(suggestRainLevel(14, 30)).toBe("nyingi");
  });
});

describe("payload validation", () => {
  it("accepts a valid treatment and rejects bad values", () => {
    expect(validatePayload("livestock_treatment", { animal: "ngombe", disease: "ECF", affected: 2, treated: 2 })).toBeNull();
    expect(validatePayload("livestock_treatment", { animal: "simba", disease: "ECF", affected: 2, treated: 2 })).toBe("BAD_OPTION:animal");
    expect(validatePayload("livestock_treatment", { animal: "ngombe", disease: "ECF", affected: -1, treated: 2 })).toBe("BAD_NUMBER:affected");
    expect(validatePayload("livestock_treatment", { animal: "ngombe", affected: 2, treated: 2 })).toBe("MISSING:disease");
  });
  it("requires processing only for hides", () => {
    expect(validatePayload("livestock_products", { product: "maziwa_asili", quantity: 20 })).toBeNull();
    expect(validatePayload("livestock_products", { product: "ngozi_ngombe", quantity: 2 })).toBe("MISSING:processing");
  });
  it("checks the monthly review shape", () => {
    expect(validatePayload("monthly_review", { month: "2026-11", crops: { mahindi: { planted: 3 } } })).toBeNull();
    expect(validatePayload("monthly_review", { month: "2026-13" })).toBe("BAD_MONTH");
    expect(validatePayload("unknown", {})).toBe("UNKNOWN_TYPE");
  });
});
