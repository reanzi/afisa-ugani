/**
 * Production presets, yearly plans and performance.
 *
 * Presets are the officer's own constants, such as the yield (tija) of each
 * crop in their area. They are asked for only when a calculation needs one,
 * are seen by HQ, and are used only once a section lead approves them.
 *
 * The plan is set at the start of the financial year (July): planned area per
 * crop, and yearly targets for livestock and fish. Performance compares the
 * plan with what the records show, for each quarter and for the whole year
 * (complete in June), ready for ward and village council meetings.
 */
import { ALL_CROPS, CROPS, LIVESTOCK_PRODUCTS, labelOf } from "./catalogs.ts";
import type { Section } from "./domain.ts";
import { financialYear, fyQuarter, monthLabel, monthRange, parseMonth, shiftMonth } from "./period.ts";
import type { Cell, Report, ReportPart, TableBlock, TextBlock } from "./report/model.ts";
import type { CropEstimate, MonthlyReview, ReportRecord } from "./report/monthly.ts";

// ---------- presets ----------

export type PresetDef = {
  key: string;
  section: Section;
  label: string;
  unit: string;
  hint: string;
  min: number;
  max: number;
};

export const yieldKey = (crop: string) => `tija:${crop}`;
export const ARABLE_KEY = "eneo:kilimo";

const CROP_LABEL = (crop: string) => labelOf(ALL_CROPS, crop) || crop;

/** Every numeric preset the app knows. Plans are separate (see planKey). */
export function presetDef(key: string): PresetDef | null {
  if (key.startsWith("tija:")) {
    const crop = key.slice(5);
    if (!ALL_CROPS.some((c) => c.value === crop) || crop === "nyingine") return null;
    return {
      key,
      section: "kilimo",
      label: `Tija ya ${CROP_LABEL(crop)}`,
      unit: "tani/ha",
      hint: "Wastani wa mavuno kwa hekta moja katika eneo lako, kwa msimu wa kawaida.",
      min: 0.05,
      max: 80,
    };
  }
  if (key === ARABLE_KEY) {
    return {
      key,
      section: "kilimo",
      label: "Eneo linalofaa kwa kilimo",
      unit: "ha",
      hint: "Jumla ya eneo linalofaa kwa kilimo katika eneo lako la kazi.",
      min: 1,
      max: 2_000_000,
    };
  }
  return null;
}

export function validatePresetNumber(key: string, value: unknown): string | null {
  const def = presetDef(key);
  if (!def) return "UNKNOWN_PRESET";
  if (typeof value !== "number" || !Number.isFinite(value)) return "BAD_NUMBER";
  if (value < def.min || value > def.max) return "OUT_OF_RANGE";
  return null;
}

// ---------- plans ----------

/** "mpango:2026/27:kilimo": one plan per financial year and section. */
export const planKey = (fy: string, section: Section) => `mpango:${fy}:${section}`;

export function parsePlanKey(key: string): { fy: string; section: Section } | null {
  const m = /^mpango:(\d{4}\/\d{2}):(kilimo|mifugo|uvuvi)$/.exec(key);
  return m ? { fy: m[1]!, section: m[2] as Section } : null;
}

export type ProductionPlan = {
  /** Planned area per crop (ha). Kilimo only. */
  crops?: Record<string, { area: number }>;
  /** Yearly target per metric (see PLAN_METRICS). */
  targets?: Record<string, number>;
  note?: string;
};

/** The section a preset or plan belongs to: who may set it and who approves it. */
export function presetSection(key: string): Section | null {
  return presetDef(key)?.section ?? parsePlanKey(key)?.section ?? null;
}

export function validatePlan(key: string, value: unknown): string | null {
  const parsed = parsePlanKey(key);
  if (!parsed) return "UNKNOWN_PLAN";
  if (!value || typeof value !== "object" || Array.isArray(value)) return "BAD_PLAN";
  const p = value as Record<string, unknown>;
  if (p.crops !== undefined) {
    if (parsed.section !== "kilimo") return "CROPS_ONLY_KILIMO";
    if (typeof p.crops !== "object" || p.crops === null) return "BAD_CROPS";
    for (const [crop, v] of Object.entries(p.crops as Record<string, unknown>)) {
      if (!ALL_CROPS.some((c) => c.value === crop)) return `UNKNOWN_CROP:${crop}`;
      const area = (v as { area?: unknown } | null)?.area;
      if (typeof area !== "number" || !Number.isFinite(area) || area < 0 || area > 2_000_000) return `BAD_AREA:${crop}`;
    }
  }
  if (p.targets !== undefined) {
    if (typeof p.targets !== "object" || p.targets === null) return "BAD_TARGETS";
    for (const [k, v] of Object.entries(p.targets as Record<string, unknown>)) {
      const m = PLAN_METRICS.find((x) => x.key === k);
      if (!m || m.section !== parsed.section) return `UNKNOWN_TARGET:${k}`;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e9) return `BAD_TARGET:${k}`;
    }
  }
  if (p.note !== undefined && (typeof p.note !== "string" || p.note.length > 1000)) return "BAD_NOTE";
  return null;
}

/** Validate anything an officer can propose: a numeric preset or a plan. */
export function validatePreset(key: string, value: unknown): string | null {
  return parsePlanKey(key) ? validatePlan(key, value) : validatePresetNumber(key, value);
}

/** How a preset or plan reads in a list: "Tija ya Mahindi: 2.5 tani/ha". */
export function presetLabel(key: string): string {
  const def = presetDef(key);
  if (def) return def.label;
  const plan = parsePlanKey(key);
  if (plan) return `Mpango wa uzalishaji ${plan.fy}`;
  return key;
}

export function presetValueText(key: string, value: unknown): string {
  const def = presetDef(key);
  if (def && typeof value === "number") return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${def.unit}`;
  const plan = parsePlanKey(key);
  if (plan && value && typeof value === "object") {
    const p = value as ProductionPlan;
    const crops = Object.keys(p.crops ?? {}).length;
    const targets = Object.keys(p.targets ?? {}).length;
    const parts = [crops ? `mazao ${crops}` : "", targets ? `malengo ${targets}` : ""].filter(Boolean);
    return parts.join(", ") || "tupu";
  }
  return String(value ?? "");
}

// ---------- yearly targets for livestock, fish and extension work ----------

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const productKind = (p: unknown) => LIVESTOCK_PRODUCTS.find((x) => x.value === p)?.kind;

export type PlanMetric = {
  key: string;
  section: Section;
  label: string;
  unit: string;
  /** What the records in a period add up to. */
  actual: (records: readonly ReportRecord[]) => number;
};

const ofType = (rs: readonly ReportRecord[], type: string, section?: Section) =>
  rs.filter((r) => r.type === type && (!section || r.section === section));

const trained = (section: Section) => (rs: readonly ReportRecord[]) =>
  ofType(rs, "training", section).reduce((a, r) => a + n(r.payload.men) + n(r.payload.women), 0);

export const PLAN_METRICS: readonly PlanMetric[] = [
  { key: "kilimo_mafunzo", section: "kilimo", label: "Wakulima waliopata mafunzo", unit: "watu", actual: trained("kilimo") },
  {
    key: "maziwa",
    section: "mifugo",
    label: "Maziwa yaliyozalishwa",
    unit: "lita",
    actual: (rs) => ofType(rs, "livestock_products").filter((r) => productKind(r.payload.product) === "milk").reduce((a, r) => a + n(r.payload.quantity), 0),
  },
  {
    key: "mayai",
    section: "mifugo",
    label: "Mayai yaliyozalishwa",
    unit: "mayai",
    actual: (rs) => ofType(rs, "livestock_products").filter((r) => productKind(r.payload.product) === "eggs").reduce((a, r) => a + n(r.payload.quantity), 0),
  },
  {
    key: "ngozi",
    section: "mifugo",
    label: "Ngozi zilizokusanywa",
    unit: "vipande",
    actual: (rs) => ofType(rs, "livestock_products").filter((r) => productKind(r.payload.product) === "hide").reduce((a, r) => a + n(r.payload.quantity), 0),
  },
  { key: "chanjo", section: "mifugo", label: "Mifugo iliyochanjwa / kuogeshwa", unit: "mifugo", actual: (rs) => ofType(rs, "vaccination").reduce((a, r) => a + n(r.payload.count), 0) },
  { key: "tiba", section: "mifugo", label: "Mifugo iliyotibiwa", unit: "mifugo", actual: (rs) => ofType(rs, "livestock_treatment").reduce((a, r) => a + n(r.payload.treated), 0) },
  { key: "machinjio", section: "mifugo", label: "Mifugo iliyochinjwa na kukaguliwa", unit: "mifugo", actual: (rs) => ofType(rs, "slaughter").reduce((a, r) => a + n(r.payload.count), 0) },
  { key: "mifugo_mafunzo", section: "mifugo", label: "Wafugaji waliopata mafunzo", unit: "watu", actual: trained("mifugo") },
  { key: "samaki", section: "uvuvi", label: "Samaki waliovunwa", unit: "kg", actual: (rs) => ofType(rs, "fish_farming").reduce((a, r) => a + n(r.payload.harvestKg), 0) },
  { key: "uvuvi_mafunzo", section: "uvuvi", label: "Wafugaji wa samaki waliopata mafunzo", unit: "watu", actual: trained("uvuvi") },
];

export const metricsFor = (section: Section) => PLAN_METRICS.filter((m) => m.section === section);

// ---------- financial-year periods ----------

/** July of the year a financial year starts: "2026/27" → "2026-07". */
export function fyStartMonth(fy: string): string {
  return `${fy.slice(0, 4)}-07`;
}

export function fyMonths(fy: string): string[] {
  const start = fyStartMonth(fy);
  return Array.from({ length: 12 }, (_, i) => shiftMonth(start, i));
}

/** A quarter of the financial year, or the whole year (quarter null). */
export type PerfPeriod = { fy: string; quarter: 1 | 2 | 3 | 4 | null };

export function periodMonths(p: PerfPeriod): string[] {
  const all = fyMonths(p.fy);
  return p.quarter ? all.slice((p.quarter - 1) * 3, p.quarter * 3) : all;
}

const QUARTER_NAMES = ["Julai–Septemba", "Oktoba–Desemba", "Januari–Machi", "Aprili–Juni"];

export function periodLabel(p: PerfPeriod): string {
  if (!p.quarter) return `Mwaka wa fedha ${p.fy} (Julai–Juni)`;
  return `Robo ya ${p.quarter} ya ${p.fy} (${QUARTER_NAMES[p.quarter - 1]})`;
}

/** The quarter a month falls in. */
export function periodOf(month: string): PerfPeriod {
  return { fy: financialYear(month), quarter: fyQuarter(month) };
}

/** Months of the period that have started by `month` (to date). */
export function monthsToDate(p: PerfPeriod, month: string): string[] {
  return periodMonths(p).filter((m) => m <= month);
}

// ---------- performance ----------

export type PerformanceInput = {
  period: PerfPeriod;
  /** Today's month: later months in the period are not counted yet. */
  asOf: string;
  /** All the officer's records (reviews included). */
  records: readonly ReportRecord[];
  sections: readonly Section[];
  /** Approved plans by section; null when none is approved. */
  plans: Partial<Record<Section, ProductionPlan | null>>;
  /** Approved numeric presets by key. */
  presets: Record<string, number>;
  areaLabel: string;
  officerName: string;
  phone?: string | null;
};

/** A preset a calculation needs but the officer has not set (or HQ has not approved). */
export type MissingPreset = { key: string; label: string; reason: string; optional?: boolean };

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const pct = (part: number, whole: number): Cell => (whole > 0 ? Math.round((part / whole) * 100) : "");

function inMonths(records: readonly ReportRecord[], months: string[]): ReportRecord[] {
  if (months.length === 0) return [];
  const start = monthRange(months[0]!).start;
  const end = monthRange(months[months.length - 1]!).end;
  return records.filter((r) => !r.deletedAt && r.type !== "monthly_review" && r.occurredAt >= start && r.occurredAt < end);
}

/**
 * Crop figures from the month-end reviews are for the season so far, so the
 * latest value up to the end of the period counts (not a sum).
 */
function latestCropFigures(records: readonly ReportRecord[], fy: string, lastMonth: string): Map<string, CropEstimate> {
  const reviews = records
    .filter((r) => r.type === "monthly_review" && !r.deletedAt)
    .map((r) => r.payload as unknown as MonthlyReview)
    .filter((r) => typeof r.month === "string" && financialYear(r.month) === fy && r.month <= lastMonth)
    .sort((a, b) => a.month.localeCompare(b.month));
  const out = new Map<string, CropEstimate>();
  for (const rv of reviews) {
    for (const [crop, e] of Object.entries(rv.crops ?? {})) {
      const cur = { ...(out.get(crop) ?? {}) };
      for (const k of ["planted", "harvested", "yield", "harvest"] as const) {
        if (typeof e?.[k] === "number") cur[k] = e[k];
      }
      out.set(crop, cur);
    }
  }
  return out;
}

const SECTION_TITLES: Record<Section, string> = { kilimo: "Kilimo", mifugo: "Mifugo", uvuvi: "Uvuvi" };

export function buildPerformance(input: PerformanceInput): { report: Report; missing: MissingPreset[] } {
  const { period, asOf, records } = input;
  const months = periodMonths(period);
  const done = monthsToDate(period, asOf);
  const lastMonth = done[done.length - 1] ?? months[0]!;
  const fyDone = monthsToDate({ fy: period.fy, quarter: null }, lastMonth);
  const missing: MissingPreset[] = [];
  const parts: ReportPart[] = [];
  const summary: string[] = [];
  const started = done.length > 0;

  for (const section of input.sections) {
    const plan = input.plans[section] ?? null;
    const blocks: (TableBlock | TextBlock)[] = [];

    if (section === "kilimo") {
      const figures = latestCropFigures(records, period.fy, lastMonth);
      const planned = plan?.crops ?? {};
      const crops = [
        ...CROPS.map((c) => c.value),
        ...ALL_CROPS.map((c) => c.value).filter((c) => !CROPS.some((x) => x.value === c)),
      ].filter((c) => (planned[c]?.area ?? 0) > 0 || figures.has(c));
      const rows: Cell[][] = [];
      let tArea = 0, tTarget = 0, tPlanted = 0, tHarvested = 0, tProd = 0;
      let targetKnown = true, prodKnown = true;
      const behind: string[] = [];
      for (const c of crops) {
        const area = planned[c]?.area ?? 0;
        const tija = input.presets[yieldKey(c)];
        const f = figures.get(c) ?? {};
        const plantedHa = f.planted ?? 0;
        const harvestedHa = f.harvested ?? 0;
        const yieldUsed = typeof f.yield === "number" ? f.yield : tija;
        const needsTija = (area > 0 || harvestedHa > 0) && tija === undefined && typeof f.harvest !== "number";
        if (needsTija && presetDef(yieldKey(c))) {
          missing.push({ key: yieldKey(c), label: presetDef(yieldKey(c))!.label, reason: `Kukokotoa mavuno ya ${CROP_LABEL(c)}` });
        }
        const target = area > 0 && tija !== undefined ? round(area * tija) : null;
        const production = typeof f.harvest === "number" ? f.harvest : harvestedHa > 0 && yieldUsed !== undefined ? round(harvestedHa * yieldUsed) : harvestedHa > 0 ? null : 0;
        if (area > 0 && target === null) targetKnown = false;
        if (production === null) prodKnown = false;
        tArea += area;
        tTarget += target ?? 0;
        tPlanted += plantedHa;
        tHarvested += harvestedHa;
        tProd += production ?? 0;
        const areaPct = pct(plantedHa, area);
        if (typeof areaPct === "number" && areaPct < 50 && started) behind.push(`${CROP_LABEL(c)} (${areaPct}%)`);
        rows.push([CROP_LABEL(c), area || "", tija ?? "", target ?? "", plantedHa, areaPct, harvestedHa, production ?? "", target !== null && production !== null ? pct(production, target) : ""]);
      }
      if (rows.length > 0) {
        rows.push(["Jumla", round(tArea), "", targetKnown ? round(tTarget) : "", round(tPlanted), pct(tPlanted, tArea), round(tHarvested), prodKnown ? round(tProd) : "", targetKnown && prodKnown ? pct(tProd, tTarget) : ""]);
      }
      blocks.push({
        kind: "table",
        id: "k1",
        title: "Mazao: lengo na utekelezaji hadi mwisho wa kipindi",
        columns: [
          { label: "Zao" },
          { label: "Lengo: eneo (ha)" },
          { label: "Tija (tani/ha)" },
          { label: "Lengo: mavuno (tani)" },
          { label: "Eneo lililopandwa (ha)" },
          { label: "% ya lengo la eneo" },
          { label: "Eneo lililovunwa (ha)" },
          { label: "Mavuno (tani)" },
          { label: "% ya lengo la mavuno" },
        ],
        rows,
        totalRows: rows.length > 0 ? [rows.length - 1] : [],
        note: plan
          ? "Eneo na mavuno ni ya msimu hadi mwisho wa kipindi, kutoka majibu ya mwisho wa mwezi. Mavuno = eneo lililovunwa × tija iliyoidhinishwa, isipokuwa afisa alipima mavuno."
          : "Hakuna mpango wa uzalishaji ulioidhinishwa kwa mwaka huu; malengo yako wazi.",
        hasData: rows.length > 0,
      });

      const arable = input.presets[ARABLE_KEY];
      if (tPlanted > 0) {
        if (arable === undefined) {
          missing.push({ key: ARABLE_KEY, label: "Eneo linalofaa kwa kilimo", reason: "Kuonyesha asilimia ya eneo linalofaa lililolimwa", optional: true });
        }
      }

      if (rows.length > 0) {
        const s: string[] = [];
        if (tArea > 0) s.push(`eneo lililopandwa ni ha ${fmt(tPlanted)} kati ya lengo la ha ${fmt(tArea)} (${pct(tPlanted, tArea)}%)`);
        else if (tPlanted > 0) s.push(`eneo lililopandwa ni ha ${fmt(tPlanted)}`);
        if (arable !== undefined && tPlanted > 0) s.push(`sawa na ${pct(tPlanted, arable)}% ya eneo linalofaa kwa kilimo`);
        if (targetKnown && prodKnown && tTarget > 0) s.push(`mavuno ni tani ${fmt(tProd)} kati ya lengo la tani ${fmt(tTarget)} (${pct(tProd, tTarget)}%)`);
        else if (prodKnown && tProd > 0) s.push(`mavuno ni tani ${fmt(tProd)}`);
        let line = s.length ? `Kilimo: ${s.join("; ")}.` : "";
        if (behind.length) line += ` Mazao yaliyo nyuma ya lengo la eneo: ${behind.join(", ")}.`;
        if (line) summary.push(line);
      }
    }

    const metrics = metricsFor(section);
    const targets = plan?.targets ?? {};
    const periodRecs = inMonths(records, done);
    const fyRecs = inMonths(records, fyDone);
    const yearView = period.quarter === null;
    const mRows: Cell[][] = [];
    const notes: string[] = [];
    for (const m of metrics) {
      const target = targets[m.key];
      const inPeriod = m.actual(periodRecs);
      const toDate = m.actual(fyRecs);
      if (target === undefined && toDate === 0) continue;
      const toDateTarget = target !== undefined ? round((target * fyDone.length) / 12, 0) : "";
      mRows.push(
        yearView
          ? [m.label, m.unit, target ?? "", round(toDate), target ? pct(toDate, target) : ""]
          : [m.label, m.unit, target ?? "", toDateTarget, round(inPeriod), round(toDate), target ? pct(toDate, target) : ""],
      );
      if (target) notes.push(`${m.label.toLowerCase()} ${fmt(toDate)} ${m.unit} kati ya ${fmt(target)} (${pct(toDate, target)}%)`);
    }
    blocks.push({
      kind: "table",
      id: `${section}-m`,
      title: section === "kilimo" ? "Shughuli nyingine za kilimo" : `${SECTION_TITLES[section]}: malengo ya mwaka na utekelezaji`,
      columns: yearView
        ? [{ label: "Kipimo" }, { label: "Kipimo cha" }, { label: "Lengo la mwaka" }, { label: "Utekelezaji wa mwaka" }, { label: "% ya lengo" }]
        : [{ label: "Kipimo" }, { label: "Kipimo cha" }, { label: "Lengo la mwaka" }, { label: "Lengo hadi sasa" }, { label: "Robo hii" }, { label: "Hadi sasa mwaka huu" }, { label: "% ya lengo la mwaka" }],
      rows: mRows,
      note: yearView ? undefined : "Lengo hadi sasa = lengo la mwaka × miezi iliyopita ÷ 12.",
      hasData: mRows.length > 0,
    });
    if (notes.length && section !== "kilimo") summary.push(`${SECTION_TITLES[section]}: ${notes.join("; ")}.`);

    parts.push({ id: section, number: String(parts.length + 1), title: SECTION_TITLES[section], blocks });
  }

  parts.unshift({
    id: "muhtasari",
    number: "",
    title: "Muhtasari",
    blocks: [
      {
        kind: "text",
        id: "muhtasari",
        text: summary.length ? summary.join("\n") : "Bado hakuna takwimu za kutosha kwa kipindi hiki.",
        hasData: summary.length > 0,
        source: "records",
      },
    ],
  });

  const lastLabel = done.length ? monthLabel(lastMonth) : "";
  return {
    report: {
      kind: "performance",
      formVersion: "2018-07",
      month: lastMonth,
      header: {
        ministry: "OFISI YA RAIS - TAWALA ZA MIKOA NA SERIKALI ZA MITAA (OR-TAMISEMI)",
        title: "TAARIFA YA UTEKELEZAJI WA MALENGO YA UZALISHAJI",
        // The ARDS quarterly and annual forms have no plan-against-results table.
        edition: "Si sehemu ya fomu za ARDS: kwa ufuatiliaji wa mpango na vikao vya maendeleo vya kata/kijiji",
        areaLabel: input.areaLabel,
        officerName: input.officerName,
        phone: input.phone ?? "",
        monthLabel: periodLabel(period),
        periodName: "Kipindi",
        financialYear: period.fy,
        submitNote: lastLabel && done.length < months.length ? `Takwimu hadi mwisho wa ${lastLabel}.` : "Takwimu za kipindi kizima.",
        instructions: [],
      },
      parts,
    },
    missing: dedupe(missing),
  };
}

function fmt(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function dedupe(xs: MissingPreset[]): MissingPreset[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
}

/** When the year's plan should be set: July, and until approved. */
export function isPlanningMonth(month: string): boolean {
  return parseMonth(month).month === 7;
}
