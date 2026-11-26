/**
 * ARDS quarterly form ("Fomu ya Taarifa ya Robo Mwaka", July 2018 edition).
 *
 * From records: 3.1 training outside farmer field schools, 4.1 biological
 * pest control. Typed in at the quarter's end: food situation, farmer groups,
 * irrigated crops, soil erosion and area by tillage method. The officer can
 * add to the record-built tables (report/additions.ts).
 */
import { L, inSwahili } from "../lang.ts";
import { ALL_CROPS, labelOf } from "../catalogs.ts";
import { fyLabel, isQuarterKey, parseQuarter, periodRange, quarterLabel, quarterMonths } from "../period.ts";
import { applyAdditions } from "./additions.ts";
import { inputTableBlock, productOf, sumOf, tableValues, validatePeriodReview, type InputPart, type InputTable, type PeriodReview } from "./forms.ts";
import type { Cell, Report, ReportPart, TableBlock } from "./model.ts";
import type { ReportRecord } from "./monthly.ts";

export type PeriodReportInput = {
  /** "2026-27-Q2" (quarterly) or "2026-27" (annual). */
  period: string;
  records: readonly ReportRecord[];
  review?: PeriodReview | null;
  /** Last year's annual answers, for carry-over tables. */
  previous?: PeriodReview | null;
  areaLabel: string;
  officerName: string;
  phone?: string | null;
  areaName?: (id: string) => string | undefined;
};

export const MINISTRY = "OFISI YA RAIS - TAWALA ZA MIKOA NA SERIKALI ZA MITAA (OR-TAMISEMI)";
export const FORM_INSTRUCTIONS = [
  "Iwapo kitu kinachoulizwa hakipo kwenye kijiji/kata yako, andika “0” (sifuri).",
  "Iwapo kitu kinachoulizwa kipo kwenye kijiji/kata yako, andika makadirio kwa takwimu/idadi.",
  "Tumia vipimo vya kitaifa kwa kila jedwali vinapohitajika.",
  "Soma kwa makini maelezo katika kila jedwali kabla ya kuanza kujaza.",
];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const round = (v: number) => Math.round(v * 100) / 100;
const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))];

// ---------- parts and typed-in tables ----------

export const QUARTERLY_PARTS: readonly InputPart[] = [
  { id: "q1", number: "1", title: "Hali ya chakula kijiji/ kata" },
  { id: "q2", number: "2", title: "Vikundi/Ushirika wa wakulima" },
  { id: "q3", number: "3", title: "Huduma za ugani" },
  { id: "q4", number: "4", title: "Afya ya mimea" },
  { id: "q5", number: "5", title: "Umwagiliaji" },
  { id: "q6", number: "6", title: "Mmomonyoko wa ardhi" },
  { id: "q7", number: "7", title: "Eneo la uzalishaji katika kijiji/ kata na njia iliyotumika kulima" },
];

const TILLAGE_COLS = [
  { key: "trekta", label: "Kwa trekta (ha)", marker: "(i)", kind: "decimal" as const },
  { key: "wanyama", label: "Kwa kutumia wanyamakazi (ha)", marker: "(ii)", kind: "decimal" as const },
  { key: "mkono", label: "Kwa jembe la mkono/ mkono (ha)", marker: "(iii)", kind: "decimal" as const },
  { key: "bilaKulima", label: "Kupanda bila kulima (ha)", marker: "(iv)", kind: "decimal" as const },
  { key: "jumla", label: "Jumla ya eneo (ha)", marker: "(v) = (i)+(ii)+(iii)+(iv)", kind: "decimal" as const, compute: sumOf("trekta", "wanyama", "mkono", "bilaKulima") },
];
const TILLAGE_ROWS = [
  { key: "limwa", label: "Lililolimwa" },
  { key: "pandwa", label: "Lililopandwa" },
  { key: "paliliwa", label: "Lililopaliliwa" },
  { key: "vunwa", label: "Lililovunwa" },
];
const NO_DOUBLE = "Usihesabu mara mbili kama ardhi ileile imelimwa zaidi ya mara moja katika msimu mmoja.";

export const QUARTERLY_TABLES: readonly InputTable[] = [
  {
    id: "q1.1",
    part: "q1",
    rowHeader: "",
    single: true,
    get hint() { return L("Weka alama kwenye hali moja ya chakula kwa robo hii, na maelezo mafupi.", "Tick one food situation for this quarter, with a short note."); },
    rows: [
      { key: "nzuri", label: "Nzuri" },
      { key: "wastani", label: "Wastani" },
      { key: "mbaya", label: "Mbaya" },
    ],
    cols: [
      { key: "alama", label: "Weka alama", kind: "check" },
      { key: "maelezo", label: "Maelezo", kind: "text", width: 3 },
    ],
  },
  {
    id: "q1.2",
    part: "q1",
    title: "Eleza hali ya upatikanaji wa chakula kwa kipindi cha robo mwaka.",
    cols: [
      { key: "hakuna", label: "Idadi ya kaya zisizokuwa na chakula", kind: "count" },
      { key: "pungufu", label: "Idadi ya kaya zenye chakula pungufu", kind: "count" },
      { key: "kutosha", label: "Idadi ya kaya zenye chakula cha kutosha", kind: "count" },
      { key: "ziada", label: "Idadi ya kaya zenye chakula na ziada", kind: "count" },
    ],
    rows: [{ key: "kaya", label: "Kaya" }],
    rowHeader: "",
  },
  {
    id: "q2.1",
    part: "q2",
    title: "Jedwali 2.1 Vyama vya kuweka na kukopa (SACCOs)",
    get hint() { return L("Kila chama kwenye mstari wake.", "One society per row."); },
    extraRows: 30,
    cols: [
      { key: "jina", label: "Jina la chama", kind: "text", width: 2 },
      { key: "wanaume", label: "Wanachama wanaume", kind: "count" },
      { key: "wanawake", label: "Wanachama wanawake", kind: "count" },
      { key: "maelezo", label: "Maelezo", kind: "text", width: 2 },
    ],
  },
  {
    id: "q2.2",
    part: "q2",
    title: "Jedwali 2.2 Vikundi vingine vya wakulima",
    get hint() { return L("Kila kikundi kwenye mstari wake.", "One group per row."); },
    extraRows: 50,
    cols: [
      { key: "jina", label: "Jina la kikundi", kind: "text", width: 2 },
      { key: "shughuli", label: "Shughuli kuu", kind: "text", width: 2 },
      { key: "wanaume", label: "Wanachama wanaume", kind: "count" },
      { key: "wanawake", label: "Wanachama wanawake", kind: "count" },
      { key: "maelezo", label: "Maelezo", kind: "text", width: 2 },
    ],
  },
  {
    id: "q5.1",
    part: "q5",
    title: "5.1 Mazao yanayolimwa katika eneo la umwagiliaji",
    note: "(v)(vii)(ix) Masika/ Vuli, (vi)(viii)(x) Kiangazi: takwimu za eneo lililopandwa (ha), uzalishaji (tani/ha) na mavuno (tani) katika skimu zinazotegemea umwagiliaji.",
    get hint() { return L("Zao moja kwa kila mstari. Mavuno yanahesabiwa yenyewe: eneo × tija.", "One crop per row. Harvest is worked out for you: area × yield."); },
    extraRows: 30,
    groups: [
      { label: "", span: 1 },
      { label: "Eneo lililopandwa (ha) (ii)", span: 2 },
      { label: "Uzalishaji/ Tija (tani/ha) (iii)", span: 2 },
      { label: "Mavuno (tani) (iv) = (ii) x (iii)", span: 2 },
      { label: "", span: 1 },
    ],
    cols: [
      { key: "zao", label: "Aina ya mazao", marker: "(i)", kind: "choice", options: ALL_CROPS, width: 2 },
      { key: "eneoMasika", label: "Masika/ Vuli", marker: "(v)", kind: "decimal" },
      { key: "eneoKiangazi", label: "Kiangazi", marker: "(vi)", kind: "decimal" },
      { key: "tijaMasika", label: "Masika/ Vuli", marker: "(vii)", kind: "decimal" },
      { key: "tijaKiangazi", label: "Kiangazi", marker: "(viii)", kind: "decimal" },
      { key: "mavunoMasika", label: "Masika/ Vuli", marker: "(ix)", kind: "decimal", compute: productOf("eneoMasika", "tijaMasika") },
      { key: "mavunoKiangazi", label: "Kiangazi", marker: "(x)", kind: "decimal", compute: productOf("eneoKiangazi", "tijaKiangazi") },
      { key: "maelezo", label: "Maelezo", kind: "text" },
    ],
  },
  {
    id: "q6",
    part: "q6",
    note: "i) Aina ya mmomonyoko iandikwe kwa lugha ya Kiingereza.",
    get hint() { return L("Aina ya mmomonyoko iandikwe kwa Kiingereza (mfano: gully erosion).", "Write the erosion type in English (e.g. gully erosion)."); },
    extraRows: 20,
    cols: [
      { key: "aina", label: "Aina ya mmomonyoko", marker: "(i)", kind: "text", width: 2 },
      { key: "vijiji", label: "Jina la kijiji/ vijiji vilivyohusika", kind: "text", width: 2 },
      { key: "eneoHaribiwa", label: "Eneo lililoharibiwa (ha)", kind: "decimal" },
      { key: "mbinu", label: "Mbinu zilizotumika", kind: "text", width: 2 },
      { key: "eneoKarabatiwa", label: "Eneo lililokarabatiwa (ha)", kind: "decimal" },
      { key: "maelezo", label: "Maelezo", kind: "text" },
    ],
  },
  { id: "q7.1", part: "q7", title: "7.1 Vuli", note: NO_DOUBLE, rowHeader: "Eneo", rows: TILLAGE_ROWS, cols: TILLAGE_COLS, get hint() { return L("Hekta kwa kila njia ya kulima, msimu wa Vuli.", "Hectares by tillage method, Vuli season."); } },
  { id: "q7.2", part: "q7", title: "7.2 Masika", note: NO_DOUBLE, rowHeader: "Eneo", rows: TILLAGE_ROWS, cols: TILLAGE_COLS, get hint() { return L("Hekta kwa kila njia ya kulima, msimu wa Masika.", "Hectares by tillage method, Masika season."); } },
];

export const validateQuarterlyReview = (p: Record<string, unknown>) => validatePeriodReview(QUARTERLY_TABLES, isQuarterKey, p);

// ---------- record-built tables ----------

const TRAINING_SECTORS = [
  { key: "mazao", label: "Mazao" },
  { key: "ufugaji", label: "Ufugaji" },
  { key: "umwagiliaji", label: "Umwagiliaji" },
  { key: "masoko", label: "Masoko na Usindikaji" },
  { key: "uvuvi", label: "Uvuvi" },
] as const;

/** Training sector: irrigation and marketing topics by keyword, otherwise the record's section. */
export function trainingSector(r: ReportRecord): (typeof TRAINING_SECTORS)[number]["key"] {
  const topic = str(r.payload.topic).toLowerCase();
  if (/umwagiliaji|irrigat/.test(topic)) return "umwagiliaji";
  if (/soko|masoko|usindikaji|kusindika|market|process/.test(topic)) return "masoko";
  return r.section === "mifugo" ? "ufugaji" : r.section === "uvuvi" ? "uvuvi" : "mazao";
}

const methodLabel = (v: unknown) =>
  ({ mkutano: "Mkutano", nyumba_kwa_nyumba: "Nyumba kwa nyumba", onyesho: "Onyesho", ziara: "Ziara ya mafunzo", shamba_darasa: "Shamba darasa" })[str(v)] ?? str(v);

/** 3.1 Training outside farmer field schools, from training records. */
export function trainingOutsideFfs(records: readonly ReportRecord[]): TableBlock {
  const rs = records.filter((r) => r.type === "training" && r.payload.method !== "shamba_darasa");
  let unknownLength = 0;
  const rows: Cell[][] = TRAINING_SECTORS.map((s) => {
    const mine = rs.filter((r) => trainingSector(r) === s.key);
    let short = 0;
    let long = 0;
    for (const r of mine) {
      const people = num(r.payload.men) + num(r.payload.women);
      const days = num(r.payload.days);
      if (days > 7) long += people;
      else {
        short += people;
        if (!days) unknownLength += people;
      }
    }
    return [
      s.label,
      unique(mine.map((r) => str(r.payload.topic))).join("; "),
      mine.reduce((a, r) => a + num(r.payload.men), 0),
      mine.reduce((a, r) => a + num(r.payload.women), 0),
      short,
      long,
      unique(mine.map((r) => methodLabel(r.payload.method))).join(", "),
      unique(mine.map((r) => str(r.payload.trainer))).join(", "),
      "",
    ];
  });
  const notes = ["i) Orodhesha mada zilizofundishwa kwa wakulima."];
  if (unknownLength) notes.push(`Washiriki ${unknownLength} hawakuandikiwa muda wa mafunzo; wamehesabiwa kwenye "sawa au pungufu ya wiki moja".`);
  return {
    kind: "table",
    id: "q3.1",
    title: "3.1 Mafunzo kwa wakulima kwa kutumia njia mbalimbali nje ya shamba darasa",
    columns: [
      { label: "" },
      { label: "Mada ya mafunzo", marker: "(i)", width: 3 },
      { label: "Wanaume", align: "end" },
      { label: "Wanawake", align: "end" },
      { label: "Sawa au pungufu ya wiki moja", align: "end" },
      { label: "Zaidi ya wiki moja", align: "end" },
      { label: "Njia iliyotumika kutoa mafunzo", width: 2 },
      { label: "Mtoa mafunzo/ Mwezeshaji wa mafunzo", width: 2 },
      { label: "Maelezo", width: 2 },
    ],
    groups: [
      { label: "", span: 2 },
      { label: "Idadi ya wakulima waliopata mafunzo", span: 2 },
      { label: "Idadi ya wakulima waliopata mafunzo kwa muda", span: 2 },
      { label: "", span: 3 },
    ],
    rows,
    note: notes.join(" "),
    hasData: rs.length > 0,
  };
}

/** 4.1 Biological / natural control of pests and diseases, from pest records. */
export function biologicalControl(records: readonly ReportRecord[]): TableBlock {
  const rs = records.filter((r) => r.type === "pest_outbreak" && r.payload.method === "kibaiolojia");
  const groups = new Map<string, ReportRecord[]>();
  for (const r of rs) {
    const k = `${str(r.payload.pest).toLowerCase()}|${str(r.payload.crop)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const rows: Cell[][] = [...groups.values()].map((g) => {
    const first = g[0]!;
    return [
      str(first.payload.pest),
      labelOf(ALL_CROPS, first.payload.crop),
      unique(g.map((r) => str(r.payload.pesticide))).join(", "),
      round(g.reduce((a, r) => a + (num(r.payload.areaSavedHa) || num(r.payload.areaAffectedHa)), 0)),
      g.reduce((a, r) => a + num(r.payload.households), 0),
      "",
    ];
  });
  if (rows.length === 0) rows.push(["", "", "", 0, 0, ""]);
  return {
    kind: "table",
    id: "q4.1",
    title: "4.1 Kuzuia magonjwa/visumbufu kwa njia za kibaiolojia/ njia za asili",
    columns: [
      { label: "Aina ya ugonjwa/ kisumbufu", width: 2 },
      { label: "Aina ya zao" },
      { label: "Njia zilizotumika", width: 2 },
      { label: "Eneo lililodhibitiwa (ha)", align: "end" },
      { label: "Kaya zilizohusika", align: "end" },
      { label: "Maelezo", width: 2 },
    ],
    rows,
    note: "Eneo lililodhibitiwa ni eneo lililookolewa lililoandikwa; lisipoandikwa, eneo lililoathirika.",
    hasData: rs.length > 0,
  };
}

// ---------- the form ----------

function part(p: InputPart, blocks: TableBlock[]): ReportPart {
  return { id: p.id, number: p.number, title: p.title, blocks };
}

function buildQuarterlyReportSw(input: PeriodReportInput): Report {
  const { period, review } = input;
  const months = quarterMonths(period);
  const { start, end } = periodRange(months);
  const { fy } = parseQuarter(period);
  const records = input.records.filter((r) => !r.deletedAt && r.occurredAt >= start && r.occurredAt < end && !r.type.endsWith("_review"));
  const typed = (id: string) => {
    const spec = QUARTERLY_TABLES.find((s) => s.id === id)!;
    return inputTableBlock(spec, tableValues(spec, review));
  };
  const P = (id: string) => QUARTERLY_PARTS.find((p) => p.id === id)!;
  const report: Report = {
    kind: "quarterly",
    formVersion: "2018-07",
    month: period,
    header: {
      ministry: MINISTRY,
      title: "FOMU YA TAARIFA YA ROBO MWAKA YA MPANGO WA MAENDELEO YA KILIMO WA KIJIJI/KATA",
      edition: "Toleo la Julai 2018",
      areaLabel: input.areaLabel,
      officerName: input.officerName,
      phone: input.phone ?? "",
      monthLabel: quarterLabel(period, "sw"),
      periodName: "Robo",
      financialYear: fyLabel(fy),
      submitNote:
        "Iwasilishwe kwenye kata kabla ya mwisho wa robo mwaka kutoka kwenye kijiji, na wilayani mwisho wa wiki ya kwanza ya mwezi unaofuata kutoka kwenye kata.",
      instructions: FORM_INSTRUCTIONS,
    },
    parts: [
      part(P("q1"), [typed("q1.1"), typed("q1.2")]),
      part(P("q2"), [typed("q2.1"), typed("q2.2")]),
      part(P("q3"), [trainingOutsideFfs(records)]),
      part(P("q4"), [biologicalControl(records)]),
      part(P("q5"), [typed("q5.1")]),
      part(P("q6"), [typed("q6")]),
      part(P("q7"), [typed("q7.1"), typed("q7.2")]),
    ],
  };
  return applyAdditions(report, review?.additions);
}

/** Official text is Swahili whatever the screen language. */
export const buildQuarterlyReport = (input: PeriodReportInput): Report => inSwahili(() => buildQuarterlyReportSw(input));
