import { textLang } from "./lang.ts";
/** Reporting periods. Months are "YYYY-MM" in the officer's local time. */

export function monthKey(date: Date | number): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonth(key: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Bad month key ${key}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** [start, end) in epoch ms, local time. */
export function monthRange(key: string): { start: number; end: number } {
  const { year, month } = parseMonth(key);
  return { start: new Date(year, month - 1, 1).getTime(), end: new Date(year, month, 1).getTime() };
}

export function daysInMonth(key: string): number {
  const { year, month } = parseMonth(key);
  return new Date(year, month, 0).getDate();
}

export function shiftMonth(key: string, delta: number): string {
  const { year, month } = parseMonth(key);
  return monthKey(new Date(year, month - 1 + delta, 1));
}

/** Tanzania's financial year runs July–June: November 2026 is in 2026/27. */
export function financialYear(key: string): string {
  const { year, month } = parseMonth(key);
  const start = month >= 7 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Quarter of the financial year: Jul–Sep is 1, Oct–Dec 2, Jan–Mar 3, Apr–Jun 4. */
export function fyQuarter(key: string): 1 | 2 | 3 | 4 {
  const { month } = parseMonth(key);
  return (Math.floor(((month + 5) % 12) / 3) + 1) as 1 | 2 | 3 | 4;
}

export const SW_MONTHS = [
  "Januari", "Februari", "Machi", "Aprili", "Mei", "Juni",
  "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba",
];

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(key: string, lang: "sw" | "en" = textLang()): string {
  const { year, month } = parseMonth(key);
  return `${(lang === "en" ? EN_MONTHS : SW_MONTHS)[month - 1]} ${year}`;
}

/**
 * Council time. Tanzania is UTC+3 all year. The server runs in UTC, so before
 * using the period helpers (which read the clock in local time) the server
 * shifts timestamps by this offset; the phone already runs in local time.
 */
export const COUNCIL_UTC_OFFSET_MINUTES = 180;
export const toCouncilWallClock = (utcMs: number) => utcMs + COUNCIL_UTC_OFFSET_MINUTES * 60_000;

/** The monthly report can be sent once the month has ended, and is due on the 5th of the next month. */
export const MONTHLY_DUE_DAY = 5;
export function monthlyWindow(month: string): { opens: number; due: number } {
  const { year, month: m } = parseMonth(month);
  return { opens: new Date(year, m, 1).getTime(), due: new Date(year, m, MONTHLY_DUE_DAY, 23, 59).getTime() };
}

// ---------- weeks ----------
// A week runs Monday to Sunday and is keyed by its Monday, "YYYY-MM-DD", in local time.

export const WEEK_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseWeek(key: string): Date {
  if (!WEEK_RE.test(key)) throw new Error(`Bad week key ${key}`);
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** The Monday of the week containing `date`. */
export function weekKey(date: Date | number): string {
  const d = new Date(date);
  const back = (d.getDay() + 6) % 7; // Monday = 0
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back));
}

export function isWeekKey(key: string): boolean {
  return WEEK_RE.test(key) && weekKey(parseWeek(key)) === key;
}

/** [start, end) in epoch ms, local time: Monday 00:00 to the next Monday 00:00. */
export function weekRange(key: string): { start: number; end: number } {
  const s = parseWeek(key);
  return { start: s.getTime(), end: new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7).getTime() };
}

export function shiftWeek(key: string, delta: number): string {
  const s = parseWeek(key);
  return dayKey(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7 * delta));
}

/** "16 – 22 Novemba 2026" / "Nov 16 – 22, 2026". */
export function weekLabel(key: string, lang: "sw" | "en" = textLang()): string {
  const s = parseWeek(key);
  const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
  const names = lang === "en" ? EN_MONTHS : SW_MONTHS;
  const sameMonth = s.getMonth() === e.getMonth();
  const sameYear = s.getFullYear() === e.getFullYear();
  if (lang === "en") {
    const short = (d: Date) => names[d.getMonth()]!.slice(0, 3);
    if (sameMonth) return `${short(s)} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`;
    return `${short(s)} ${s.getDate()}${sameYear ? "" : `, ${s.getFullYear()}`} – ${short(e)} ${e.getDate()}, ${e.getFullYear()}`;
  }
  if (sameMonth) return `${s.getDate()} – ${e.getDate()} ${names[e.getMonth()]} ${e.getFullYear()}`;
  return `${s.getDate()} ${names[s.getMonth()]}${sameYear ? "" : ` ${s.getFullYear()}`} – ${e.getDate()} ${names[e.getMonth()]} ${e.getFullYear()}`;
}

/** The month a week is counted in (the month of its Thursday), for the financial year. */
export function weekMonth(key: string): string {
  const s = parseWeek(key);
  return monthKey(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 3));
}

/**
 * Weekly reports go to HQ's Monday morning meeting: they can be sent from
 * Sunday 18:00 and are due on Monday at 05:00, when auto-send runs.
 */
export const WEEKLY_OPENS_HOUR = 18;
export const WEEKLY_DUE_HOUR = 5;
export function weeklyWindow(key: string): { opens: number; due: number } {
  const { end } = weekRange(key);
  const monday = new Date(end);
  return {
    opens: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 1, WEEKLY_OPENS_HOUR).getTime(),
    due: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), WEEKLY_DUE_HOUR).getTime(),
  };
}

/** The week an officer is reporting now: this week from Sunday 18:00, otherwise last week. */
export function reportingWeek(now: Date | number): string {
  const current = weekKey(now);
  return new Date(now).getTime() >= weeklyWindow(current).opens ? current : shiftWeek(current, -1);
}
