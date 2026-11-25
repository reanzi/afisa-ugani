/**
 * The monthly VAEO/WAEO report (ARDS form, July 2018 edition), built from the
 * officer's records for the month and their month-end review.
 *
 * Layout (titles, columns, fixed rows, notes) follows the printed form; each
 * table's values come from one small aggregation below. Fixed-row tables print
 * 0 where nothing was recorded, as the form instructs ("andika 0").
 */
import { inSwahili } from "../lang.ts";
import {
  CROPS,
  FISH_SYSTEMS,
  LIVESTOCK_PRODUCTS,
  LIVESTOCK_SERVICES,
  RAIN_LEVELS,
  SERVICE_ANIMALS,
  SEVERITY,
  SLAUGHTER_ANIMALS,
  ALL_CROPS,
  ANIMALS,
  commodityKey,
  labelOf,
} from "../catalogs.ts";
import { summarize } from "../actions.ts";
import { daysInMonth, financialYear, monthLabel, monthRange, parseMonth } from "../period.ts";
import type { Section } from "../domain.ts";
import type { Cell, Column, Report, ReportPart, TableBlock, TextBlock } from "./model.ts";

export * from "./model.ts";

export type ReportRecord = {
  type: string;
  section: Section;
  areaId?: string;
  occurredAt: number;
  payload: Record<string, unknown>;
  deletedAt?: number;
};

export type CropEstimate = {
  planted?: number | null;
  harvested?: number | null;
  yield?: number | null;
  harvest?: number | null;
  remarks?: string | null;
};
export type CropTarget = { area?: number | null; yield?: number | null };
export type CropForecast = { area?: number | null; harvest?: number | null };

/** The officer's month-end answers (record type "monthly_review"). */
export type MonthlyReview = {
  month: string;
  rainLevel?: string;
  events?: string;
  work?: string;
  achievements?: string;
  challenges?: string;
  crops?: Record<string, CropEstimate>;
  targets?: Record<string, CropTarget>;
  forecast?: Record<string, CropForecast>;
};

export type MonthlyInput = {
  month: string;
  records: readonly ReportRecord[];
  review?: MonthlyReview | null;
  areaLabel: string;
  officerName: string;
  phone?: string | null;
  /** Village/ward name by area id, for visitor and outbreak details. */
  areaName?: (id: string) => string | undefined;
  /** Approved crop yields (tani/ha) by crop: fill yields and compute harvests the officer left empty. */
  yields?: Record<string, number>;
  /** Approved kilimo plan for the month's financial year: the July targets (2.1a). */
  plan?: { crops?: Record<string, { area: number }> } | null;
};

// ---------- helpers ----------

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const has = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const key = (v: unknown) => str(v).toLowerCase().replace(/\s+/g, " ");
const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))];
const DAY = 86_400_000;
/** Day number in the device's local time. */
const localDay = (ms: number) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / DAY);

function ofType(records: readonly ReportRecord[], type: string) {
  return records.filter((r) => r.type === type);
}

/** Group by a composite key, keeping first-seen order. */
function groupBy<T>(xs: readonly T[], k: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const kk = k(x);
    m.set(kk, [...(m.get(kk) ?? []), x]);
  }
  return m;
}

/** Average weighted by quantity; null when no prices. */
function weightedPrice(rows: { price: number; weight: number }[]): number | null {
  const priced = rows.filter((r) => r.price > 0);
  if (priced.length === 0) return null;
  const w = priced.reduce((a, r) => a + (r.weight > 0 ? r.weight : 1), 0);
  return round(priced.reduce((a, r) => a + r.price * (r.weight > 0 ? r.weight : 1), 0) / w, 0);
}

function sumRow(rows: Cell[][], numericCols: number[], label: string, labelCol = 0): Cell[] {
  const width = rows[0]?.length ?? 0;
  const total: Cell[] = Array.from({ length: width }, () => "");
  total[labelCol] = label;
  for (const c of numericCols) total[c] = round(rows.reduce((a, r) => a + num(r[c]), 0));
  return total;
}

function table(t: Omit<TableBlock, "kind">): TableBlock {
  return { kind: "table", ...t };
}

function cols(...labels: (string | [string, string?, number?])[]): Column[] {
  return labels.map((l) => {
    if (typeof l === "string") return { label: l };
    const [label, marker, width] = l;
    return { label, marker, width };
  });
}

// ---------- the form ----------

function buildMonthlyReportSw(input: MonthlyInput): Report {
  const { month } = input;
  const { start, end } = monthRange(month);
  const records = input.records.filter((r) => !r.deletedAt && r.occurredAt >= start && r.occurredAt < end && r.type !== "monthly_review");
  const review = input.review ?? null;
  const areaName = (id?: string) => (id ? (input.areaName?.(id) ?? "") : "");

  return {
    kind: "monthly",
    formVersion: "2018-07",
    month,
    header: {
      ministry: "OFISI YA RAIS - TAWALA ZA MIKOA NA SERIKALI ZA MITAA (OR-TAMISEMI)",
      title: "FOMU YA TAARIFA YA MWEZI YA MPANGO WA MAENDELEO YA KILIMO WA KIJIJI/KATA",
      edition: "Toleo la Julai 2018",
      areaLabel: input.areaLabel,
      officerName: input.officerName,
      phone: input.phone ?? "",
      monthLabel: monthLabel(month),
      financialYear: financialYear(month),
      submitNote:
        "Iwasilishwe kwenye kata kabla ya mwisho wa mwezi kutoka kwenye kijiji, na wilayani mwisho wa wiki ya kwanza ya mwezi unaofuata kutoka kwenye kata.",
      instructions: [
        "Iwapo kitu kinachoulizwa hakipo kwenye kijiji/kata yako, andika “0” (sifuri).",
        "Iwapo kitu kinachoulizwa kipo kwenye kijiji/kata yako, andika makadirio kwa takwimu/idadi.",
        "Tumia vipimo vya kitaifa kwa kila jedwali vinapohitajika.",
      ],
    },
    parts: [
      partIntroduction(month, records, review),
      partCrops(month, records, review, input.yields ?? {}, input.plan ?? null),
      partPlantHealth(records),
      partSlaughter(records),
      partMeatInspection(records),
      partLivestockProducts(month, records),
      partLivestockHealth(records),
      partFish(records),
      partVisitors(records, areaName),
    ],
  };
}

// 1. Utangulizi
function partIntroduction(month: string, records: ReportRecord[], review: MonthlyReview | null): ReportPart {
  const rain = ofType(records, "rainfall");
  const rainDays = new Set(rain.map((r) => localDay(r.occurredAt))).size;
  const mmRecords = rain.filter((r) => has(r.payload.mm));
  const mm = mmRecords.length ? round(mmRecords.reduce((a, r) => a + num(r.payload.mm), 0), 1) : null;
  const level = review?.rainLevel ?? suggestRainLevel(rainDays, daysInMonth(month));

  const events = ofType(records, "event");
  const eventsText = str(review?.events) || events.map((r) => `${dateLabel(r.occurredAt)}: ${summarize(r.type, r.payload)}`).join("\n");

  const workText = str(review?.work) || describeWork(records);

  const weather = table({
    id: "1.1a",
    title: "1.1 (a) Hali ya hewa: mvua",
    columns: cols(["Kiasi cha mvua (milimita)", "(i)"], ["Maelezo (Nyingi/ Wastani/ Kidogo/ Hakuna)", "(ii)"], ["Idadi ya siku", "(iii)"]),
    rows: [[mm ?? "", labelOf(RAIN_LEVELS, level), rainDays]],
    note: "Kama kijiji kina kipima mvua, jaza milimita; kama hakina, jaza idadi ya siku.",
    hasData: rain.length > 0 || Boolean(review?.rainLevel),
  });

  const text = (id: string, title: string, value: string, fromReview: boolean): TextBlock => ({
    kind: "text",
    id,
    title,
    text: value,
    hasData: value.length > 0,
    source: value.length === 0 ? "empty" : fromReview ? "review" : "records",
  });

  return {
    id: "1",
    number: "1",
    title: "Utangulizi",
    blocks: [
      weather,
      text("1.1b", "1.1 (b) Matukio muhimu (ukame, mafuriko, njaa, migogoro, magonjwa ya mimea na mifugo)", eventsText, Boolean(str(review?.events))),
      text("1.2", "1.2 Kazi zilizofanyika na afisa ugani", workText, Boolean(str(review?.work))),
      text("1.3a", "1.3 Mafanikio", str(review?.achievements), true),
      text("1.3b", "1.3 Changamoto / Matatizo", str(review?.challenges), true),
    ],
  };
}

export function suggestRainLevel(rainDays: number, monthDays: number): string {
  if (rainDays === 0) return "hakuna";
  const share = rainDays / monthDays;
  if (share >= 0.4) return "nyingi";
  if (share >= 0.15) return "wastani";
  return "kidogo";
}

function dateLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** 1.2 drafted from the month's records: counts per kind of work, then free-text activities. */
/** Drafts the "work done" text for the report, always in Swahili. */
export const describeWork = (records: readonly ReportRecord[]): string => inSwahili(() => describeWorkSw(records));

function describeWorkSw(records: readonly ReportRecord[]): string {
  const lines: string[] = [];
  const count = (type: string) => ofType(records, type).length;
  const total = (type: string, f: string) => ofType(records, type).reduce((a, r) => a + num(r.payload[f]), 0);

  const trainings = ofType(records, "training");
  if (trainings.length) {
    const people = trainings.reduce((a, r) => a + num(r.payload.men) + num(r.payload.women), 0);
    const women = trainings.reduce((a, r) => a + num(r.payload.women), 0);
    lines.push(`Mafunzo ${trainings.length} kwa wakulima/wafugaji ${people}${people ? ` (wanawake ${women})` : ""}.`);
  }
  if (count("pest_outbreak")) {
    const ha = round(total("pest_outbreak", "areaAffectedHa"), 1);
    lines.push(`Ufuatiliaji na udhibiti wa visumbufu vya mimea mara ${count("pest_outbreak")}, eneo la ha ${ha}.`);
  }
  if (count("livestock_treatment")) lines.push(`Tiba ya mifugo ${total("livestock_treatment", "treated")} katika ziara ${count("livestock_treatment")}.`);
  if (count("vaccination")) lines.push(`Chanjo, uogeshaji na unyunyiziaji wa mifugo ${total("vaccination", "count")}.`);
  if (count("livestock_service")) lines.push(`Huduma nyingine za mifugo ${total("livestock_service", "count")}.`);
  if (count("slaughter")) lines.push(`Ukaguzi wa nyama: mifugo ${total("slaughter", "count")} iliyochinjwa.`);
  if (count("fish_farming")) lines.push(`Ufuatiliaji wa ufugaji wa samaki mara ${count("fish_farming")}.`);
  if (count("price")) lines.push(`Ukusanyaji wa bei za mazao na bidhaa mara ${count("price")}.`);
  for (const r of ofType(records, "activity")) lines.push(`${dateLabel(r.occurredAt)}: ${str(r.payload.text)}`);
  return lines.join("\n");
}

// 2. Malengo, utekelezaji na bei za mazao
function partCrops(
  month: string,
  records: ReportRecord[],
  review: MonthlyReview | null,
  yields: Record<string, number>,
  plan: { crops?: Record<string, { area: number }> } | null,
): ReportPart {
  const isJuly = parseMonth(month).month === 7;
  // July targets: the officer's own answers first, else the approved plan with approved yields.
  const targets: Record<string, CropTarget> = { ...(review?.targets ?? {}) };
  for (const [crop, p] of Object.entries(plan?.crops ?? {})) {
    const t = targets[crop] ?? {};
    targets[crop] = { area: has(t.area) ? t.area : p.area, yield: has(t.yield) ? t.yield : (yields[crop] ?? null) };
  }
  for (const [crop, t] of Object.entries(targets)) {
    if (!has(t.yield) && has(yields[crop])) targets[crop] = { ...t, yield: yields[crop] };
  }
  const estimates = review?.crops ?? {};
  const forecast = review?.forecast ?? {};

  const prices = ofType(records, "price").filter((r) => r.payload.unit === "kg");
  const marketPrice = (crop: string) => {
    const key = commodityKey(crop);
    const rows = prices.filter((r) => commodityKey(r.payload.commodity) === key);
    const market = rows.filter((r) => r.payload.priceType !== "shambani");
    return weightedPrice((market.length ? market : rows).map((r) => ({ price: num(r.payload.price), weight: 1 })));
  };

  const targetRows: Cell[][] = CROPS.map((c) => {
    const t = targets[c.value] ?? {};
    const area = num(t.area);
    const yld = num(t.yield);
    return [c.label, isJuly ? area : "", isJuly ? yld : "", isJuly ? round(area * yld) : ""];
  });

  const implRows: Cell[][] = CROPS.map((c) => {
    const e = estimates[c.value] ?? {};
    const harvested = num(e.harvested);
    // The officer's measured yield wins; otherwise the approved yield for the crop.
    const yld = has(e.yield) ? num(e.yield) : num(yields[c.value]);
    const harvest = has(e.harvest) ? num(e.harvest) : round(harvested * yld);
    return [c.label, num(e.planted), harvested, yld, harvest, marketPrice(c.value) ?? 0, str(e.remarks)];
  });

  const forecastRows: Cell[][] = CROPS.map((c) => {
    const f = forecast[c.value] ?? {};
    const harvest = has(f.harvest) ? num(f.harvest) : round(num(f.area) * num(yields[c.value]));
    return [c.label, num(f.area), harvest];
  });

  return {
    id: "2",
    number: "2",
    title: "Malengo, Utekelezaji na Bei za Mazao",
    blocks: [
      table({
        id: "2.1a",
        title: "2.1 (a) Malengo kwa mwaka",
        columns: cols("Aina ya mazao", ["Eneo litakalopandwa (ha)", "(i)"], ["Uzalishaji / tija (tani/ha)", "(ii)"], ["Matarajio ya mavuno (tani) = (i) x (ii)", "(iii)"]),
        rows: targetRows,
        note: "Malengo ya mwaka huandikwa mwezi wa Julai tu; miezi mingine huachwa wazi.",
        hasData: isJuly && Object.keys(targets).length > 0,
      }),
      table({
        id: "2.1b",
        title: "2.1 (b) Utekelezaji katika msimu",
        columns: cols(
          "Aina ya mazao",
          ["Eneo lililopandwa (ha)", "(v)"],
          ["Eneo lililovunwa (ha)", "(vi)"],
          ["Uzalishaji / tija (tani/ha)", "(vii)"],
          ["Mavuno (tani)", "(viii)"],
          ["Bei ya soko (Tsh/kg)", "(ix)"],
          ["Maelezo (zisizidi herufi 50)", "(x)"],
        ),
        rows: implRows,
        hasData: Object.keys(estimates).length > 0 || prices.length > 0,
      }),
      table({
        id: "2.2",
        title: "2.2 Utabiri wa usalama wa chakula",
        columns: cols("Aina ya mazao", ["Matarajio eneo lililopandwa (ha)", "(ii)"], ["Matarajio ya mavuno (tani)", "(iii)"]),
        rows: forecastRows,
        hasData: Object.keys(forecast).length > 0,
      }),
    ],
  };
}

// 3. Afya ya mimea
function partPlantHealth(records: ReportRecord[]): ReportPart {
  const pests = ofType(records, "pest_outbreak");
  const build = (rows: ReportRecord[], id: string, title: string, agentLabel: string): TableBlock => {
    const groups = groupBy(rows, (r) => `${key(r.payload.pest)}|${r.payload.crop}`);
    const body: Cell[][] = [...groups.values()].map((g) => {
      const first = g[0]!;
      const sev = SEVERITY.map((s) => s.value).find((v) => g.some((r) => r.payload.severity === v)) ?? "";
      const units = unique(g.map((r) => str(r.payload.unit)));
      const villagesAffected = unique(g.map((r) => r.areaId ?? "")).length;
      const served = g.filter((r) => num(r.payload.households) > 0 || str(r.payload.pesticide));
      return [
        str(first.payload.pest),
        labelOf(ALL_CROPS, first.payload.crop),
        labelOf(SEVERITY, sev),
        round(g.reduce((a, r) => a + num(r.payload.areaAffectedHa), 0)),
        villagesAffected,
        unique(g.map((r) => str(r.payload.pesticide))).join(", "),
        units.length <= 1 ? round(g.reduce((a, r) => a + num(r.payload.quantity), 0)) : "",
        units.length === 1 ? labelOf([{ value: "kg", label: "kg" }, { value: "lita", label: "lt" }], units[0]) : units.join("/"),
        unique(served.map((r) => r.areaId ?? "")).length,
        g.reduce((a, r) => a + num(r.payload.households), 0),
        round(g.reduce((a, r) => a + num(r.payload.areaSavedHa), 0)),
        "",
      ];
    });
    const rowsOut = body.length ? [...body, sumRow(body, [3, 4, 8, 9, 10], "Jumla")] : [["Hakuna", "", "", 0, 0, "", "", "", 0, 0, 0, ""]];
    return table({
      id,
      title,
      columns: cols(
        ["Jina la ugonjwa / kisumbufu", "(i)", 2],
        ["Zao lililoathirika", "(ii)"],
        ["Kiasi cha uharibifu (kubwa, wastani, kidogo)", "(iii)"],
        ["Eneo lililoathiriwa (ha)", "(iv)"],
        ["Idadi ya vijiji vilivyoathirika", "(v)"],
        [agentLabel, "(vi)", 1.5],
        ["Kiasi kilichotumika", "(vii)"],
        ["Kipimo (kg, lt)", "(viii)"],
        ["Idadi ya vijiji vilivyohudumiwa", "(ix)"],
        ["Idadi ya kaya zilizohudumiwa", "(x)"],
        ["Eneo lililookolewa (ha)", "(xi)"],
        ["Maelezo", "(xii)"],
      ),
      rows: rowsOut,
      totalRows: body.length ? [rowsOut.length - 1] : undefined,
      hasData: body.length > 0,
    });
  };
  return {
    id: "3",
    number: "3",
    title: "Afya ya mimea",
    blocks: [
      build(pests.filter((r) => r.payload.method !== "kibaiolojia"), "3.1", "3.1 Kuzuia / kutibu / kudhibiti magonjwa na visumbufu kwa kutumia kemikali", "Dawa iliyotumika"),
      build(pests.filter((r) => r.payload.method === "kibaiolojia"), "3.2", "3.2 Kuzuia magonjwa / visumbufu kwa njia za kibaiolojia / njia za asili", "Njia / kiuatilifu asili kilichotumika"),
    ],
  };
}

// 4. Mifugo iliyochinjwa
function partSlaughter(records: ReportRecord[]): ReportPart {
  const s = ofType(records, "slaughter");
  const rows: Cell[][] = SLAUGHTER_ANIMALS.map((a) => {
    const g = s.filter((r) => r.payload.animal === a.value);
    return [a.label, g.reduce((acc, r) => acc + num(r.payload.count), 0), weightedPrice(g.map((r) => ({ price: num(r.payload.pricePerKg), weight: num(r.payload.count) }))) ?? 0];
  });
  return {
    id: "4",
    number: "4",
    title: "Mifugo iliyochinjwa",
    blocks: [
      table({
        id: "4",
        columns: cols("Aina ya mifugo", "Idadi ya waliochinjwa kwa mwezi huu", "Bei ya wastani kwa kg (Tsh)"),
        rows,
        hasData: s.length > 0,
      }),
    ],
  };
}

// 5. Ukaguzi wa nyama
function partMeatInspection(records: ReportRecord[]): ReportPart {
  const s = ofType(records, "slaughter");
  const affected = groupBy(
    s.filter((r) => num(r.payload.affected) > 0),
    (r) => `${key(r.payload.slaughterhouse)}|${r.payload.animal}`,
  );
  const aRows: Cell[][] = [...affected.values()].map((g) => [
    str(g[0]!.payload.slaughterhouse) || "—",
    labelOf(SLAUGHTER_ANIMALS, g[0]!.payload.animal),
    g.reduce((a, r) => a + num(r.payload.affected), 0),
  ]);
  const condemned = groupBy(
    s.filter((r) => str(r.payload.condemnedPart) || str(r.payload.condemnReason)),
    (r) => `${r.payload.animal}|${key(r.payload.condemnedPart)}|${key(r.payload.condemnReason)}`,
  );
  const bRows: Cell[][] = [...condemned.values()].map((g) => [
    labelOf(SLAUGHTER_ANIMALS, g[0]!.payload.animal),
    str(g[0]!.payload.condemnedPart),
    str(g[0]!.payload.condemnReason),
    g.reduce((a, r) => a + (num(r.payload.condemnCases) || 1), 0),
  ]);
  return {
    id: "5",
    number: "5",
    title: "Ukaguzi wa nyama",
    blocks: [
      table({
        id: "5a",
        title: "5 (a) Wanyama walioathirika",
        columns: cols(["Jina la machinjio / ukaguzi", "(i)"], ["Aina ya mfugo", "(ii)"], ["Idadi ya wanyama walioathirika", "(iii)"]),
        rows: aRows.length ? aRows : [["Hakuna", "", 0]],
        hasData: aRows.length > 0,
      }),
      table({
        id: "5b",
        title: "5 (b) Sehemu ya mnyama iliyoathirika",
        columns: cols(["Aina ya mfugo", "(i)"], ["Kilichotupwa (mzoga mzima / moyo / mapafu / maini n.k.)", "(ii)"], ["Sababu ya kutupa", "(iii)"], ["Idadi ya matukio", "(iv)"]),
        rows: bRows.length ? bRows : [["Hakuna", "", "", 0]],
        hasData: bRows.length > 0,
      }),
    ],
  };
}

// 6. Mazao yatokanayo na mifugo
function partLivestockProducts(month: string, records: ReportRecord[]): ReportPart {
  const p = ofType(records, "livestock_products");
  const of = (product: string) => p.filter((r) => r.payload.product === product);
  const qty = (rows: ReportRecord[]) => round(rows.reduce((a, r) => a + num(r.payload.quantity), 0));
  const days = daysInMonth(month);

  const dairy = LIVESTOCK_PRODUCTS.filter((x) => x.kind === "milk" || x.kind === "dairy");
  const milkRows: Cell[][] = dairy.map((x) => {
    const g = of(x.value);
    const total = qty(g);
    return [`${x.label} (${x.unit})`, total, x.kind === "milk" ? round(total / days, 1) : "", weightedPrice(g.map((r) => ({ price: num(r.payload.price), weight: num(r.payload.quantity) }))) ?? 0];
  });

  const hides = LIVESTOCK_PRODUCTS.filter((x) => x.kind === "hide");
  const hideCount = (product: string, proc: string) => qty(of(product).filter((r) => r.payload.processing === proc));
  const hideRows: Cell[][] = hides.map((x) => [x.label, hideCount(x.value, "jua"), hideCount(x.value, "chumvi"), hideCount(x.value, "wet_blue"), ""]);
  const hidePrice = (product: string, proc: string) =>
    weightedPrice(of(product).filter((r) => r.payload.processing === proc).map((r) => ({ price: num(r.payload.price), weight: num(r.payload.quantity) }))) ?? 0;
  const hidePriceRows: Cell[][] = hides.map((x) => [
    `${x.label} (${x.value === "ngozi_ngombe" ? "Tsh/kg" : "Tsh/kipande"})`,
    hidePrice(x.value, "jua"),
    hidePrice(x.value, "chumvi"),
    hidePrice(x.value, "wet_blue"),
  ]);

  const eggsLocal = qty(of("mayai_kienyeji"));
  const eggsImproved = qty(of("mayai_kisasa"));

  const anyOf = (kinds: string[]) => p.some((r) => kinds.includes(LIVESTOCK_PRODUCTS.find((x) => x.value === r.payload.product)?.kind ?? ""));

  return {
    id: "6",
    number: "6",
    title: "Mazao yatokanayo na mifugo",
    blocks: [
      table({
        id: "6.1",
        title: "6.1 Maziwa",
        columns: cols(["Aina ya mazao", undefined, 2], "Kiasi kwa mwezi huu", "Wastani wa maziwa kwa siku", "Bei ya wastani (Tsh)"),
        rows: milkRows,
        note: "Hesabu maziwa yaliyozalishwa kwa ajili ya kuuza tu. Matumizi ya nyumbani hayahusiani na takwimu hizi.",
        hasData: anyOf(["milk", "dairy"]),
      }),
      table({
        id: "6.2a",
        title: "6.2 (a) Ngozi",
        columns: cols("Aina ya mazao", "Zilizokaushwa kwa jua", "Zilizokaushwa kwa chumvi", "Wet Blue", "Maelezo"),
        groups: [{ label: "", span: 1 }, { label: "Zisizosindikwa (vipande) kwa mwezi huu", span: 2 }, { label: "Zilizosindikwa (vipande)", span: 1 }, { label: "", span: 1 }],
        rows: hideRows,
        hasData: anyOf(["hide"]),
      }),
      table({
        id: "6.2b",
        title: "6.2 (b) Bei ya ngozi",
        columns: cols(["Aina ya mazao", undefined, 2], "Zilizokaushwa kwa jua", "Zilizokaushwa kwa chumvi", "Wet Blue"),
        groups: [{ label: "", span: 1 }, { label: "Bei ya wastani ya machinjioni", span: 2 }, { label: "Bei ya wastani kiwandani", span: 1 }],
        rows: hidePriceRows,
        note: "Ngozi za ng’ombe Tsh/kg; ngozi za mbuzi na kondoo Tsh/kipande.",
        hasData: of("ngozi_ngombe").concat(of("ngozi_mbuzi"), of("ngozi_kondoo")).some((r) => num(r.payload.price) > 0),
      }),
      table({
        id: "6.3",
        title: "6.3 Mayai",
        columns: cols("Mayai", "Kiasi cha mayai yaliyokusanywa kwa mwezi huu"),
        rows: [["Mayai ya kuku wa kienyeji", eggsLocal], ["Mayai ya kuku wa kisasa", eggsImproved], ["Jumla", eggsLocal + eggsImproved]],
        totalRows: [2],
        note: "Andika mayai yaliyozalishwa kibiashara tu.",
        hasData: anyOf(["eggs"]),
      }),
    ],
  };
}

// 7. Afya ya mifugo
function partLivestockHealth(records: ReportRecord[]): ReportPart {
  const treat = ofType(records, "livestock_treatment");
  const tGroups = groupBy(treat, (r) => `${r.payload.animal}|${key(r.payload.disease)}`);
  const tRows: Cell[][] = [...tGroups.values()].map((g) => [
    labelOf(ANIMALS, g[0]!.payload.animal),
    str(g[0]!.payload.disease),
    g.reduce((a, r) => a + num(r.payload.affected), 0),
    g.reduce((a, r) => a + num(r.payload.treated), 0),
    g.reduce((a, r) => a + num(r.payload.recovered), 0),
    g.reduce((a, r) => a + num(r.payload.died), 0),
    unique(g.map((r) => str(r.payload.drug))).join(", "),
  ]);
  const tOut = tRows.length ? [...tRows, sumRow(tRows, [2, 3, 4, 5], "Jumla")] : [["Hakuna", "", 0, 0, 0, 0, ""]];

  const vac = ofType(records, "vaccination");
  const vGroups = groupBy(vac, (r) => String(r.payload.animal));
  const vRows: Cell[][] = [...vGroups.values()].map((g) => {
    const by = (m: string) => g.filter((r) => r.payload.method === m);
    return [
      labelOf(ANIMALS, g[0]!.payload.animal),
      by("kuogesha").reduce((a, r) => a + num(r.payload.count), 0),
      by("kunyunyizia").reduce((a, r) => a + num(r.payload.count), 0),
      by("chanjo").reduce((a, r) => a + num(r.payload.count), 0),
      unique(by("chanjo").map((r) => str(r.payload.product))).join(", "),
      unique([...by("kuogesha"), ...by("kunyunyizia")].map((r) => str(r.payload.product))).join(", "),
    ];
  });

  const svc = ofType(records, "livestock_service");
  const sRows: Cell[][] = SERVICE_ANIMALS.map((a) => [
    a.label,
    ...LIVESTOCK_SERVICES.map((s) => svc.filter((r) => r.payload.animal === a.value && r.payload.service === s.value).reduce((acc, r) => acc + num(r.payload.count), 0)),
  ]);

  return {
    id: "7",
    number: "7",
    title: "Afya ya mifugo",
    blocks: [
      table({
        id: "7.1",
        title: "7.1 Tiba",
        columns: cols("Aina ya mifugo", ["Aina ya ugonjwa / hali", undefined, 2], "Idadi ya walioathirika", "Idadi ya waliotibiwa", "Idadi ya waliopona", "Idadi ya waliokufa", ["Matibabu / dawa iliyotumika", undefined, 2]),
        rows: tOut,
        totalRows: tRows.length ? [tOut.length - 1] : undefined,
        note: "Distokia, bloat, utokaji mimba, kuumwa nyoka na milk fever huandikwa pia kama aina ya hali.",
        hasData: tRows.length > 0,
      }),
      table({
        id: "7.2",
        title: "7.2 Uogeshaji, kunyunyizia, chanjo na kinga",
        columns: cols("Aina ya mifugo", "Idadi ya walioogeshwa", "Idadi ya walionyunyiziwa", "Idadi ya waliochanjwa", ["Chanjo / kinga iliyotumika", undefined, 1.5], ["Dawa iliyotumika", undefined, 1.5]),
        rows: vRows.length ? vRows : [["Hakuna", 0, 0, 0, "", ""]],
        hasData: vRows.length > 0,
      }),
      table({
        id: "7.3",
        title: "7.3 Huduma za mifugo",
        columns: [{ label: "Aina ya mifugo" }, ...LIVESTOCK_SERVICES.map((s) => ({ label: s.label }))],
        rows: sRows,
        note: "Utekelezaji wa mwezi huu.",
        hasData: svc.length > 0,
      }),
    ],
  };
}

// 8. Ufugaji wa samaki
function partFish(records: ReportRecord[]): ReportPart {
  const f = ofType(records, "fish_farming");
  const rows: Cell[][] = FISH_SYSTEMS.map((sys) => {
    const g = f.filter((r) => r.payload.system === sys.value);
    const kg = round(g.reduce((a, r) => a + num(r.payload.harvestKg), 0));
    const value = round(g.reduce((a, r) => a + num(r.payload.harvestKg) * num(r.payload.pricePerKg), 0), 0);
    const maxOf = (k: string) => g.reduce((a, r) => Math.max(a, num(r.payload[k])), 0);
    return [
      sys.label,
      maxOf("units"),
      maxOf("stockedUnits"),
      maxOf("areaM2"),
      unique(g.map((r) => str(r.payload.species))).join(", "),
      kg,
      weightedPrice(g.map((r) => ({ price: num(r.payload.pricePerKg), weight: num(r.payload.harvestKg) }))) ?? 0,
      value,
    ];
  });
  return {
    id: "8",
    number: "8",
    title: "Ufugaji wa samaki",
    blocks: [
      table({
        id: "8.1",
        title: "8.1 Mfumo wa ufugaji",
        columns: cols(["Mfumo wa ufugaji", "(i)"], ["Idadi", "(ii)"], ["Idadi yenye vifaranga", "(iii)"], ["Eneo (m²)", "(iv)"], ["Aina ya samaki pandwa", "(v)"], ["Uzito (kg)", "(vi)"], ["Bei (Tsh/kg)", "(vii)"], ["Thamani (Tsh)", "(viii)"]),
        groups: [{ label: "", span: 5 }, { label: "Samaki vuliwa", span: 3 }],
        rows,
        note: "Safu (ii) ni idadi ya mabwawa yote yaliyopo. Safu (iii), (v)–(viii) zinahusu yaliyopandikizwa vifaranga tu.",
        hasData: f.length > 0,
      }),
    ],
  };
}

// 9. Wageni
function partVisitors(records: ReportRecord[], areaName: (id?: string) => string): ReportPart {
  const v = ofType(records, "visitor").sort((a, b) => a.occurredAt - b.occurredAt);
  const rows: Cell[][] = v.map((r) => [
    new Date(r.occurredAt).toLocaleDateString("en-GB"),
    str(r.payload.name),
    str(r.payload.address),
    `${str(r.payload.purpose)}${r.areaId && areaName(r.areaId) ? ` (${areaName(r.areaId)})` : ""}`,
  ]);
  return {
    id: "9",
    number: "9",
    title: "Wageni waliotembelea kijiji/kata kwa shughuli za kilimo au ufugaji",
    blocks: [
      table({
        id: "9",
        columns: cols("Tarehe", "Jina la mgeni", "Anuani", ["Shughuli iliyomleta", undefined, 2]),
        rows: rows.length ? rows : [["", "Hakuna", "", ""]],
        hasData: rows.length > 0,
      }),
    ],
  };
}

/** Record types whose capture form exists, for progress hints. */
export function reportCoverage(report: Report): { id: string; title: string; filled: boolean }[] {
  return report.parts.map((p) => ({ id: p.id, title: `${p.number}. ${p.title}`, filled: p.blocks.some((b) => b.hasData) }));
}


/** Official text is Swahili whatever the screen language: built inside inSwahili. */
export const buildMonthlyReport: typeof buildMonthlyReportSw = ((...args: Parameters<typeof buildMonthlyReportSw>) => inSwahili(() => buildMonthlyReportSw(...args))) as typeof buildMonthlyReportSw;
