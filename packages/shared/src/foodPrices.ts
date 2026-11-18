/**
 * Food availability and prices report.
 *
 * Wards send it to the district by the 22nd of each month. It has no fixed
 * form: each officer records whatever is sold in their area (markets, shops),
 * and the app turns the cycle's prices into one tidy list. A cycle runs from
 * the 21st of the previous month to the 20th, so every price lands in exactly
 * one report; it is named after the month of the 20th.
 */
import { AVAILABILITY, PRICE_TYPES, PRICE_UNITS, commodityKey, commodityLabel, labelOf } from "./catalogs.ts";
import { financialYear, monthKey, monthLabel, parseMonth, shiftMonth } from "./period.ts";
import type { Cell, Report } from "./report/model.ts";

export const FOOD_CYCLE_LAST_DAY = 20;
export const FOOD_REPORT_DUE_DAY = 22;

export type FoodCycle = {
  /** "2026-11" for 21 Oct – 20 Nov 2026. */
  period: string;
  start: number;
  /** Exclusive: midnight starting the 21st. */
  end: number;
  due: number;
  label: string;
};

export function foodCycle(period: string): FoodCycle {
  const { year, month } = parseMonth(period);
  const start = new Date(year, month - 2, FOOD_CYCLE_LAST_DAY + 1).getTime();
  const end = new Date(year, month - 1, FOOD_CYCLE_LAST_DAY + 1).getTime();
  const due = new Date(year, month - 1, FOOD_REPORT_DUE_DAY, 23, 59).getTime();
  return { period, start, end, due, label: monthLabel(period) };
}

/** The cycle a date falls in: 21 Nov belongs to December's report. */
export function foodCycleFor(date: Date | number): FoodCycle {
  const d = new Date(date);
  const key = d.getDate() > FOOD_CYCLE_LAST_DAY ? monthKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)) : monthKey(d);
  return foodCycle(key);
}

/**
 * The report an officer should be working on: until the due date it is the
 * cycle that just closed (or is closing); after the 22nd, the next one.
 */
export function currentFoodReport(now: Date | number): FoodCycle {
  const d = new Date(now);
  const thisMonth = foodCycle(monthKey(d));
  return d.getTime() <= thisMonth.due ? thisMonth : foodCycleFor(d);
}

/**
 * The report a new price belongs to. It goes into the report being worked on,
 * unless that report is already sealed (sent), in which case it starts the next one.
 */
export function foodPeriodForEntry(now: Date | number, sealed: ReadonlySet<string>): string {
  const current = currentFoodReport(now).period;
  return sealed.has(current) ? shiftMonth(current, 1) : current;
}

/** True from the 20th until the report is sent: time to review and send. */
export function foodReportReady(now: Date | number, cycle: FoodCycle): boolean {
  const t = new Date(now).getTime();
  return t >= new Date(cycle.end - 86_400_000).getTime();
}

export type FoodPriceRow = {
  key: string;
  commodity: string;
  unit: string;
  /** Average of all prices recorded in the cycle, Tsh, rounded to the shilling. */
  average: number;
  min: number;
  max: number;
  count: number;
  /** Most frequently recorded availability, if any. */
  availability: string | null;
  /** Where prices came from, e.g. "Sokoni, Dukani (rejareja)". */
  sources: string;
};

type PriceRecord = { type: string; occurredAt: number; payload: Record<string, unknown>; deletedAt?: number };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const AVAIL_ORDER = AVAILABILITY.map((a) => a.value);

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [v, c] of counts) {
    // Ties go to the scarcer level, which is what a food security report must not miss.
    if (c > bestN || (c === bestN && best !== null && AVAIL_ORDER.indexOf(v) > AVAIL_ORDER.indexOf(best))) {
      best = v;
      bestN = c;
    }
  }
  return best;
}

/** The spelling used most often, with a capital first letter ("sukari", "Sukari", "Sukari" → "Sukari"). */
function displayName(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n.trim(), (counts.get(n.trim()) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || (/^[A-Z]/.test(b[0]) ? 1 : 0) - (/^[A-Z]/.test(a[0]) ? 1 : 0))[0]?.[0] ?? "";
  return best.charAt(0).toUpperCase() + best.slice(1);
}

/** One row per item and unit (kg and debe are never averaged together). */
export function compileFoodPrices(records: readonly PriceRecord[], cycle: FoodCycle): FoodPriceRow[] {
  const prices = records.filter((r) => {
    if (r.type !== "price" || r.deletedAt || num(r.payload.price) <= 0) return false;
    // Prices recorded since the quick entry carry their report; older ones go by date.
    const tagged = r.payload.foodPeriod;
    return typeof tagged === "string" ? tagged === cycle.period : r.occurredAt >= cycle.start && r.occurredAt < cycle.end;
  });
  const groups = new Map<string, PriceRecord[]>();
  for (const r of prices) {
    const k = `${commodityKey(r.payload.commodity)}|${r.payload.unit}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const values = g.map((r) => num(r.payload.price));
      const types = [...new Set(g.map((r) => String(r.payload.priceType ?? "")).filter(Boolean))];
      return {
        key,
        commodity: displayName(g.map((r) => commodityLabel(r.payload.commodity))),
        unit: labelOf(PRICE_UNITS, g[0]!.payload.unit) || String(g[0]!.payload.unit ?? ""),
        average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
        availability: mostCommon(g.map((r) => String(r.payload.availability ?? ""))),
        sources: types.map((t) => labelOf(PRICE_TYPES, t)).join(", "),
      };
    })
    .sort((a, b) => a.commodity.localeCompare(b.commodity) || a.unit.localeCompare(b.unit));
}

/** What gets submitted: the officer's chosen rows and a note. */
export type FoodReportPayload = {
  rows: Omit<FoodPriceRow, "key" | "sources">[];
  note?: string;
};

export type CombinedFoodRow = {
  commodity: string;
  unit: string;
  /** Average of the ward averages, weighted by how many prices each ward recorded. */
  average: number;
  min: number;
  max: number;
  wards: number;
  prices: number;
  availability: string | null;
};

/** HQ: one council-wide list from the wards' submitted reports. */
export function combineFoodReports(reports: readonly FoodReportPayload[]): CombinedFoodRow[] {
  const groups = new Map<string, { commodity: string; unit: string; rows: FoodReportPayload["rows"] }>();
  for (const rep of reports) {
    for (const row of rep.rows) {
      const k = `${commodityKey(row.commodity)}|${row.unit.toLowerCase()}`;
      const g = groups.get(k) ?? { commodity: row.commodity, unit: row.unit, rows: [] };
      g.rows.push(row);
      groups.set(k, g);
    }
  }
  return [...groups.values()]
    .map((g) => {
      const prices = g.rows.reduce((a, r) => a + Math.max(1, r.count), 0);
      return {
        commodity: g.commodity,
        unit: g.unit,
        average: Math.round(g.rows.reduce((a, r) => a + r.average * Math.max(1, r.count), 0) / prices),
        min: Math.min(...g.rows.map((r) => r.min)),
        max: Math.max(...g.rows.map((r) => r.max)),
        wards: g.rows.length,
        prices,
        availability: mostCommon(g.rows.map((r) => r.availability ?? "")),
      };
    })
    .sort((a, b) => a.commodity.localeCompare(b.commodity));
}

export function availabilityLabel(v: string | null | undefined): string {
  return v ? labelOf(AVAILABILITY, v) : "";
}

const MAX_ROWS = 300;

/** Server-side check of a submitted food report. */
export function validateFoodReport(p: unknown): string | null {
  if (!p || typeof p !== "object") return "NOT_OBJECT";
  const { rows, note } = p as Record<string, unknown>;
  if (!Array.isArray(rows) || rows.length === 0) return "NO_ROWS";
  if (rows.length > MAX_ROWS) return "TOO_MANY_ROWS";
  if (note !== undefined && (typeof note !== "string" || note.length > 3000)) return "BAD_NOTE";
  for (const r of rows) {
    if (!r || typeof r !== "object") return "BAD_ROW";
    const row = r as Record<string, unknown>;
    if (typeof row.commodity !== "string" || !row.commodity.trim() || row.commodity.length > 80) return "BAD_COMMODITY";
    if (typeof row.unit !== "string" || row.unit.length > 30) return "BAD_UNIT";
    for (const k of ["average", "min", "max", "count"]) {
      const v = row[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e9) return `BAD_NUMBER:${k}`;
    }
    if (row.availability !== null && row.availability !== undefined && !AVAIL_ORDER.includes(String(row.availability))) return "BAD_AVAILABILITY";
  }
  return null;
}

export const SUBMISSION_KINDS = ["food_prices", "monthly"] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

/** Server-side check of a sent monthly report (the Report model built on the phone or the server). */
export function validateMonthlyReport(p: unknown, month: string): string | null {
  if (!p || typeof p !== "object") return "NOT_OBJECT";
  const r = p as Record<string, unknown>;
  if (r.kind !== "monthly" || r.month !== month) return "BAD_KIND";
  if (!Array.isArray(r.parts) || r.parts.length === 0 || r.parts.length > 30) return "BAD_PARTS";
  if (!r.header || typeof r.header !== "object") return "BAD_HEADER";
  if (JSON.stringify(p).length > 600_000) return "TOO_LARGE";
  return null;
}

/**
 * A sent food report as a printable report (the same shape as the ARDS
 * monthly report), so HQ's reader and the Word export show it the same way.
 */
export function foodReportAsReport(
  payload: FoodReportPayload,
  meta: { period: string; areaLabel: string; officerName: string; phone?: string | null; councilName?: string },
): Report {
  const cycle = foodCycle(meta.period);
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const rows: Cell[][] = payload.rows.map((r) => [r.commodity, r.unit, r.average, r.min === r.max ? "" : `${r.min.toLocaleString("en-US")}–${r.max.toLocaleString("en-US")}`, r.count, availabilityLabel(r.availability)]);
  return {
    kind: "food",
    formVersion: "2018-07",
    month: meta.period,
    header: {
      ministry: meta.councilName ? meta.councilName.toUpperCase() : "OFISI YA RAIS - TAWALA ZA MIKOA NA SERIKALI ZA MITAA (OR-TAMISEMI)",
      title: "TAARIFA YA UPATIKANAJI WA CHAKULA NA BEI",
      edition: "",
      areaLabel: meta.areaLabel,
      officerName: meta.officerName,
      phone: meta.phone ?? "",
      monthLabel: `${cycle.label} (${day(cycle.start)} – ${day(cycle.end - 1)})`,
      periodName: "Kipindi",
      financialYear: financialYear(meta.period),
      submitNote: "Inatakiwa tarehe 22 ya kila mwezi.",
      instructions: [],
    },
    parts: [
      {
        id: "bei",
        number: "1",
        title: "Bei na upatikanaji",
        blocks: [
          {
            kind: "table",
            id: "bei",
            columns: [
              { label: "Bidhaa" },
              { label: "Kipimo" },
              { label: "Bei ya wastani (Tsh)" },
              { label: "Chini–juu (Tsh)" },
              { label: "Idadi ya bei" },
              { label: "Upatikanaji" },
            ],
            rows,
            hasData: rows.length > 0,
          },
        ],
      },
      {
        id: "maelezo",
        number: "2",
        title: "Maelezo kuhusu hali ya chakula",
        blocks: [{ kind: "text", id: "maelezo", text: payload.note ?? "", hasData: Boolean(payload.note), source: payload.note ? "review" : "empty" }],
      },
    ],
  };
}
