/**
 * A report as plain data. The in-app preview and the .docx export both render
 * this structure, so they always show the same numbers.
 */

export type Cell = string | number | null;

export type Column = {
  label: string;
  /** Roman-numeral marker printed on the official form, e.g. "(iv)". */
  marker?: string;
  align?: "start" | "end";
  /** Relative width for printing. */
  width?: number;
};

/** A header cell spanning several columns, above the column labels. */
export type ColumnGroup = { label: string; span: number };

export type TableBlock = {
  kind: "table";
  id: string;
  title?: string;
  columns: Column[];
  groups?: ColumnGroup[];
  rows: Cell[][];
  /** Index of rows that are totals (printed bold). */
  totalRows?: number[];
  note?: string;
  /** True when at least one value came from the officer's records or review. */
  hasData: boolean;
  /**
   * Cells the officer typed in at the end of the period, as [row, column]:
   * values not built from records. Printed with TYPED_MARK so readers can
   * tell them apart.
   */
  typed?: [number, number][];
};

/** Printed after a typed-in value, with TYPED_NOTE under the table. */
export const TYPED_MARK = "✎";
export const TYPED_NOTE = "✎ Taarifa iliyoongezwa na afisa (haikutokana na kumbukumbu za kila siku).";

export const isTyped = (t: TableBlock, r: number, c: number) => !!t.typed?.some(([tr, tc]) => tr === r && tc === c);

export type TextBlock = {
  kind: "text";
  id: string;
  title?: string;
  text: string;
  note?: string;
  hasData: boolean;
  /** Where the text came from: the officer's own words, or generated from records. */
  source: "review" | "records" | "empty";
};

export type Block = TableBlock | TextBlock;

export type ReportPart = {
  id: string;
  number: string;
  title: string;
  blocks: Block[];
};

export type ReportHeader = {
  ministry: string;
  title: string;
  edition: string;
  areaLabel: string;
  officerName: string;
  phone: string;
  monthLabel: string;
  /** What the period line is called: "Mwezi" on the monthly form, "Kipindi" elsewhere. */
  periodName?: string;
  financialYear: string;
  submitNote: string;
  instructions: string[];
};

export type Report = {
  /**
   * "monthly", "quarterly", "annual": the ARDS forms; "weekly": a section's
   * week; "performance": plan against results; "food": food availability and prices.
   */
  kind: "monthly" | "quarterly" | "annual" | "performance" | "food" | "weekly";
  /** Weekly reports are per section. */
  section?: "kilimo" | "mifugo";
  formVersion: "2018-07";
  /** The period: "2026-11" (monthly, weekly uses the Monday), "2026-27-Q2" (quarterly), "2026-27" (annual). */
  month: string;
  header: ReportHeader;
  parts: ReportPart[];
};

export function partHasData(part: ReportPart): boolean {
  return part.blocks.some((b) => b.hasData);
}
