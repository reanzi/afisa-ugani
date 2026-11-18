/**
 * Small, honest helpers that make the app useful day to day: figures for the
 * month so far, gentle reminders, and totals for any period. Pure functions,
 * so the phone works them out offline and HQ can reuse them later.
 */
import type { Section } from "./domain.ts";
import { daysInMonth, monthKey, monthLabel, shiftMonth } from "./period.ts";
import { labelOf, AMOUNT_UNITS } from "./catalogs.ts";
import { specFor } from "./actions.ts";

export type InsightRecord = {
  type: string;
  section: Section;
  occurredAt: number;
  payload: Record<string, unknown>;
  deletedAt?: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });
const live = (rs: readonly InsightRecord[]) => rs.filter((r) => !r.deletedAt && r.type !== "monthly_review");

export type Stat = { id: string; label: string; value: string; section?: Section };

/** Up to five figures for the month so far, limited to the officer's sections. */
export function monthStats(records: readonly InsightRecord[], sections: readonly Section[]): Stat[] {
  const rs = live(records);
  const of = (type: string) => rs.filter((r) => r.type === type);
  const sum = (type: string, key: string, section?: Section) =>
    of(type).filter((r) => !section || r.section === section).reduce((a, r) => a + num(r.payload[key]), 0);
  const out: Stat[] = [{ id: "entries", label: "Kumbukumbu", value: fmt(rs.length) }];

  const trained = of("training").reduce((a, r) => a + num(r.payload.men) + num(r.payload.women), 0);
  if (trained > 0) out.push({ id: "trained", label: "Waliopata mafunzo", value: fmt(trained) });

  if (sections.includes("kilimo")) {
    const ha = sum("pest_outbreak", "areaAffectedHa");
    if (ha > 0) out.push({ id: "pest_ha", label: "Hekta zilizoshambuliwa", value: fmt(ha), section: "kilimo" });
    const saved = sum("pest_outbreak", "areaSavedHa");
    if (saved > 0) out.push({ id: "saved_ha", label: "Hekta zilizookolewa", value: fmt(saved), section: "kilimo" });
  }
  if (sections.includes("mifugo")) {
    const treated = sum("livestock_treatment", "treated");
    if (treated > 0) out.push({ id: "treated", label: "Mifugo iliyotibiwa", value: fmt(treated), section: "mifugo" });
    const vaccinated = sum("vaccination", "count");
    if (vaccinated > 0) out.push({ id: "vaccinated", label: "Chanjo na uogeshaji", value: fmt(vaccinated), section: "mifugo" });
  }
  if (sections.includes("uvuvi")) {
    const kg = sum("fish_farming", "harvestKg");
    if (kg > 0) out.push({ id: "fish", label: "Samaki waliovuliwa (kg)", value: fmt(kg), section: "uvuvi" });
  }
  return out.slice(0, 5);
}

export type Reminder = {
  id: string;
  tone: "wait" | "danger" | "ok";
  text: string;
  action?: { label: string; to: string };
};

export type ReminderInput = {
  now: Date;
  hasReviewThisMonth: boolean;
  prevMonthEntries: number;
  hasReviewPrevMonth: boolean;
  lastEntryAt: number | null;
  pendingCount: number;
  oldestPendingAt: number | null;
  rejectedCount: number;
};

const DAY = 86_400_000;

/** At most two reminders, most useful first. Friendly, specific, with a next step. */
export function reminders(input: ReminderInput): Reminder[] {
  const out: Reminder[] = [];
  const { now } = input;
  const month = monthKey(now);
  const day = now.getDate();
  const left = daysInMonth(month) - day;

  if (input.rejectedCount > 0) {
    out.push({
      id: "rejected",
      tone: "danger",
      text: `Kumbukumbu ${input.rejectedCount} hazikukubaliwa na mfumo. Zifungue uzirekebishe ili ziingie kwenye ripoti.`,
      action: { label: "Zione", to: "/shughuli?hali=zilizokataliwa" },
    });
  }

  const prev = shiftMonth(month, -1);
  if (day <= 7 && input.prevMonthEntries > 0 && !input.hasReviewPrevMonth) {
    out.push({
      id: `prev-review-${prev}`,
      tone: "wait",
      text: `Ripoti ya ${monthLabel(prev)} inatakiwa wilayani wiki hii. Jibu maswali ya mwisho wa mwezi kisha uipakue.`,
      action: { label: "Maliza ripoti", to: `/ripoti/majibu?mwezi=${prev}` },
    });
  }

  if (left <= 5 && !input.hasReviewThisMonth) {
    out.push({
      id: `review-${month}`,
      tone: "wait",
      text: left === 0 ? "Leo ni siku ya mwisho ya mwezi. Jibu maswali ya mwisho wa mwezi." : `Zimebaki siku ${left} mwezi uishe. Jibu maswali ya mwisho wa mwezi mapema.`,
      action: { label: "Jibu sasa", to: `/ripoti/majibu?mwezi=${month}` },
    });
  }

  if (input.pendingCount > 0 && input.oldestPendingAt !== null && now.getTime() - input.oldestPendingAt > 2 * DAY) {
    out.push({
      id: "unsent",
      tone: "wait",
      text: `Kumbukumbu ${input.pendingCount} zimekaa kwenye simu kwa zaidi ya siku 2. Zitatumwa ukipata mtandao.`,
    });
  }

  if (input.lastEntryAt === null) {
    out.push({ id: "welcome", tone: "ok", text: "Karibu! Ukimaliza kila shughuli, iandike hapa. Ripoti ya mwezi itajijenga yenyewe." });
  } else {
    const idle = Math.floor((now.getTime() - input.lastEntryAt) / DAY);
    if (idle >= 3) out.push({ id: `idle-${monthKey(now)}-${day}`, tone: "ok", text: `Siku ${idle} bila kumbukumbu mpya. Kazi ya leo ni ipi?` });
  }

  return out.slice(0, 2);
}

export type PeriodSummary = {
  total: number;
  byType: { type: string; label: string; count: number }[];
  trained: { men: number; women: number };
  treated: number;
  vaccinated: number;
  areaAffectedHa: number;
  areaSavedHa: number;
  /** Pesticides by name and unit, e.g. "Duduba 450EC" → 7 lita. */
  pesticides: { name: string; unit: string; quantity: number; uses: number }[];
  /** Drugs used in livestock treatment, with how often. */
  drugs: { name: string; uses: number; animals: number }[];
};

/** Totals for any set of records, for the Shughuli summary and PEPMIS. */
export function periodSummary(records: readonly InsightRecord[]): PeriodSummary {
  const rs = live(records);
  const types = new Map<string, number>();
  for (const r of rs) types.set(r.type, (types.get(r.type) ?? 0) + 1);

  const pest = new Map<string, { name: string; unit: string; quantity: number; uses: number }>();
  for (const r of rs.filter((x) => x.type === "pest_outbreak" && str(x.payload.pesticide))) {
    const name = str(r.payload.pesticide);
    const unit = labelOf(AMOUNT_UNITS, r.payload.unit) || "";
    const k = `${name.toLowerCase()}|${unit}`;
    const cur = pest.get(k) ?? { name, unit, quantity: 0, uses: 0 };
    cur.quantity += num(r.payload.quantity);
    cur.uses += 1;
    pest.set(k, cur);
  }
  const drugs = new Map<string, { name: string; uses: number; animals: number }>();
  for (const r of rs.filter((x) => (x.type === "livestock_treatment" && str(x.payload.drug)) || (x.type === "vaccination" && str(x.payload.product)))) {
    const name = str(r.type === "vaccination" ? r.payload.product : r.payload.drug);
    const k = name.toLowerCase();
    const cur = drugs.get(k) ?? { name, uses: 0, animals: 0 };
    cur.uses += 1;
    cur.animals += num(r.type === "vaccination" ? r.payload.count : r.payload.treated);
    drugs.set(k, cur);
  }

  const sum = (type: string, key: string) => rs.filter((r) => r.type === type).reduce((a, r) => a + num(r.payload[key]), 0);
  return {
    total: rs.length,
    byType: [...types.entries()]
      .map(([type, count]) => ({ type, label: specFor(type)?.label ?? type, count }))
      .sort((a, b) => b.count - a.count),
    trained: { men: sum("training", "men"), women: sum("training", "women") },
    treated: sum("livestock_treatment", "treated"),
    vaccinated: sum("vaccination", "count"),
    areaAffectedHa: sum("pest_outbreak", "areaAffectedHa"),
    areaSavedHa: sum("pest_outbreak", "areaSavedHa"),
    pesticides: [...pest.values()].sort((a, b) => b.quantity - a.quantity),
    drugs: [...drugs.values()].sort((a, b) => b.animals - a.animals),
  };
}

/** The last few kinds of entry the officer made, newest first, for one-tap repeats. */
export function recentKinds(
  records: readonly (InsightRecord & { clientUpdatedAt: number })[],
  limit = 5,
): { type: string; section: Section; at: number }[] {
  const seen = new Set<string>();
  const out: { type: string; section: Section; at: number }[] = [];
  for (const r of [...records].sort((a, b) => b.clientUpdatedAt - a.clientUpdatedAt)) {
    if (r.deletedAt || r.type === "monthly_review" || !specFor(r.type)?.ready) continue;
    const k = `${r.type}|${r.section}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ type: r.type, section: r.section, at: r.clientUpdatedAt });
    if (out.length >= limit) break;
  }
  return out;
}
