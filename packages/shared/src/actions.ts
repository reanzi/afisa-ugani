/**
 * What an officer can record, and how each capture form looks.
 *
 * Each record type is a short form (≈5 visible fields, the rest under
 * "Zaidi"). The same spec drives the Field form, the server-side validation
 * of pushed payloads, and the one-line summary used in lists and PEPMIS text.
 */
import type { Section } from "./domain.ts";
import { CROP_CATEGORIES, GROWTH_STAGES, PHOTO_CATEGORIES, PHOTO_SUBJECTS } from "./media.ts";
import {
  ALL_CROPS,
  AMOUNT_UNITS,
  ANIMALS,
  CONTROL_METHODS,
  EVENT_KINDS,
  FISH_SYSTEMS,
  HIDE_PRICE_AT,
  HIDE_PROCESSING,
  LIVESTOCK_PRODUCTS,
  LIVESTOCK_SERVICES,
  AVAILABILITY,
  PRICE_TYPES,
  PRICE_UNITS,
  SUGGEST_FOODS,
  commodityLabel,
  SERVICE_ANIMALS,
  SEVERITY,
  SLAUGHTER_ANIMALS,
  SUGGEST_FISH,
  SUGGEST_LIVESTOCK_DISEASES,
  SUGGEST_PESTS,
  TRAINING_METHODS,
  labelOf,
  type Option,
} from "./catalogs.ts";

export const RECORD_TYPES = [
  "activity",
  "event",
  "rainfall",
  "pest_outbreak",
  "training",
  "price",
  "visitor",
  "livestock_treatment",
  "vaccination",
  "livestock_service",
  "slaughter",
  "livestock_products",
  "fish_farming",
  "photo",
  "monthly_review",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export type FieldKind = "count" | "decimal" | "money" | "text" | "longtext" | "select" | "choice";

export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Shown under "Zaidi" (more) instead of up front. */
  more?: boolean;
  options?: readonly Option[];
  /** Typing suggestions for text fields. */
  suggestions?: readonly string[];
  unit?: string | ((payload: Record<string, unknown>) => string);
  hint?: string;
  showIf?: (payload: Record<string, unknown>) => boolean;
};

export type RecordSpec = {
  type: RecordType;
  label: string;
  hint: string;
  sections: readonly Section[];
  /** Capture form available in the Field app. */
  ready: boolean;
  /** Shown as a home tile. */
  quick: boolean;
  fields: readonly FieldSpec[];
  summary: (p: Record<string, unknown>) => string;
};

const ALL: readonly Section[] = ["kilimo", "mifugo", "uvuvi"];
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const productUnit = (p: Record<string, unknown>) => LIVESTOCK_PRODUCTS.find((x) => x.value === p.product)?.unit ?? "";

/** Foods first, then crops and livestock products, without repeats. */
const PRICE_SUGGESTIONS: readonly string[] = [...new Set([...SUGGEST_FOODS, ...ALL_CROPS.filter((c) => c.value !== "nyingine").map((c) => c.label)])];

export const RECORD_SPECS: readonly RecordSpec[] = [
  {
    type: "livestock_treatment",
    label: "Tiba",
    hint: "Mifugo iliyotibiwa",
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "animal", label: "Mfugo", kind: "select", options: ANIMALS, required: true },
      { key: "disease", label: "Ugonjwa au hali", kind: "text", suggestions: SUGGEST_LIVESTOCK_DISEASES, required: true },
      { key: "affected", label: "Walioathirika", kind: "count", required: true },
      { key: "treated", label: "Waliotibiwa", kind: "count", required: true },
      { key: "recovered", label: "Waliopona", kind: "count" },
      { key: "died", label: "Waliokufa", kind: "count" },
      { key: "drug", label: "Dawa iliyotumika", kind: "text", more: true },
    ],
    summary: (p) =>
      `Tiba: ${labelOf(ANIMALS, p.animal)} ${fmt(n(p.treated))} (${s(p.disease)})${n(p.recovered) ? `, waliopona ${fmt(n(p.recovered))}` : ""}${n(p.died) ? `, waliokufa ${fmt(n(p.died))}` : ""}`,
  },
  {
    type: "vaccination",
    label: "Chanjo / Uogeshaji",
    hint: "Kinga, kuogesha, kunyunyizia",
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "animal", label: "Mfugo", kind: "select", options: ANIMALS, required: true },
      {
        key: "method",
        label: "Huduma",
        kind: "choice",
        required: true,
        options: [
          { value: "chanjo", label: "Chanjo" },
          { value: "kuogesha", label: "Kuogesha" },
          { value: "kunyunyizia", label: "Kunyunyizia" },
        ],
      },
      { key: "count", label: "Idadi ya mifugo", kind: "count", required: true },
      { key: "product", label: "Chanjo au dawa iliyotumika", kind: "text" },
    ],
    summary: (p) => `${labelOf([{ value: "chanjo", label: "Chanjo" }, { value: "kuogesha", label: "Kuogesha" }, { value: "kunyunyizia", label: "Kunyunyizia" }], p.method)}: ${labelOf(ANIMALS, p.animal)} ${fmt(n(p.count))}${s(p.product) ? ` (${s(p.product)})` : ""}`,
  },
  {
    type: "livestock_service",
    label: "Huduma za mifugo",
    hint: "Kuhasi, AI, kwato na nyingine",
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "animal", label: "Mfugo", kind: "select", options: SERVICE_ANIMALS, required: true },
      { key: "service", label: "Huduma", kind: "select", options: LIVESTOCK_SERVICES, required: true },
      { key: "count", label: "Idadi ya mifugo", kind: "count", required: true },
    ],
    summary: (p) => `${labelOf(LIVESTOCK_SERVICES, p.service)}: ${labelOf(SERVICE_ANIMALS, p.animal)} ${fmt(n(p.count))}`,
  },
  {
    type: "slaughter",
    label: "Machinjioni",
    hint: "Uchinjaji na ukaguzi wa nyama",
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "animal", label: "Mfugo", kind: "select", options: SLAUGHTER_ANIMALS, required: true },
      { key: "count", label: "Idadi waliochinjwa", kind: "count", required: true },
      { key: "pricePerKg", label: "Bei ya wastani kwa kg", kind: "money", unit: "Tsh/kg" },
      { key: "slaughterhouse", label: "Machinjio", kind: "text" },
      { key: "affected", label: "Wanyama walioathirika (ukaguzi)", kind: "count", more: true },
      { key: "condemnedPart", label: "Kilichotupwa", kind: "text", more: true, suggestions: ["Mzoga mzima", "Moyo", "Mapafu", "Maini", "Figo", "Utumbo"] },
      { key: "condemnReason", label: "Sababu ya kutupa", kind: "text", more: true, suggestions: ["Minyoo ya ini (Fasciola)", "Uvimbe", "Kifua kikuu (TB)", "Cysticercosis", "Hydatid cyst", "Majipu"] },
      { key: "condemnCases", label: "Idadi ya matukio", kind: "count", more: true },
    ],
    summary: (p) => `Machinjioni: ${labelOf(SLAUGHTER_ANIMALS, p.animal)} ${fmt(n(p.count))}${n(p.affected) ? `, walioathirika ${fmt(n(p.affected))}` : ""}`,
  },
  {
    type: "livestock_products",
    label: "Maziwa, Mayai, Ngozi",
    hint: "Mazao ya mifugo ya kuuza",
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "product", label: "Zao", kind: "select", options: LIVESTOCK_PRODUCTS, required: true },
      { key: "quantity", label: "Kiasi", kind: "decimal", unit: productUnit, required: true, hint: "Kinachozalishwa kwa ajili ya kuuza tu" },
      {
        key: "processing",
        label: "Usindikaji",
        kind: "choice",
        options: HIDE_PROCESSING,
        showIf: (p) => String(p.product ?? "").startsWith("ngozi_"),
        required: true,
      },
      { key: "price", label: "Bei", kind: "money", unit: (p) => (p.product === "ngozi_ngombe" ? "Tsh/kg" : `Tsh/${productUnit(p).replace(/i$/, "") || "kipimo"}`) },
      { key: "priceAt", label: "Bei ya", kind: "choice", options: HIDE_PRICE_AT, showIf: (p) => String(p.product ?? "").startsWith("ngozi_") },
    ],
    summary: (p) => `${labelOf(LIVESTOCK_PRODUCTS, p.product)}: ${fmt(n(p.quantity))} ${productUnit(p)}`,
  },
  {
    type: "pest_outbreak",
    label: "Wadudu / Ugonjwa",
    hint: "Mlipuko na udhibiti shambani",
    sections: ["kilimo"],
    ready: true,
    quick: true,
    fields: [
      { key: "pest", label: "Mdudu au ugonjwa", kind: "text", suggestions: SUGGEST_PESTS, required: true },
      { key: "crop", label: "Zao lililoathirika", kind: "select", options: ALL_CROPS, required: true },
      { key: "severity", label: "Kiasi cha uharibifu", kind: "choice", options: SEVERITY, required: true },
      { key: "areaAffectedHa", label: "Eneo lililoathirika", kind: "decimal", unit: "ha", required: true },
      { key: "households", label: "Kaya zilizohudumiwa", kind: "count" },
      { key: "method", label: "Njia ya kudhibiti", kind: "choice", options: CONTROL_METHODS, more: true },
      { key: "pesticide", label: "Dawa iliyotumika", kind: "text", more: true },
      { key: "quantity", label: "Kiasi kilichotumika", kind: "decimal", more: true },
      { key: "unit", label: "Kipimo", kind: "choice", options: AMOUNT_UNITS, more: true },
      { key: "areaSavedHa", label: "Eneo lililookolewa", kind: "decimal", unit: "ha", more: true },
    ],
    summary: (p) => `${s(p.pest)} kwenye ${labelOf(ALL_CROPS, p.crop).toLowerCase()}: ha ${fmt(n(p.areaAffectedHa))} (${labelOf(SEVERITY, p.severity).toLowerCase()})${n(p.households) ? `, kaya ${fmt(n(p.households))} zimehudumiwa` : ""}`,
  },
  {
    type: "rainfall",
    label: "Mvua",
    hint: "Siku iliyonyesha",
    sections: ["kilimo"],
    ready: true,
    quick: true,
    fields: [
      { key: "mm", label: "Kiasi cha mvua", kind: "decimal", unit: "mm", hint: "Jaza kama kuna kipima mvua. Kama hakuna, hifadhi tu: siku itahesabiwa." },
    ],
    summary: (p) => (n(p.mm) ? `Mvua imenyesha, mm ${fmt(n(p.mm))}` : "Mvua imenyesha"),
  },
  {
    type: "fish_farming",
    label: "Ufugaji wa samaki",
    hint: "Mavuno ya mabwawa na vizimba",
    sections: ["uvuvi"],
    ready: true,
    quick: true,
    fields: [
      { key: "system", label: "Mfumo wa ufugaji", kind: "choice", options: FISH_SYSTEMS, required: true },
      { key: "species", label: "Aina ya samaki", kind: "text", suggestions: SUGGEST_FISH, required: true },
      { key: "harvestKg", label: "Samaki waliovuliwa", kind: "decimal", unit: "kg", required: true },
      { key: "pricePerKg", label: "Bei", kind: "money", unit: "Tsh/kg" },
      { key: "units", label: "Idadi ya mabwawa/vizimba", kind: "count", more: true },
      { key: "stockedUnits", label: "Yenye vifaranga", kind: "count", more: true },
      { key: "areaM2", label: "Eneo", kind: "decimal", unit: "m²", more: true },
    ],
    summary: (p) => `${labelOf(FISH_SYSTEMS, p.system)}: ${s(p.species)} kg ${fmt(n(p.harvestKg))}`,
  },
  {
    type: "training",
    label: "Mafunzo",
    hint: "Shamba darasa na mikutano",
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "topic", label: "Mada", kind: "text", required: true },
      { key: "method", label: "Njia", kind: "choice", options: TRAINING_METHODS, required: true },
      { key: "men", label: "Wanaume", kind: "count" },
      { key: "women", label: "Wanawake", kind: "count" },
      { key: "group", label: "Kikundi", kind: "text", more: true },
    ],
    summary: (p) => `Mafunzo (${labelOf(TRAINING_METHODS, p.method).toLowerCase()}): ${s(p.topic)}, washiriki ${fmt(n(p.men) + n(p.women))}`,
  },
  {
    type: "price",
    label: "Bei",
    hint: "Vyakula, mazao na bidhaa",
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "commodity", label: "Bidhaa", kind: "text", suggestions: PRICE_SUGGESTIONS, required: true, hint: "Andika jina, mfano Sukari au Mafuta ya kupikia." },
      { key: "unit", label: "Kipimo", kind: "choice", options: PRICE_UNITS, required: true },
      { key: "price", label: "Bei", kind: "money", unit: (p) => `Tsh/${labelOf(PRICE_UNITS, p.unit) || "kipimo"}`, required: true },
      { key: "priceType", label: "Mahali bei ilipochukuliwa", kind: "choice", options: PRICE_TYPES, required: true },
      { key: "availability", label: "Upatikanaji", kind: "choice", options: AVAILABILITY },
      { key: "market", label: "Jina la soko au duka", kind: "text", more: true },
    ],
    summary: (p) =>
      `Bei ya ${commodityLabel(p.commodity)}: Tsh ${fmt(n(p.price))}/${labelOf(PRICE_UNITS, p.unit)} (${labelOf(PRICE_TYPES, p.priceType).toLowerCase()})${p.availability ? `, ${labelOf(AVAILABILITY, p.availability).toLowerCase()}` : ""}`,
  },
  {
    type: "event",
    label: "Tukio",
    hint: "Ukame, mafuriko, migogoro",
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "kind", label: "Aina ya tukio", kind: "choice", options: EVENT_KINDS, required: true },
      { key: "text", label: "Eleza kilichotokea", kind: "longtext", required: true },
    ],
    summary: (p) => `${labelOf(EVENT_KINDS, p.kind)}: ${s(p.text)}`,
  },
  {
    type: "visitor",
    label: "Mgeni",
    hint: "Aliyetembelea kwa shughuli za kilimo",
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "name", label: "Jina la mgeni", kind: "text", required: true },
      { key: "address", label: "Anuani au taasisi", kind: "text", required: true },
      { key: "purpose", label: "Shughuli iliyomleta", kind: "text", required: true },
    ],
    summary: (p) => `Mgeni: ${s(p.name)} (${s(p.address)}), ${s(p.purpose)}`,
  },
  {
    type: "photo",
    label: "Picha",
    hint: "Uchunguzi wenye picha",
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "category", label: "Picha inaonyesha nini?", kind: "select", options: PHOTO_CATEGORIES, required: true },
      { key: "subject", label: "Zao au mnyama", kind: "text", suggestions: PHOTO_SUBJECTS, required: true, hint: "Mfano Mahindi, Nyanya, Ng’ombe." },
      { key: "observation", label: "Umeona nini?", kind: "longtext", required: true },
      { key: "suspected", label: "Unadhani ni nini?", kind: "text", hint: "Jina la mdudu au ugonjwa. Andika \"sijui\" kama hujui." },
      { key: "severity", label: "Ukubwa wa tatizo", kind: "choice", options: SEVERITY },
      { key: "stage", label: "Hatua ya ukuaji", kind: "select", options: GROWTH_STAGES, more: true, showIf: (p) => CROP_CATEGORIES.includes(String(p.category)) },
    ],
    summary: (p) => {
      const cat = PHOTO_CATEGORIES.find((c) => c.value === p.category)?.label ?? "Picha";
      const sus = s(p.suspected);
      return `${cat}: ${s(p.subject)}${sus ? ` (${sus})` : ""}. ${s(p.observation)}`;
    },
  },
  {
    type: "activity",
    label: "Shughuli nyingine",
    hint: "Kazi yoyote ya leo",
    sections: ALL,
    ready: true,
    quick: true,
    fields: [{ key: "text", label: "Umefanya nini?", kind: "longtext", required: true }],
    summary: (p) => s(p.text),
  },
];

export const QUICK_ACTIONS = RECORD_SPECS.filter((r) => r.quick);
export type QuickAction = RecordSpec;

export function specFor(type: string): RecordSpec | undefined {
  return RECORD_SPECS.find((r) => r.type === type);
}
/** @deprecated use specFor */
export const actionByType = specFor;

export function actionsFor(sections: readonly Section[]): RecordSpec[] {
  return QUICK_ACTIONS.filter((a) => a.sections.some((sec) => sections.includes(sec)));
}

export function fieldVisible(f: FieldSpec, payload: Record<string, unknown>): boolean {
  return f.showIf ? f.showIf(payload) : true;
}

export function summarize(type: string, payload: Record<string, unknown>): string {
  return specFor(type)?.summary(payload) ?? type;
}

const MAX_TEXT = 2000;
const MAX_NUMBER = 1e12;

/**
 * Check a payload against its spec. Returns null when valid, or a short
 * reason. Unknown keys are ignored so older servers accept newer optional
 * fields; `monthly_review` is checked by its own validator.
 */
export function validatePayload(type: string, payload: unknown): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return "NOT_OBJECT";
  const p = payload as Record<string, unknown>;
  if (type === "monthly_review") return validateReview(p);
  const spec = specFor(type);
  if (!spec) return "UNKNOWN_TYPE";
  for (const f of spec.fields) {
    if (!fieldVisible(f, p)) continue;
    const v = p[f.key];
    const empty = v === undefined || v === null || v === "";
    if (empty) {
      if (f.required) return `MISSING:${f.key}`;
      continue;
    }
    switch (f.kind) {
      case "count":
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_NUMBER) return `BAD_NUMBER:${f.key}`;
        break;
      case "decimal":
      case "money":
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_NUMBER) return `BAD_NUMBER:${f.key}`;
        break;
      case "select":
      case "choice":
        if (typeof v !== "string" || !f.options?.some((o) => o.value === v)) return `BAD_OPTION:${f.key}`;
        break;
      case "text":
      case "longtext":
        if (typeof v !== "string" || v.length > MAX_TEXT) return `BAD_TEXT:${f.key}`;
        if (f.required && v.trim().length === 0) return `MISSING:${f.key}`;
        break;
    }
  }
  return null;
}

function validateReview(p: Record<string, unknown>): string | null {
  if (typeof p.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month)) return "BAD_MONTH";
  for (const key of ["events", "achievements", "challenges", "work"]) {
    const v = p[key];
    if (v !== undefined && (typeof v !== "string" || v.length > 5000)) return `BAD_TEXT:${key}`;
  }
  for (const key of ["crops", "forecast", "targets"]) {
    const v = p[key];
    if (v === undefined) continue;
    if (v === null || typeof v !== "object" || Array.isArray(v)) return `BAD_TABLE:${key}`;
    for (const row of Object.values(v as Record<string, unknown>)) {
      if (row === null || typeof row !== "object") return `BAD_TABLE:${key}`;
      for (const cell of Object.values(row as Record<string, unknown>)) {
        if (cell !== null && typeof cell !== "number" && typeof cell !== "string") return `BAD_TABLE:${key}`;
        if (typeof cell === "number" && (!Number.isFinite(cell) || cell < 0)) return `BAD_TABLE:${key}`;
        if (typeof cell === "string" && cell.length > 500) return `BAD_TABLE:${key}`;
      }
    }
  }
  return null;
}
