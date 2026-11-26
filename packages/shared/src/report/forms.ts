/**
 * Typed-in tables of the ARDS quarterly and annual forms.
 *
 * Each table is declared once (InputTable): its columns, fixed rows, whether
 * the officer may add rows, computed columns and the columns that come from
 * records ("auto"). The same declaration drives the report (inputTableBlock)
 * and the phone editor, so they cannot drift apart.
 */
import type { Option } from "../catalogs.ts";
import type { Additions, CellValue } from "./additions.ts";
import { validateAdditions } from "./additions.ts";
import type { Cell, Column, ColumnGroup, TableBlock } from "./model.ts";

export type InputKind = "count" | "decimal" | "text" | "choice" | "check";

export type InputCol = {
  key: string;
  label: string;
  marker?: string;
  width?: number;
  kind: InputKind;
  options?: readonly Option[];
  /** Filled from records by the report builder; read-only in the editor. */
  auto?: boolean;
  /** Worked out from the row's other values (e.g. totals); read-only. */
  compute?: (row: RowValues) => number;
  /** Officer hint in the editor (screen language). */
  hint?: string;
};

export type FixedRow = { key: string; label: string };
/** A row that adds up other rows (by key). */
export type SubtotalRow = { key: string; label: string; of: readonly string[] };
export type TableRow = FixedRow | SubtotalRow;
export const isSubtotal = (r: TableRow): r is SubtotalRow => "of" in r;

export type InputTable = {
  id: string;
  /** Part of the form the table belongs to (InputPart.id). */
  part: string;
  title?: string;
  note?: string;
  /** Editor help (screen language). */
  hint?: string;
  /** Header of the row-label column when the table has fixed rows. */
  rowHeader?: string;
  cols: readonly InputCol[];
  groups?: readonly ColumnGroup[];
  rows?: readonly TableRow[];
  /** The officer may add rows (free rows, or "Mengineyo (taja)" under fixed rows), up to this many. */
  extraRows?: number;
  /** Label column header for added rows under fixed rows, e.g. "Mengineyo (taja)". */
  extraLabel?: string;
  /** Only one row may be ticked ("check" columns). */
  single?: boolean;
  /** Pre-filled from last year's report until the officer confirms it (annual inventory). */
  carry?: boolean;
  /** Label of a closing total row that sums the numeric columns. */
  totalLabel?: string;
};

export type InputPart = { id: string; number: string; title: string };

/** Values of one row: column key -> value. Added rows also hold "_label". */
export type RowValues = Record<string, CellValue | undefined>;
/** Values of one table: row key -> row. Added rows use keys starting with "x". */
export type TableValues = Record<string, RowValues>;

/** The officer's end-of-period answers for a quarterly or annual report. */
export type PeriodReview = {
  /** "2026-27-Q2" or "2026-27". */
  period: string;
  tables?: Record<string, TableValues>;
  /** Carry-over tables the officer has checked for this period. */
  confirmed?: string[];
  additions?: Additions;
};

export const EXTRA_PREFIX = "x";
export const isExtraRow = (key: string) => key.startsWith(EXTRA_PREFIX);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round = (v: number) => Math.round(v * 100) / 100;
const numeric = (c: InputCol) => c.kind === "count" || c.kind === "decimal" || !!c.compute;
const num = (v: unknown) => (isNum(v) ? v : 0);

/** The value shown for a column: computed, from records, or typed. */
function cellOf(c: InputCol, row: RowValues, auto: RowValues | undefined): CellValue | undefined {
  if (c.compute) return round(c.compute(resolveRow(row, auto)));
  if (c.auto) return auto?.[c.key];
  return row[c.key];
}

function resolveRow(row: RowValues, auto: RowValues | undefined): RowValues {
  return { ...row, ...(auto ?? {}) };
}

function render(c: InputCol, v: CellValue | undefined): Cell {
  if (c.kind === "check") return v ? "✓" : "";
  if (c.kind === "choice") {
    const o = c.options?.find((x) => x.value === v);
    return o ? (o.sw ?? o.label) : typeof v === "string" ? v : "";
  }
  if (numeric(c)) return isNum(v) ? v : 0;
  return typeof v === "string" ? v : isNum(v) ? v : "";
}

/** Rows the officer added, in the order they were added. */
export function extraRows(values: TableValues | undefined): [string, RowValues][] {
  return Object.entries(values ?? {}).filter(([k]) => isExtraRow(k));
}

function filled(v: CellValue | undefined): boolean {
  return typeof v === "string" ? v.trim().length > 0 : isNum(v) && v !== 0;
}

/**
 * The report table for an input table.
 * `auto` holds record-built values by row key (and extra auto rows under "a…" keys).
 */
export function inputTableBlock(spec: InputTable, values: TableValues | undefined, auto?: Record<string, RowValues>): TableBlock {
  const v = values ?? {};
  const columns: Column[] = [
    ...(spec.rows ? [{ label: spec.rowHeader ?? "" }] : []),
    ...spec.cols.map((c) => ({ label: c.label, marker: c.marker, width: c.width, align: numeric(c) ? ("end" as const) : undefined })),
  ];
  const groups = spec.groups ? [...(spec.rows ? [{ label: "", span: 1 }] : []), ...spec.groups] : undefined;
  const rows: Cell[][] = [];
  const totalRows: number[] = [];
  let hasData = false;
  const resolved = new Map<string, Cell[]>();

  const bodyRow = (key: string, label: string | null, row: RowValues, a: RowValues | undefined): Cell[] => {
    const cells = spec.cols.map((c) => {
      const val = cellOf(c, row, a);
      if (!c.compute && filled(val)) hasData = true;
      return render(c, val);
    });
    const out = label === null ? cells : [label, ...cells];
    resolved.set(key, out);
    return out;
  };

  if (spec.rows) {
    for (const r of spec.rows) {
      if (isSubtotal(r)) {
        const parts = r.of.map((k) => resolved.get(k)).filter((x): x is Cell[] => !!x);
        const cells: Cell[] = [r.label, ...spec.cols.map((c, i) => (numeric(c) ? round(parts.reduce((s, p) => s + num(p[i + 1]), 0)) : ""))];
        totalRows.push(rows.length);
        rows.push(cells);
        resolved.set(r.key, cells);
        continue;
      }
      rows.push(bodyRow(r.key, r.label, v[r.key] ?? {}, auto?.[r.key]));
    }
    for (const [k, a] of Object.entries(auto ?? {})) {
      if (spec.rows.some((r) => r.key === k)) continue;
      rows.push(bodyRow(k, String(a._label ?? ""), {}, a));
    }
    for (const [k, row] of extraRows(v)) {
      rows.push(bodyRow(k, typeof row._label === "string" ? row._label : "", row, undefined));
    }
  } else {
    for (const [k, a] of Object.entries(auto ?? {})) rows.push(bodyRow(k, null, {}, a));
    for (const [k, row] of extraRows(v)) rows.push(bodyRow(k, null, row, undefined));
    if (rows.length === 0) rows.push(spec.cols.map((c) => render(c, undefined)));
  }

  if (spec.totalLabel) {
    const body = rows.filter((_, i) => !totalRows.includes(i));
    const offset = spec.rows ? 1 : 0;
    const total: Cell[] = columns.map(() => "");
    total[0] = spec.totalLabel;
    spec.cols.forEach((c, i) => {
      if (numeric(c)) total[i + offset] = round(body.reduce((s, r) => s + num(r[i + offset]), 0));
    });
    totalRows.push(rows.length);
    rows.push(total);
  }

  return {
    kind: "table",
    id: spec.id,
    title: spec.title,
    columns,
    groups,
    rows,
    totalRows: totalRows.length ? totalRows : undefined,
    note: spec.note,
    hasData,
  };
}

/** Values to use for a table: this period's, else last year's for carry-over tables. */
export function tableValues(spec: InputTable, review: PeriodReview | null | undefined, previous?: PeriodReview | null): TableValues | undefined {
  const mine = review?.tables?.[spec.id];
  if (mine && Object.keys(mine).length) return mine;
  if (spec.carry) return previous?.tables?.[spec.id];
  return undefined;
}

/** Carry-over tables that still show last year's values unchecked. */
export function unconfirmedCarry(specs: readonly InputTable[], review: PeriodReview | null | undefined, previous?: PeriodReview | null): InputTable[] {
  return specs.filter((s) => s.carry && !review?.confirmed?.includes(s.id) && !review?.tables?.[s.id] && !!previous?.tables?.[s.id]);
}

// ---------- validation ----------

const MAX_TEXT = 500;
const MAX_NUMBER = 1e12;

export function validateTableValues(specs: readonly InputTable[], tables: unknown): string | null {
  if (tables === undefined) return null;
  if (tables === null || typeof tables !== "object" || Array.isArray(tables)) return "BAD_TABLES";
  for (const [id, t] of Object.entries(tables as Record<string, unknown>)) {
    const spec = specs.find((s) => s.id === id);
    if (!spec) continue; // older or newer table: ignored by the builder
    if (t === null || typeof t !== "object" || Array.isArray(t)) return `BAD_TABLE:${id}`;
    const rows = Object.entries(t as Record<string, unknown>);
    if (rows.filter(([k]) => isExtraRow(k)).length > (spec.extraRows ?? 0)) return `TOO_MANY_ROWS:${id}`;
    for (const [rk, row] of rows) {
      if (rk.length > 64) return `BAD_ROW:${id}`;
      if (!isExtraRow(rk) && !spec.rows?.some((r) => r.key === rk && !isSubtotal(r))) return `BAD_ROW:${id}`;
      if (row === null || typeof row !== "object" || Array.isArray(row)) return `BAD_ROW:${id}`;
      for (const [ck, cell] of Object.entries(row as Record<string, unknown>)) {
        if (cell === undefined || cell === null || cell === "") continue;
        if (ck === "_label") {
          if (typeof cell !== "string" || cell.length > MAX_TEXT) return `BAD_CELL:${id}`;
          continue;
        }
        const col = spec.cols.find((c) => c.key === ck);
        if (!col || col.auto || col.compute) continue;
        if (col.kind === "count" && !(isNum(cell) && Number.isInteger(cell) && cell >= 0 && cell <= MAX_NUMBER)) return `BAD_CELL:${id}.${ck}`;
        if (col.kind === "decimal" && !(isNum(cell) && cell >= 0 && cell <= MAX_NUMBER)) return `BAD_CELL:${id}.${ck}`;
        if (col.kind === "check" && cell !== 1) return `BAD_CELL:${id}.${ck}`;
        if (col.kind === "text" && !(typeof cell === "string" && cell.length <= MAX_TEXT)) return `BAD_CELL:${id}.${ck}`;
        if (col.kind === "choice" && !(typeof cell === "string" && col.options?.some((o) => o.value === cell))) return `BAD_CELL:${id}.${ck}`;
      }
    }
  }
  return null;
}

export function validatePeriodReview(specs: readonly InputTable[], isPeriod: (k: string) => boolean, p: Record<string, unknown>): string | null {
  if (typeof p.period !== "string" || !isPeriod(p.period)) return "BAD_PERIOD";
  if (p.confirmed !== undefined && (!Array.isArray(p.confirmed) || p.confirmed.length > 100 || p.confirmed.some((x) => typeof x !== "string"))) return "BAD_CONFIRMED";
  return validateTableValues(specs, p.tables) ?? validateAdditions(p.additions);
}

/** Helper for computed totals. */
export const sumOf = (...keys: string[]) => (row: RowValues) => keys.reduce((s, k) => s + num(row[k]), 0);
export const productOf = (a: string, b: string) => (row: RowValues) => num(row[a]) * num(row[b]);

/** A sent quarterly or annual report: the right kind and period, and not oversized. */
export function validatePeriodicReport(p: unknown, kind: "quarterly" | "annual", period: string): string | null {
  if (!p || typeof p !== "object") return "NOT_OBJECT";
  const r = p as Record<string, unknown>;
  if (r.kind !== kind || r.month !== period) return "BAD_KIND";
  if (!Array.isArray(r.parts) || r.parts.length === 0 || r.parts.length > 30) return "BAD_PARTS";
  if (!r.header || typeof r.header !== "object") return "BAD_HEADER";
  if (JSON.stringify(p).length > 900_000) return "TOO_LARGE";
  return null;
}
