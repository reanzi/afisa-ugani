/**
 * Fertilizer use, from "fertilizer" records. Each record is one farmer's
 * farm, so the number of records is the number of farmers.
 */
import { FERTILIZER_KG, FERTILIZERS, ORGANIC_FERTILIZERS, labelOf } from "./catalogs.ts";
import type { Cell, TableBlock } from "./report/model.ts";

type Rec = { type: string; payload: Record<string, unknown>; deletedAt?: number };

export type FertilizerRow = {
  fertilizer: string;
  label: string;
  organic: boolean;
  /** Kilograms (bags and tonnes converted). */
  kg: number;
  /** Foliar fertilizer, in litres. */
  litres: number;
  farmers: number;
  areaHa: number;
  subsidisedKg: number;
  subsidisedFarmers: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

export function fertilizerUse(records: readonly Rec[]): FertilizerRow[] {
  const by = new Map<string, FertilizerRow>();
  for (const r of records) {
    if (r.deletedAt || r.type !== "fertilizer") continue;
    const p = r.payload;
    const f = String(p.fertilizer ?? "nyingine");
    const row =
      by.get(f) ??
      ({ fertilizer: f, label: labelOf(FERTILIZERS, f), organic: ORGANIC_FERTILIZERS.includes(f), kg: 0, litres: 0, farmers: 0, areaHa: 0, subsidisedKg: 0, subsidisedFarmers: 0 } satisfies FertilizerRow);
    const unit = String(p.unit ?? "kg");
    const kg = unit === "lita" ? 0 : num(p.quantity) * (FERTILIZER_KG[unit] ?? 1);
    row.kg += kg;
    if (unit === "lita") row.litres += num(p.quantity);
    row.farmers += 1;
    row.areaHa += num(p.areaHa);
    if (p.subsidised === "ndiyo") {
      row.subsidisedKg += kg;
      row.subsidisedFarmers += 1;
    }
    by.set(f, row);
  }
  const order = FERTILIZERS.map((o) => o.value);
  return [...by.values()]
    .map((r) => ({ ...r, kg: round(r.kg), litres: round(r.litres), areaHa: round(r.areaHa), subsidisedKg: round(r.subsidisedKg) }))
    .sort((a, b) => order.indexOf(a.fertilizer) - order.indexOf(b.fertilizer));
}

/** The fertilizer table used in the weekly and the plan-against-results reports (Swahili). */
export function fertilizerTable(id: string, title: string | undefined, rows: readonly FertilizerRow[]): TableBlock {
  const body: Cell[][] = rows.map((r) => [
    r.label,
    r.kg,
    r.litres || "",
    r.farmers,
    r.areaHa,
    r.areaHa > 0 && r.kg > 0 ? round(r.kg / r.areaHa, 1) : "",
    r.subsidisedKg,
    r.subsidisedFarmers,
  ]);
  const sum = (k: keyof FertilizerRow) => round(rows.reduce((a, r) => a + (r[k] as number), 0));
  const out = body.length
    ? [...body, ["Jumla", sum("kg"), sum("litres") || "", sum("farmers"), sum("areaHa"), "", sum("subsidisedKg"), sum("subsidisedFarmers")] as Cell[]]
    : [["Hakuna", 0, "", 0, 0, "", 0, 0] as Cell[]];
  return {
    kind: "table",
    id,
    title,
    columns: [
      { label: "Aina ya mbolea", width: 1.5 },
      { label: "Kiasi (kg)" },
      { label: "Kiasi (lita)" },
      { label: "Idadi ya wakulima" },
      { label: "Eneo (ha)" },
      { label: "Kg kwa hekta" },
      { label: "Ya ruzuku (kg)" },
      { label: "Wakulima wa ruzuku" },
    ],
    rows: out,
    totalRows: body.length ? [out.length - 1] : undefined,
    note: "Kila kumbukumbu ni mkulima mmoja. Mifuko na tani zimebadilishwa kuwa kg; mbolea ya majani iko kwa lita.",
    hasData: body.length > 0,
  };
}
