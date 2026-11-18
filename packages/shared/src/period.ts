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

export function monthLabel(key: string): string {
  const { year, month } = parseMonth(key);
  return `${SW_MONTHS[month - 1]} ${year}`;
}
