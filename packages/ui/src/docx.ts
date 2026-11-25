/**
 * Renders a Report into a Word document laid out like the printed July 2018
 * form: the OR-TAMISEMI header, the officer and period fields, the ANGALIZO
 * box, then each numbered part with its tables. Landscape A4, because the
 * outbreak table has twelve columns. Loaded on demand, and runs offline.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { Block, Cell, Report, TableBlock } from "@afisa/shared";
import { shortDate } from "./format";

const FONT = "Arial";
const BODY = 19; // half-points: 9.5 pt
const SMALL = 16;
const PAGE_W = 16838; // A4 landscape, twips
const MARGIN = 720;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const HEAD_FILL = "E7EBE6";

const border = { style: BorderStyle.SINGLE, size: 4, color: "555555" };
const borders = { top: border, bottom: border, left: border, right: border };

function fmt(c: Cell): string {
  if (c === null || c === "") return "";
  if (typeof c === "number") return c.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return c;
}

function para(text: string, opts: { bold?: boolean; size?: number; italics?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; keepNext?: boolean } = {}) {
  const lines = text.split("\n");
  return new Paragraph({
    alignment: opts.align,
    keepNext: opts.keepNext,
    keepLines: opts.keepNext,
    spacing: { after: opts.after ?? 60, before: opts.before ?? 0 },
    children: lines.flatMap((line, i) => [
      ...(i > 0 ? [new TextRun({ break: 1 })] : []),
      new TextRun({ text: line, bold: opts.bold, italics: opts.italics, size: opts.size ?? BODY, font: FONT }),
    ]),
  });
}

function cell(text: string, opts: { bold?: boolean; fill?: string; align?: "start" | "end" | "center"; span?: number; width?: number; size?: number } = {}) {
  return new TableCell({
    borders,
    columnSpan: opts.span,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      para(text, {
        bold: opts.bold,
        size: opts.size ?? SMALL,
        after: 0,
        align: opts.align === "end" ? AlignmentType.RIGHT : opts.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
      }),
    ],
  });
}

function widths(block: TableBlock): number[] {
  const rel = block.columns.map((c, i) => c.width ?? (i === 0 ? 1.6 : 1));
  const total = rel.reduce((a, b) => a + b, 0);
  return rel.map((r) => Math.floor((r / total) * CONTENT_W));
}

function renderTable(block: TableBlock): Table {
  const w = widths(block);
  const rows: TableRow[] = [];
  if (block.groups && block.groups.some((g) => g.label)) {
    let col = 0;
    rows.push(
      new TableRow({
        tableHeader: true,
        children: block.groups.map((g) => {
          const width = w.slice(col, col + g.span).reduce((a, b) => a + b, 0);
          col += g.span;
          return cell(g.label, { bold: true, fill: g.label ? HEAD_FILL : undefined, span: g.span, width, align: "center" });
        }),
      }),
    );
  }
  rows.push(
    new TableRow({
      tableHeader: true,
      children: block.columns.map((c, i) => cell(c.marker ? `${c.label} ${c.marker}` : c.label, { bold: true, fill: HEAD_FILL, width: w[i], align: "center" })),
    }),
  );
  block.rows.forEach((row, r) => {
    const total = block.totalRows?.includes(r) ?? false;
    rows.push(
      new TableRow({
        cantSplit: true,
        children: row.map((c, i) => cell(fmt(c), { bold: total || i === 0, width: w[i], align: typeof c === "number" ? "end" : "start" })),
      }),
    );
  });
  return new Table({ rows, columnWidths: w, width: { size: CONTENT_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED });
}

function renderBlock(block: Block): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  if (block.title) out.push(para(block.title, { bold: true, before: 120, after: 60, keepNext: true }));
  if (block.kind === "table") {
    out.push(renderTable(block));
  } else {
    out.push(
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: [CONTENT_W],
        rows: [new TableRow({ children: [new TableCell({ borders, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [para(block.text || " ", { after: 0 })] })] })],
      }),
    );
  }
  if (block.note) out.push(para(`Maelezo: ${block.note}`, { italics: true, size: SMALL, before: 40 }));
  return out;
}

function headerFields(report: Report): Table {
  const h = report.header;
  const third = Math.floor(CONTENT_W / 3);
  const f = (label: string, value: string) =>
    new TableCell({
      borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: border },
      width: { size: third, type: WidthType.DXA },
      margins: { top: 40, bottom: 20, left: 0, right: 160 },
      children: [new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true, size: BODY, font: FONT }), new TextRun({ text: value, size: BODY, font: FONT })] })],
    });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [third, third, third],
    rows: [
      new TableRow({ children: [f("Jina la Kijiji/ Mtaa/ Kata", h.areaLabel), f("Jina la Afisa Ugani", h.officerName), f("Namba ya simu", h.phone)] }),
      new TableRow({ children: [f(h.periodName ?? "Mwezi", h.monthLabel), f("Mwaka wa Fedha", h.financialYear), f("Tarehe ya kuwasilisha", "")] }),
    ],
  });
}

function instructions(report: Report): Table {
  const lines = report.header.instructions.map((t, i) => `${i + 1}) ${t}`).join("\n");
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [para("ANGALIZO", { bold: true, after: 40 }), para(lines, { size: SMALL, after: 0 })],
          }),
        ],
      }),
    ],
  });
}

export async function reportToDocx(report: Report): Promise<Blob> {
  const h = report.header;
  const children: (Paragraph | Table)[] = [
    para(h.ministry, { bold: true, align: AlignmentType.CENTER, size: 22, after: 40 }),
    para(h.title, { bold: true, align: AlignmentType.CENTER, size: 22, after: 40 }),
    para(h.edition || " ", { align: AlignmentType.RIGHT, size: SMALL, after: 120 }),
    headerFields(report),
    para(`(${h.submitNote})`, { italics: true, size: SMALL, before: 120, after: 120 }),
    ...(h.instructions.length ? [instructions(report)] : []),
  ];
  for (const part of report.parts) {
    children.push(para(part.number ? `${part.number}. ${part.title}` : part.title, { bold: true, size: 22, before: 280, after: 80, keepNext: true }));
    for (const block of part.blocks) children.push(...renderBlock(block));
  }

  const doc = new Document({
    creator: "Afisa Ugani",
    title: `${h.title} — ${h.monthLabel}`,
    styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: PAGE_W, orientation: PageOrientation.LANDSCAPE },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        footers: {
          default: new Footer({
            children: [para(`Imeandaliwa kwa programu ya Afisa Ugani, ${shortDate(Date.now())}. ${h.areaLabel}, ${h.monthLabel}.`, { size: 14, align: AlignmentType.RIGHT, after: 0 })],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}

export function reportFileName(report: Report): string {
  const area = report.header.areaLabel
    .replace(/^(Kijiji cha|Kata ya)\s+/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  if (report.kind === "performance") {
    const period = report.header.monthLabel.match(/Robo ya (\d)/)?.[1];
    const fy = report.header.financialYear.replace("/", "-");
    return `Utekelezaji-${fy}${period ? `-Robo-${period}` : "-Mwaka"}${area ? `-${area}` : ""}.docx`;
  }
  return `Ripoti-ya-mwezi-${report.month}${area ? `-${area}` : ""}.docx`;
}
