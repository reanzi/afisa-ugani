/**
 * What an officer can record, and how each capture form looks.
 *
 * Each record type is a short form (≈5 visible fields, the rest under
 * "Zaidi"). The same spec drives the Field form, the server-side validation
 * of pushed payloads, and the one-line summary used in lists and PEPMIS text.
 */
import type { Section } from "./domain.ts";
import { L } from "./lang.ts";
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
  FERTILIZERS,
  FERTILIZER_UNITS,
  NPK_GRADES,
  PESTICIDE_CLASSES,
  YES_NO,
  RAIN_LEVELS,
  type Option,
} from "./catalogs.ts";
import { isWeekKey } from "./period.ts";
import { validateAdditions } from "./report/additions.ts";
import { validateQuarterlyReview } from "./report/quarterly.ts";
import { validateAnnualReview } from "./report/annual.ts";

export const RECORD_TYPES = [
  "activity",
  "event",
  "rainfall",
  "pest_outbreak",
  "fertilizer",
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
  "weekly_review",
  "quarterly_review",
  "annual_review",
] as const;

/** Review records hold the officer's period-end answers, not field work. */
export const REVIEW_TYPES: readonly string[] = ["monthly_review", "weekly_review", "quarterly_review", "annual_review"];
export const isReviewType = (type: string) => REVIEW_TYPES.includes(type);
export type RecordType = (typeof RECORD_TYPES)[number];

/** "place": a registered slaughterhouse id, or "nje" for a place that is not registered (its own screen control). */
export type FieldKind = "count" | "decimal" | "money" | "text" | "longtext" | "select" | "choice" | "place";

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
    get label() { return L("Tiba", "Treatment"); },
    get hint() { return L("Mifugo iliyotibiwa", "Animals treated"); },
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "animal", get label() { return L("Mfugo", "Animal"); }, kind: "select", options: ANIMALS, required: true },
      { key: "disease", get label() { return L("Ugonjwa au hali", "Disease or condition"); }, kind: "text", suggestions: SUGGEST_LIVESTOCK_DISEASES, required: true },
      { key: "affected", get label() { return L("Walioathirika", "Affected"); }, kind: "count", required: true },
      { key: "treated", get label() { return L("Waliotibiwa", "Treated"); }, kind: "count", required: true },
      { key: "recovered", get label() { return L("Waliopona", "Recovered"); }, kind: "count" },
      { key: "died", get label() { return L("Waliokufa", "Died"); }, kind: "count" },
      { key: "drug", get label() { return L("Dawa iliyotumika", "Drug used"); }, kind: "text", more: true },
    ],
    summary: (p) =>
      `${L("Tiba", "Treatment")}: ${labelOf(ANIMALS, p.animal)} ${fmt(n(p.treated))} (${s(p.disease)})${n(p.recovered) ? `, ${L("waliopona", "recovered")} ${fmt(n(p.recovered))}` : ""}${n(p.died) ? `, ${L("waliokufa", "died")} ${fmt(n(p.died))}` : ""}`,
  },
  {
    type: "vaccination",
    get label() { return L("Chanjo / Uogeshaji", "Vaccination / Dipping"); },
    get hint() { return L("Kinga, kuogesha, kunyunyizia", "Vaccines, dipping, spraying"); },
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "animal", get label() { return L("Mfugo", "Animal"); }, kind: "select", options: ANIMALS, required: true },
      {
        key: "method",
        get label() { return L("Huduma", "Service"); },
        kind: "choice",
        required: true,
        options: [
          { value: "chanjo", get label() { return L("Chanjo", "Vaccination"); } },
          { value: "kuogesha", get label() { return L("Kuogesha", "Dipping"); } },
          { value: "kunyunyizia", get label() { return L("Kunyunyizia", "Spraying"); } },
        ],
      },
      { key: "count", get label() { return L("Idadi ya mifugo", "Number of animals"); }, kind: "count", required: true },
      { key: "product", get label() { return L("Chanjo au dawa iliyotumika", "Vaccine or drug used"); }, kind: "text" },
    ],
    summary: (p) => `${labelOf([{ value: "chanjo", get label() { return L("Chanjo", "Vaccination"); } }, { value: "kuogesha", get label() { return L("Kuogesha", "Dipping"); } }, { value: "kunyunyizia", get label() { return L("Kunyunyizia", "Spraying"); } }], p.method)}: ${labelOf(ANIMALS, p.animal)} ${fmt(n(p.count))}${s(p.product) ? ` (${s(p.product)})` : ""}`,
  },
  {
    type: "livestock_service",
    get label() { return L("Huduma za mifugo", "Livestock services"); },
    get hint() { return L("Kuhasi, AI, kwato na nyingine", "Castration, AI, hooves and more"); },
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "animal", get label() { return L("Mfugo", "Animal"); }, kind: "select", options: SERVICE_ANIMALS, required: true },
      { key: "service", get label() { return L("Huduma", "Service"); }, kind: "select", options: LIVESTOCK_SERVICES, required: true },
      { key: "count", get label() { return L("Idadi ya mifugo", "Number of animals"); }, kind: "count", required: true },
    ],
    summary: (p) => `${labelOf(LIVESTOCK_SERVICES, p.service)}: ${labelOf(SERVICE_ANIMALS, p.animal)} ${fmt(n(p.count))}`,
  },
  {
    type: "slaughter",
    get label() { return L("Machinjioni", "Slaughterhouse"); },
    get hint() { return L("Uchinjaji na ukaguzi wa nyama", "Slaughter and meat inspection"); },
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "animal", get label() { return L("Mfugo", "Animal"); }, kind: "select", options: SLAUGHTER_ANIMALS, required: true },
      { key: "count", get label() { return L("Idadi waliochinjwa", "Number slaughtered"); }, kind: "count", required: true },
      { key: "pricePerKg", get label() { return L("Bei ya wastani kwa kg", "Average price per kg"); }, kind: "money", unit: "Tsh/kg" },
      { key: "slaughterhouseId", get label() { return L("Machinjio", "Slaughterhouse"); }, kind: "place", required: true },
      {
        key: "slaughterhouse",
        get label() { return L("Jina la mahali pa kuchinjia", "Name of the slaughter place"); },
        get hint() { return L("Mahali hapa hapajasajiliwa. Jina, kijiji na mahali (GPS) vitatumwa makao makuu ili pasajiliwe.", "This place is not registered. Its name, village and GPS location go to HQ so it can be registered."); },
        kind: "text",
        required: true,
        showIf: (p) => p.slaughterhouseId === "nje",
      },
      { key: "affected", get label() { return L("Wanyama walioathirika (ukaguzi)", "Animals affected (inspection)"); }, kind: "count", more: true },
      { key: "condemnedPart", get label() { return L("Kilichotupwa", "Condemned part"); }, kind: "text", more: true, suggestions: ["Mzoga mzima", "Moyo", "Mapafu", "Maini", "Figo", "Utumbo"] },
      { key: "condemnReason", get label() { return L("Sababu ya kutupa", "Reason condemned"); }, kind: "text", more: true, suggestions: ["Minyoo ya ini (Fasciola)", "Uvimbe", "Kifua kikuu (TB)", "Cysticercosis", "Hydatid cyst", "Majipu"] },
      { key: "condemnCases", get label() { return L("Idadi ya matukio", "Number of cases"); }, kind: "count", more: true },
    ],
    summary: (p) => `${L("Machinjioni", "Slaughter")}${s(p.slaughterhouse) ? ` (${s(p.slaughterhouse)})` : ""}: ${labelOf(SLAUGHTER_ANIMALS, p.animal)} ${fmt(n(p.count))}${n(p.affected) ? `, ${L("walioathirika", "affected")} ${fmt(n(p.affected))}` : ""}`,
  },
  {
    type: "livestock_products",
    get label() { return L("Maziwa, Mayai, Ngozi", "Milk, Eggs, Hides"); },
    get hint() { return L("Mazao ya mifugo ya kuuza", "Livestock products for sale"); },
    sections: ["mifugo"],
    ready: true,
    quick: true,
    fields: [
      { key: "product", get label() { return L("Zao", "Product"); }, kind: "select", options: LIVESTOCK_PRODUCTS, required: true },
      { key: "quantity", get label() { return L("Kiasi", "Quantity"); }, kind: "decimal", unit: productUnit, required: true, get hint() { return L("Kinachozalishwa kwa ajili ya kuuza tu", "Only what is produced for sale"); } },
      {
        key: "processing",
        get label() { return L("Usindikaji", "Processing"); },
        kind: "choice",
        options: HIDE_PROCESSING,
        showIf: (p) => String(p.product ?? "").startsWith("ngozi_"),
        required: true,
      },
      { key: "price", get label() { return L("Bei", "Price"); }, kind: "money", unit: (p) => `Tsh/${LIVESTOCK_PRODUCTS.find((x) => x.value === p.product)?.each || L("kipimo", "unit")}` },
      { key: "priceAt", get label() { return L("Bei ya", "Price at"); }, kind: "choice", options: HIDE_PRICE_AT, showIf: (p) => String(p.product ?? "").startsWith("ngozi_") },
    ],
    summary: (p) => `${labelOf(LIVESTOCK_PRODUCTS, p.product)}: ${fmt(n(p.quantity))} ${productUnit(p)}`,
  },
  {
    type: "pest_outbreak",
    get label() { return L("Wadudu / Ugonjwa", "Pests / Disease"); },
    get hint() { return L("Mlipuko na udhibiti shambani", "Outbreaks and control in the field"); },
    sections: ["kilimo"],
    ready: true,
    quick: true,
    fields: [
      { key: "pest", get label() { return L("Mdudu au ugonjwa", "Pest or disease"); }, kind: "text", suggestions: SUGGEST_PESTS, required: true },
      { key: "crop", get label() { return L("Zao lililoathirika", "Crop affected"); }, kind: "select", options: ALL_CROPS, required: true },
      { key: "severity", get label() { return L("Kiasi cha uharibifu", "Extent of damage"); }, kind: "choice", options: SEVERITY, required: true },
      { key: "areaAffectedHa", get label() { return L("Eneo lililoathirika", "Area affected"); }, kind: "decimal", unit: "ha", required: true },
      { key: "households", get label() { return L("Kaya zilizohudumiwa", "Households served"); }, kind: "count" },
      { key: "method", get label() { return L("Njia ya kudhibiti", "Control method"); }, kind: "choice", options: CONTROL_METHODS, more: true },
      { key: "pesticide", get label() { return L("Dawa iliyotumika", "Drug used"); }, kind: "text", more: true },
      { key: "pesticideClass", get label() { return L("Kundi la kiuatilifu", "Pesticide class"); }, kind: "choice", options: PESTICIDE_CLASSES, more: true, showIf: (p) => p.method === "kemikali" },
      { key: "quantity", get label() { return L("Kiasi kilichotumika", "Amount used"); }, kind: "decimal", more: true },
      { key: "unit", get label() { return L("Kipimo", "Unit"); }, kind: "choice", options: AMOUNT_UNITS, more: true },
      { key: "areaSavedHa", get label() { return L("Eneo lililookolewa", "Area saved"); }, kind: "decimal", unit: "ha", more: true },
    ],
    summary: (p) => `${s(p.pest)} ${L("kwenye", "on")} ${labelOf(ALL_CROPS, p.crop).toLowerCase()}: ha ${fmt(n(p.areaAffectedHa))} (${labelOf(SEVERITY, p.severity).toLowerCase()})${n(p.households) ? L(`, kaya ${fmt(n(p.households))} zimehudumiwa`, `, ${fmt(n(p.households))} households served`) : ""}`,
  },
  {
    type: "fertilizer",
    get label() { return L("Mbolea", "Fertilizer"); },
    get hint() { return L("Mbolea aliyotumia mkulima mmoja shambani kwake", "Fertilizer one farmer used on their farm"); },
    sections: ["kilimo"],
    ready: true,
    quick: true,
    fields: [
      { key: "fertilizer", get label() { return L("Aina ya mbolea", "Fertilizer type"); }, kind: "select", options: FERTILIZERS, required: true },
      { key: "npkGrade", get label() { return L("Daraja la NPK", "NPK grade"); }, kind: "choice", options: NPK_GRADES, showIf: (p) => p.fertilizer === "npk" },
      { key: "quantity", get label() { return L("Kiasi kilichotumika", "Amount used"); }, kind: "decimal", required: true },
      { key: "unit", get label() { return L("Kipimo", "Unit"); }, kind: "choice", options: FERTILIZER_UNITS, required: true },
      { key: "crop", get label() { return L("Zao", "Crop"); }, kind: "select", options: ALL_CROPS, required: true },
      { key: "areaHa", get label() { return L("Eneo la shamba", "Farm area"); }, kind: "decimal", unit: "ha", required: true },
      { key: "subsidised", get label() { return L("Mbolea ya ruzuku?", "Subsidised fertilizer?"); }, kind: "choice", options: YES_NO, required: true },
    ],
    summary: (p) =>
      `${labelOf(FERTILIZERS, p.fertilizer)} ${fmt(n(p.quantity))} ${labelOf(FERTILIZER_UNITS, p.unit).toLowerCase()} ${L("kwenye", "on")} ${labelOf(ALL_CROPS, p.crop).toLowerCase()}, ha ${fmt(n(p.areaHa))}${p.subsidised === "ndiyo" ? L(" (ruzuku)", " (subsidised)") : ""}`,
  },
  {
    type: "rainfall",
    get label() { return L("Mvua", "Rain"); },
    get hint() { return L("Siku iliyonyesha", "A day it rained"); },
    sections: ["kilimo"],
    ready: true,
    quick: true,
    fields: [
      { key: "mm", get label() { return L("Kiasi cha mvua", "Rainfall"); }, kind: "decimal", unit: "mm", get hint() { return L("Jaza kama kuna kipima mvua. Kama hakuna, hifadhi tu: siku itahesabiwa.", "Fill in if there is a rain gauge. If not, just save: the day is counted."); } },
    ],
    summary: (p) => (n(p.mm) ? L(`Mvua imenyesha, mm ${fmt(n(p.mm))}`, `It rained, ${fmt(n(p.mm))} mm`) : L("Mvua imenyesha", "It rained")),
  },
  {
    type: "fish_farming",
    get label() { return L("Ufugaji wa samaki", "Fish farming"); },
    get hint() { return L("Mavuno ya mabwawa na vizimba", "Harvests from ponds and cages"); },
    sections: ["uvuvi"],
    ready: true,
    quick: true,
    fields: [
      { key: "system", get label() { return L("Mfumo wa ufugaji", "Farming system"); }, kind: "choice", options: FISH_SYSTEMS, required: true },
      { key: "species", get label() { return L("Aina ya samaki", "Fish species"); }, kind: "text", suggestions: SUGGEST_FISH, required: true },
      { key: "harvestKg", get label() { return L("Samaki waliovuliwa", "Fish harvested"); }, kind: "decimal", unit: "kg", required: true },
      { key: "pricePerKg", get label() { return L("Bei", "Price"); }, kind: "money", unit: "Tsh/kg" },
      { key: "units", get label() { return L("Idadi ya mabwawa/vizimba", "Number of ponds/cages"); }, kind: "count", more: true },
      { key: "stockedUnits", get label() { return L("Yenye vifaranga", "Stocked with fingerlings"); }, kind: "count", more: true },
      { key: "areaM2", get label() { return L("Eneo", "Area"); }, kind: "decimal", unit: "m²", more: true },
    ],
    summary: (p) => `${labelOf(FISH_SYSTEMS, p.system)}: ${s(p.species)} kg ${fmt(n(p.harvestKg))}`,
  },
  {
    type: "training",
    get label() { return L("Mafunzo", "Training"); },
    get hint() { return L("Shamba darasa na mikutano", "Field schools and meetings"); },
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "topic", get label() { return L("Mada", "Topic"); }, kind: "text", required: true },
      { key: "method", get label() { return L("Njia", "Method"); }, kind: "choice", options: TRAINING_METHODS, required: true },
      { key: "men", get label() { return L("Wanaume", "Men"); }, kind: "count" },
      { key: "women", get label() { return L("Wanawake", "Women"); }, kind: "count" },
      { key: "group", get label() { return L("Kikundi", "Group"); }, kind: "text", more: true },
      { key: "days", get label() { return L("Muda wa mafunzo", "Training length"); }, kind: "count", unit: L("siku", "days"), more: true },
      { key: "trainer", get label() { return L("Mtoa mafunzo / mwezeshaji", "Trainer / facilitator"); }, kind: "text", more: true },
    ],
    summary: (p) => `${L("Mafunzo", "Training")} (${labelOf(TRAINING_METHODS, p.method).toLowerCase()}): ${s(p.topic)}, ${L("washiriki", "participants")} ${fmt(n(p.men) + n(p.women))}`,
  },
  {
    type: "price",
    get label() { return L("Bei", "Price"); },
    get hint() { return L("Vyakula, mazao na bidhaa", "Food, crops and goods"); },
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "commodity", get label() { return L("Bidhaa", "Item"); }, kind: "text", suggestions: PRICE_SUGGESTIONS, required: true, get hint() { return L("Andika jina, mfano Sukari au Mafuta ya kupikia.", "Write the name, e.g. Sugar or Cooking oil."); } },
      { key: "unit", get label() { return L("Kipimo", "Unit"); }, kind: "choice", options: PRICE_UNITS, required: true },
      { key: "price", get label() { return L("Bei", "Price"); }, kind: "money", unit: (p) => `Tsh/${labelOf(PRICE_UNITS, p.unit) || L("kipimo", "unit")}`, required: true },
      { key: "priceType", get label() { return L("Mahali bei ilipochukuliwa", "Where the price was taken"); }, kind: "choice", options: PRICE_TYPES, required: true },
      { key: "availability", get label() { return L("Upatikanaji", "Availability"); }, kind: "choice", options: AVAILABILITY },
      { key: "market", get label() { return L("Jina la soko au duka", "Market or shop name"); }, kind: "text", more: true },
    ],
    summary: (p) =>
      `${L("Bei ya", "Price of")} ${commodityLabel(p.commodity)}: Tsh ${fmt(n(p.price))}/${labelOf(PRICE_UNITS, p.unit)} (${labelOf(PRICE_TYPES, p.priceType).toLowerCase()})${p.availability ? `, ${labelOf(AVAILABILITY, p.availability).toLowerCase()}` : ""}`,
  },
  {
    type: "event",
    get label() { return L("Tukio", "Event"); },
    get hint() { return L("Ukame, mafuriko, migogoro", "Drought, floods, conflicts"); },
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "kind", get label() { return L("Aina ya tukio", "Type of event"); }, kind: "choice", options: EVENT_KINDS, required: true },
      { key: "text", get label() { return L("Eleza kilichotokea", "Describe what happened"); }, kind: "longtext", required: true },
    ],
    summary: (p) => `${labelOf(EVENT_KINDS, p.kind)}: ${s(p.text)}`,
  },
  {
    type: "visitor",
    get label() { return L("Mgeni", "Visitor"); },
    get hint() { return L("Aliyetembelea kwa shughuli za kilimo", "Came for farming or livestock work"); },
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "name", get label() { return L("Jina la mgeni", "Visitor's name"); }, kind: "text", required: true },
      { key: "address", get label() { return L("Anuani au taasisi", "Address or institution"); }, kind: "text", required: true },
      { key: "purpose", get label() { return L("Shughuli iliyomleta", "Purpose of visit"); }, kind: "text", required: true },
    ],
    summary: (p) => `${L("Mgeni", "Visitor")}: ${s(p.name)} (${s(p.address)}), ${s(p.purpose)}`,
  },
  {
    type: "photo",
    get label() { return L("Picha", "Photo"); },
    get hint() { return L("Uchunguzi wenye picha", "Observations with photos"); },
    sections: ALL,
    ready: true,
    quick: true,
    fields: [
      { key: "category", get label() { return L("Picha inaonyesha nini?", "What does the photo show?"); }, kind: "select", options: PHOTO_CATEGORIES, required: true },
      { key: "subject", get label() { return L("Zao au mnyama", "Crop or animal"); }, kind: "text", suggestions: PHOTO_SUBJECTS, required: true, get hint() { return L("Mfano Mahindi, Nyanya, Ng’ombe.", "For example Maize, Tomatoes, Cattle."); } },
      { key: "observation", get label() { return L("Umeona nini?", "What did you see?"); }, kind: "longtext", required: true },
      { key: "suspected", get label() { return L("Unadhani ni nini?", "What do you think it is?"); }, kind: "text", get hint() { return L("Jina la mdudu au ugonjwa. Andika \"sijui\" kama hujui.", "Name of the pest or disease. Write \"don't know\" if unsure."); } },
      { key: "severity", get label() { return L("Ukubwa wa tatizo", "Size of the problem"); }, kind: "choice", options: SEVERITY },
      { key: "stage", get label() { return L("Hatua ya ukuaji", "Growth stage"); }, kind: "select", options: GROWTH_STAGES, more: true, showIf: (p) => CROP_CATEGORIES.includes(String(p.category)) },
    ],
    summary: (p) => {
      const cat = PHOTO_CATEGORIES.find((c) => c.value === p.category)?.label ?? L("Picha", "Photo");
      const sus = s(p.suspected);
      return `${cat}: ${s(p.subject)}${sus ? ` (${sus})` : ""}. ${s(p.observation)}`;
    },
  },
  {
    type: "activity",
    get label() { return L("Shughuli nyingine", "Other work"); },
    get hint() { return L("Kazi yoyote ya leo", "Any of today's work"); },
    sections: ALL,
    ready: true,
    quick: true,
    fields: [{ key: "text", get label() { return L("Umefanya nini?", "What did you do?"); }, kind: "longtext", required: true }],
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
  if (type === "weekly_review") return validateWeeklyReview(p);
  if (type === "quarterly_review") return validateQuarterlyReview(p);
  if (type === "annual_review") return validateAnnualReview(p);
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
      case "place":
        if (typeof v !== "string" || v.length > 64) return `BAD_OPTION:${f.key}`;
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

function validateWeeklyReview(p: Record<string, unknown>): string | null {
  if (typeof p.week !== "string" || !isWeekKey(p.week)) return "BAD_WEEK";
  if (p.section !== "kilimo" && p.section !== "mifugo") return "BAD_SECTION";
  if (p.rainLevel !== undefined && (typeof p.rainLevel !== "string" || !RAIN_LEVELS.some((o) => o.value === p.rainLevel))) return "BAD_OPTION:rainLevel";
  for (const key of ["events", "achievements", "challenges", "work"]) {
    const v = p[key];
    if (v !== undefined && (typeof v !== "string" || v.length > 5000)) return `BAD_TEXT:${key}`;
  }
  return null;
}

function validateReview(p: Record<string, unknown>): string | null {
  if (typeof p.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month)) return "BAD_MONTH";
  const additions = validateAdditions(p.additions);
  if (additions) return additions;
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
