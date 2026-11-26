/**
 * Officer additions: information that was not recorded during the period,
 * typed in at the end of it (monthly, quarterly and annual reports).
 *
 * Values built from records are never edited. An officer can only add:
 * - a cell addition: an amount added to a numeric cell (shown "12 ✎" where 3
 *   of the 12 were typed in), or text added to a text cell;
 * - a row addition: a whole new row in a table.
 * Every touched cell is listed in the table's `typed`, so the report shows
 * which values came from the officer rather than from records. Totals that
 * are sums of the rows above them are recomputed.
 */
import { TYPED_NOTE, type Block, type Cell, type Report, type TableBlock } from "./model.ts";

export type CellValue = number | string;
/** Added to the cell in `row` (matched by the row's first cell) and column `col`. */
export type CellAddition = { table: string; row: string; col: number; value: CellValue };
/** A new row; `id` keeps it stable while it is edited. */
export type RowAddition = { table: string; id: string; cells: (CellValue | null)[] };
export type Additions = { cells?: CellAddition[]; rows?: RowAddition[] };

const MAX_ITEMS = 500;
const MAX_TEXT = 500;
const MAX_NUMBER = 1e12;
const round = (v: number) => Math.round(v * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const keyOf = (v: Cell | undefined) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim().toLowerCase().replace(/\s+/g, " ");

function badValue(v: unknown): boolean {
  if (typeof v === "number") return !Number.isFinite(v) || v < 0 || v > MAX_NUMBER;
  if (typeof v === "string") return v.length > MAX_TEXT;
  return true;
}

export function validateAdditions(v: unknown): string | null {
  if (v === undefined) return null;
  if (v === null || typeof v !== "object" || Array.isArray(v)) return "BAD_ADDITIONS";
  const a = v as Record<string, unknown>;
  if (a.cells !== undefined) {
    if (!Array.isArray(a.cells) || a.cells.length > MAX_ITEMS) return "BAD_ADDITIONS:cells";
    for (const c of a.cells as unknown[]) {
      const x = c as Record<string, unknown>;
      if (!x || typeof x.table !== "string" || typeof x.row !== "string" || x.row.length > MAX_TEXT) return "BAD_ADDITIONS:cells";
      if (typeof x.col !== "number" || !Number.isInteger(x.col) || x.col < 0 || x.col > 50) return "BAD_ADDITIONS:cells";
      if (badValue(x.value)) return "BAD_ADDITIONS:cells";
    }
  }
  if (a.rows !== undefined) {
    if (!Array.isArray(a.rows) || a.rows.length > MAX_ITEMS) return "BAD_ADDITIONS:rows";
    for (const r of a.rows as unknown[]) {
      const x = r as Record<string, unknown>;
      if (!x || typeof x.table !== "string" || typeof x.id !== "string" || x.id.length > 64) return "BAD_ADDITIONS:rows";
      if (!Array.isArray(x.cells) || x.cells.length > 50) return "BAD_ADDITIONS:rows";
      for (const cell of x.cells as unknown[]) if (cell !== null && cell !== "" && badValue(cell)) return "BAD_ADDITIONS:rows";
    }
  }
  return null;
}

export function hasAdditions(a: Additions | null | undefined): boolean {
  return !!a && ((a.cells?.length ?? 0) > 0 || (a.rows?.length ?? 0) > 0);
}

/** Columns whose total rows are plain sums of the rows above them (per segment). */
function sumColumns(t: TableBlock): Map<number, number[]> {
  const totals = [...(t.totalRows ?? [])].sort((a, b) => a - b);
  const out = new Map<number, number[]>(); // total row -> summed columns
  let from = 0;
  for (const tr of totals) {
    const body = t.rows.slice(from, tr).filter((_, i) => !totals.includes(from + i));
    const cols: number[] = [];
    t.rows[tr]?.forEach((cell, c) => {
      if (!isNum(cell)) return;
      const sum = round(body.reduce((a, r) => a + (isNum(r[c]) ? r[c] : 0), 0));
      if (Math.abs(sum - cell) < 0.011) cols.push(c);
    });
    out.set(tr, cols);
    from = tr + 1;
  }
  return out;
}

function applyToTable(t: TableBlock, cells: CellAddition[], rows: RowAddition[]): TableBlock {
  if (cells.length === 0 && rows.length === 0) return t;
  const summed = sumColumns(t);
  const totals = new Set(t.totalRows ?? []);
  const width = t.columns.length;
  let body: { cells: Cell[]; total: number[] | null }[] = t.rows.map((r, i) => ({ cells: [...r], total: totals.has(i) ? (summed.get(i) ?? []) : null }));
  type Row = (typeof body)[number];
  const marks: { row: Row; c: number }[] = [];

  // Cell additions on existing (non-total) rows.
  for (const a of cells) {
    const row = body.find((r) => r.total === null && keyOf(r.cells[0]) === keyOf(a.row));
    if (!row || a.col >= width || a.col === 0) continue;
    const cur = row.cells[a.col];
    if (isNum(a.value)) {
      if (isNum(cur)) row.cells[a.col] = round(cur + a.value);
      else if (cur === null || cur === undefined || cur === "" || cur === "—") row.cells[a.col] = a.value;
      else continue;
    } else {
      const text = a.value.trim();
      if (!text) continue;
      row.cells[a.col] = typeof cur === "string" && cur.trim() && cur !== "—" ? `${cur}; ${text}` : text;
    }
    marks.push({ row, c: a.col });
  }

  // Row additions go before the first total row when totals close the table, else at the end.
  const lastBody = body.reduce((m, r, i) => (r.total === null ? i : m), -1);
  const firstTotal = body.findIndex((r) => r.total !== null);
  const at = firstTotal > lastBody && firstTotal >= 0 ? firstTotal : body.length;
  const added = rows.map((r) => {
    const cells: Cell[] = Array.from({ length: width }, (_, c) => {
      const v = r.cells[c];
      return v === undefined || v === null ? "" : v;
    });
    return { cells, total: null } as Row;
  });
  body = [...body.slice(0, at), ...added, ...body.slice(at)];
  for (const r of added) r.cells.forEach((v, c) => v !== "" && marks.push({ row: r, c }));

  // Recompute sum totals per segment.
  let seg: Cell[][] = [];
  for (const r of body) {
    if (r.total === null) {
      seg.push(r.cells);
      continue;
    }
    for (const c of r.total) r.cells[c] = round(seg.reduce((a, x) => a + (isNum(x[c]) ? x[c] : 0), 0));
    seg = [];
  }

  // Original typed cells keep their marks at their new positions.
  const index = new Map(body.map((r, i) => [r, i] as const));
  const shifted = (t.typed ?? []).map(([r, c]) => [r >= at ? r + added.length : r, c] as [number, number]);
  const newTyped = [...shifted, ...marks.map((m) => [index.get(m.row)!, m.c] as [number, number])];
  const totalRows = body.flatMap((r, i) => (r.total !== null ? [i] : []));
  const note = t.note?.includes(TYPED_NOTE) ? t.note : [t.note, TYPED_NOTE].filter(Boolean).join(" ");
  return {
    ...t,
    rows: body.map((r) => r.cells),
    totalRows: totalRows.length ? totalRows : t.totalRows,
    typed: dedupe(newTyped),
    hasData: true,
    note,
  };
}

function dedupe(xs: [number, number][]): [number, number][] {
  const seen = new Set<string>();
  return xs.filter(([r, c]) => {
    const k = `${r}:${c}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The report with the officer's additions applied. Additions for tables that no longer exist are skipped. */
export function applyAdditions(report: Report, add: Additions | null | undefined): Report {
  if (!hasAdditions(add)) return report;
  const cells = add!.cells ?? [];
  const rows = add!.rows ?? [];
  return {
    ...report,
    parts: report.parts.map((p) => ({
      ...p,
      blocks: p.blocks.map((b): Block => {
        if (b.kind !== "table") return b;
        return applyToTable(
          b,
          cells.filter((c) => c.table === b.id),
          rows.filter((r) => r.table === b.id),
        );
      }),
    })),
  };
}

/** Every table in a report, for editors. */
export function reportTables(report: Report): { partTitle: string; table: TableBlock }[] {
  return report.parts.flatMap((p) => p.blocks.filter((b): b is TableBlock => b.kind === "table").map((table) => ({ partTitle: `${p.number}. ${p.title}`, table })));
}
