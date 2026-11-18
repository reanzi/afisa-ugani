import { describe, expect, it } from "vitest";
import {
  combineFoodReports,
  compileFoodPrices,
  currentFoodReport,
  foodCycle,
  foodCycleFor,
  validateFoodReport,
} from "./foodPrices.ts";
import { commodityKey, commodityLabel } from "./catalogs.ts";
import { validatePayload } from "./actions.ts";

const at = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).getTime();
const price = (when: number, payload: Record<string, unknown>) => ({ type: "price", occurredAt: when, payload });

describe("food price cycle", () => {
  it("runs from the 21st of last month to the 20th", () => {
    const c = foodCycle("2026-11");
    expect(new Date(c.start).getDate()).toBe(21);
    expect(new Date(c.start).getMonth()).toBe(9); // October
    expect(new Date(c.end - 1).getDate()).toBe(20);
    expect(foodCycleFor(at(11, 20, 23)).period).toBe("2026-11");
    expect(foodCycleFor(at(11, 21, 1)).period).toBe("2026-12");
    expect(foodCycleFor(at(12, 25)).period).toBe("2027-01");
  });
  it("keeps the closing cycle open for submission until the 22nd", () => {
    expect(currentFoodReport(at(11, 18)).period).toBe("2026-11");
    expect(currentFoodReport(at(11, 22, 20)).period).toBe("2026-11");
    expect(currentFoodReport(at(11, 23)).period).toBe("2026-12");
  });
});

describe("compiling prices", () => {
  const cycle = foodCycle("2026-11");
  const records = [
    price(at(10, 25), { commodity: "Sukari", unit: "kg", price: 3000, priceType: "rejareja", availability: "wastani" }),
    price(at(11, 5), { commodity: " sukari ", unit: "kg", price: 3200, priceType: "sokoni", availability: "haba" }),
    price(at(11, 12), { commodity: "SUKARI", unit: "kg", price: 3400, priceType: "rejareja", availability: "haba" }),
    price(at(11, 12), { commodity: "Mahindi", unit: "debe", price: 14000, priceType: "sokoni" }),
    price(at(11, 13), { commodity: "mahindi", unit: "kg", price: 750, priceType: "sokoni" }), // old id form
    price(at(11, 21), { commodity: "Sukari", unit: "kg", price: 9999, priceType: "sokoni" }), // next cycle
    price(at(10, 20), { commodity: "Sukari", unit: "kg", price: 1, priceType: "sokoni" }), // previous cycle
    { ...price(at(11, 2), { commodity: "Sukari", unit: "kg", price: 1, priceType: "sokoni" }), deletedAt: at(11, 3) },
  ];

  it("averages each item and unit within the cycle only", () => {
    const rows = compileFoodPrices(records, cycle);
    const sugar = rows.find((r) => r.commodity === "Sukari")!;
    expect(sugar).toMatchObject({ unit: "kg", average: 3200, min: 3000, max: 3400, count: 3, availability: "haba" });
    expect(sugar.sources).toBe("Dukani (rejareja), Sokoni");
    expect(rows.filter((r) => commodityKey(r.commodity) === "mahindi").map((r) => r.unit).sort()).toEqual(["Debe", "kg"]);
    expect(rows).toHaveLength(3);
  });

  it("treats the old catalogue id and the typed name as the same item", () => {
    expect(commodityLabel("mahindi")).toBe("Mahindi");
    expect(commodityKey("mahindi")).toBe(commodityKey("MAHINDI "));
  });
});

describe("council summary for HQ", () => {
  it("weights each ward's average by how many prices it recorded", () => {
    const combined = combineFoodReports([
      { rows: [{ commodity: "Sukari", unit: "kg", average: 3000, min: 2900, max: 3100, count: 3, availability: "wastani" }] },
      { rows: [{ commodity: "sukari", unit: "kg", average: 3400, min: 3300, max: 3600, count: 1, availability: "haba" }] },
    ]);
    expect(combined).toEqual([
      { commodity: "Sukari", unit: "kg", average: 3100, min: 2900, max: 3600, wards: 2, prices: 4, availability: "haba" },
    ]);
  });
});

describe("validation", () => {
  it("accepts any typed item in a price entry, and older catalogue ids", () => {
    expect(validatePayload("price", { commodity: "Mafuta ya kupikia", unit: "lita", price: 6500, priceType: "rejareja", availability: "wingi" })).toBeNull();
    expect(validatePayload("price", { commodity: "mahindi", unit: "kg", price: 700, priceType: "sokoni" })).toBeNull();
    expect(validatePayload("price", { commodity: "Sukari", unit: "kg", price: 3000, priceType: "sokoni", availability: "nyingi" })).toBe("BAD_OPTION:availability");
  });
  it("checks a submitted report", () => {
    expect(validateFoodReport({ rows: [{ commodity: "Sukari", unit: "kg", average: 3000, min: 3000, max: 3000, count: 1, availability: null }] })).toBeNull();
    expect(validateFoodReport({ rows: [] })).toBe("NO_ROWS");
    expect(validateFoodReport({ rows: [{ commodity: "Sukari", unit: "kg", average: -1, min: 0, max: 0, count: 1 }] })).toBe("BAD_NUMBER:average");
  });
});
