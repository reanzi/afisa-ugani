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

export function monthLabel(key: string, lang: "sw" | "en" = "sw"): string {
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
