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
};

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
  /** "monthly": the ARDS form; "performance": plan against results; "food": food availability and prices. */
  kind: "monthly" | "performance" | "food";
  formVersion: "2018-07";
  month: string;
  header: ReportHeader;
  parts: ReportPart[];
};

export function partHasData(part: ReportPart): boolean {
  return part.blocks.some((b) => b.hasData);
}
