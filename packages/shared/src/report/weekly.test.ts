import { describe, expect, it } from "vitest";
import { buildWeeklyReport, validateWeeklyReport } from "./weekly.ts";
import { fertilizerUse } from "../fertilizer.ts";
import { isWeekKey, reportingWeek, shiftWeek, weekKey, weekLabel, weekRange, weeklyWindow } from "../period.ts";
import { validatePayload } from "../actions.ts";
import { setTextLang } from "../lang.ts";

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();

describe("weeks", () => {
  it("keys a week by its Monday", () => {
    expect(weekKey(at(2026, 11, 22))).toBe("2026-11-16"); // Sunday
    expect(weekKey(at(2026, 11, 16))).toBe("2026-11-16"); // Monday
    expect(weekKey(at(2026, 11, 23))).toBe("2026-11-23");
    expect(isWeekKey("2026-11-16")).toBe(true);
    expect(isWeekKey("2026-11-17")).toBe(false);
    expect(shiftWeek("2026-11-30", 1)).toBe("2026-12-07");
  });
  it("labels and windows", () => {
    expect(weekLabel("2026-11-16", "sw")).toBe("16 – 22 Novemba 2026");
    expect(weekLabel("2026-11-30", "en")).toBe("Nov 30 – Dec 6, 2026");
    const { end } = weekRange("2026-11-16");
    expect(end).toBe(new Date(2026, 10, 23).getTime());
    expect(weeklyWindow("2026-11-16").opens).toBe(new Date(2026, 10, 22, 18).getTime()); // Sunday 18:00
    expect(weeklyWindow("2026-11-16").due).toBe(new Date(2026, 10, 23, 5).getTime()); // Monday 05:00
    expect(reportingWeek(at(2026, 11, 22, 17))).toBe("2026-11-09");
    expect(reportingWeek(at(2026, 11, 22, 19))).toBe("2026-11-16");
    expect(reportingWeek(at(2026, 11, 23, 4))).toBe("2026-11-16");
  });
});

describe("fertilizer", () => {
  const rec = (payload: Record<string, unknown>) => ({ type: "fertilizer", section: "kilimo" as const, occurredAt: at(2026, 11, 18), payload });
  it("validates an entry", () => {
    expect(validatePayload("fertilizer", { fertilizer: "dap", quantity: 2, unit: "mfuko", crop: "mahindi", areaHa: 1, subsidised: "ndiyo" })).toBeNull();
    expect(validatePayload("fertilizer", { fertilizer: "dap", quantity: 2, unit: "mfuko", crop: "mahindi", areaHa: 1 })).toBe("MISSING:subsidised");
  });
  it("adds up per type, one farmer per entry, bags in kg", () => {
    const rows = fertilizerUse([
      rec({ fertilizer: "dap", quantity: 2, unit: "mfuko", crop: "mahindi", areaHa: 1, subsidised: "ndiyo" }),
      rec({ fertilizer: "dap", quantity: 25, unit: "kg", crop: "mpunga", areaHa: 0.5, subsidised: "hapana" }),
      rec({ fertilizer: "majani", quantity: 3, unit: "lita", crop: "nyanya", areaHa: 0.25, subsidised: "hapana" }),
    ]);
    expect(rows[0]).toMatchObject({ fertilizer: "dap", kg: 125, farmers: 2, areaHa: 1.5, subsidisedKg: 100, subsidisedFarmers: 1 });
    expect(rows[1]).toMatchObject({ fertilizer: "majani", kg: 0, litres: 3, farmers: 1 });
  });
});

describe("weekly report", () => {
  const records = [
    { type: "slaughter", section: "mifugo" as const, occurredAt: at(2026, 11, 17), payload: { animal: "ngombe", count: 4, pricePerKg: 9000 } },
    { type: "slaughter", section: "mifugo" as const, occurredAt: at(2026, 11, 24), payload: { animal: "ngombe", count: 9, pricePerKg: 9000 } },
    { type: "rainfall", section: "kilimo" as const, occurredAt: at(2026, 11, 18), payload: { mm: 12 } },
    { type: "fertilizer", section: "kilimo" as const, occurredAt: at(2026, 11, 19), payload: { fertilizer: "urea", quantity: 50, unit: "kg", crop: "mahindi", areaHa: 1, subsidised: "hapana" } },
  ];
  it("livestock: only the week and the section, rain from anyone, Swahili", () => {
    setTextLang("en");
    const r = buildWeeklyReport({ week: "2026-11-16", section: "mifugo", records, areaLabel: "Kata ya Dunda", officerName: "Asha" });
    setTextLang("sw");
    expect(r.kind).toBe("weekly");
    expect(r.header.monthLabel).toBe("16 – 22 Novemba 2026");
    const slaughter = r.parts.find((p) => p.id === "4")!.blocks[0]!;
    expect(slaughter.kind === "table" && slaughter.rows[0]).toEqual(["Ng’ombe", 4, 9000]);
    const rain = r.parts[0]!.blocks[0]!;
    expect(rain.kind === "table" && rain.rows[0]![0]).toBe(12);
    expect(r.parts.some((p) => p.id === "mbolea")).toBe(false);
    expect(validateWeeklyReport(r, "2026-11-16", "mifugo")).toBeNull();
    expect(validateWeeklyReport(r, "2026-11-16", "kilimo")).toBe("BAD_KIND");
  });
  it("crops: plant health and fertilizer", () => {
    const r = buildWeeklyReport({ week: "2026-11-16", section: "kilimo", records, areaLabel: "Kata ya Dunda", officerName: "Asha" });
    expect(r.parts.map((p) => p.id)).toEqual(["1", "3", "mbolea"]);
    const f = r.parts[2]!.blocks[0]!;
    expect(f.hasData).toBe(true);
  });
});
