/**
 * A report laid out as paper: the form's header on the first sheet, then one
 * sheet per part, then the photos that came with the report.
 */
import type { Block, Report, TableBlock } from "@afisa/shared";
import { formatCell, useT, monthDay } from "@afisa/ui";

export type ReaderPhoto = {
  clientId: string;
  url: string;
  width: number;
  height: number;
  shot: string;
  caption: string | null;
  takenAt: number;
  record: {
    type: string;
    occurredAt: number;
    summary: string;
    labels: { category?: string; subject?: string; suspected?: string; severity?: string; stage?: string; observation?: string };
  };
};

const SHOTS: Record<string, [string, string]> = { nzima: ["Mzima", "Whole"], karibu: ["Karibu", "Close-up"], nyingine: ["Nyingine", "Other"] };

function SheetTable({ block }: { block: TableBlock }) {
  return (
    <table className="sheet-table">
      <thead>
        {block.groups && block.groups.some((g) => g.label) && (
          <tr>
            {block.groups.map((g, i) => (
              <th key={i} colSpan={g.span}>{g.label}</th>
            ))}
          </tr>
        )}
        <tr>
          {block.columns.map((c, i) => (
            <th key={i} scope="col">
              {c.label}
              {c.marker && <span className="sheet-marker"> {c.marker}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, r) => (
          <tr key={r} className={block.totalRows?.includes(r) ? "is-total" : undefined}>
            {row.map((cell, i) =>
              i === 0 ? (
                <th key={i} scope="row">{formatCell(cell)}</th>
              ) : (
                <td key={i} className={typeof cell === "number" ? "num" : undefined}>{formatCell(cell)}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SheetBlock({ block }: { block: Block }) {
  return (
    <div className="sheet-block">
      {block.title && <h3>{block.title}</h3>}
      {block.kind === "table" ? <SheetTable block={block} /> : <div className="sheet-text">{block.text || " "}</div>}
      {block.note && <p className="sheet-note">Maelezo: {block.note}</p>}
    </div>
  );
}

/** The sheets' titles, for the table of contents. */
export function sheetTitles(report: Report, photoCount: number, t: (sw: string, en: string) => string): string[] {
  return [
    ...report.parts.map((p, i) => (i === 0 ? t("Mwanzo", "Cover") + ": " : "") + (p.number ? `${p.number}. ${p.title}` : p.title)),
    ...(photoCount > 0 ? [t(`Picha (${photoCount})`, `Photos (${photoCount})`)] : []),
  ];
}

export function ReportSheets({ report, photos, onPhoto }: { report: Report; photos: ReaderPhoto[]; onPhoto: (i: number) => void }) {
  const t = useT();
  const h = report.header;
  return (
    <>
      {report.parts.map((part, i) => (
        <article key={part.id} className="sheet report-sheet" data-sheet={i}>
          {i === 0 && (
            <header className="sheet-head">
              <p className="sheet-ministry">{h.ministry}</p>
              <h1>{h.title}</h1>
              {h.edition && <p className="sheet-edition">{h.edition}</p>}
              <dl className="sheet-fields">
                <div><dt>Jina la Kijiji/ Mtaa/ Kata</dt><dd>{h.areaLabel}</dd></div>
                <div><dt>Jina la Afisa Ugani</dt><dd>{h.officerName}</dd></div>
                <div><dt>Namba ya simu</dt><dd>{h.phone}</dd></div>
                <div><dt>{h.periodName ?? "Mwezi"}</dt><dd>{h.monthLabel}</dd></div>
                <div><dt>Mwaka wa Fedha</dt><dd>{h.financialYear}</dd></div>
              </dl>
              {h.submitNote && <p className="sheet-submit">({h.submitNote})</p>}
              {h.instructions.length > 0 && (
                <div className="sheet-angalizo">
                  <strong>ANGALIZO</strong>
                  <ol>{h.instructions.map((x) => <li key={x}>{x}</li>)}</ol>
                </div>
              )}
            </header>
          )}
          <h2 className="sheet-part">{part.number ? `${part.number}. ${part.title}` : part.title}</h2>
          {part.blocks.map((b) => (
            <SheetBlock key={b.id} block={b} />
          ))}
          <footer className="sheet-foot">
            {t("Ukurasa", "Page")} {i + 1} / {report.parts.length + (photos.length ? 1 : 0)}
          </footer>
        </article>
      ))}
      {photos.length > 0 && (
        <article className="sheet report-sheet photo-sheet" data-sheet={report.parts.length}>
          <h2 className="sheet-part">{t("Picha za kipindi hiki", "Photos from this period")}</h2>
          <p className="sheet-note">
            {t(
              "Picha zilizopigwa na afisa shambani, pamoja na kumbukumbu zake. Bofya picha kuiona kubwa.",
              "Photos the officer took in the field, with their records. Click a photo to see it large.",
            )}
          </p>
          <ul className="sheet-photos">
            {photos.map((p, i) => (
              <li key={p.clientId}>
                <button type="button" onClick={() => onPhoto(i)} aria-label={t("Fungua picha", "Open photo")}>
                  <img src={p.url} alt="" loading="lazy" width={p.width} height={p.height} />
                </button>
                <div className="sheet-photo-text">
                  <strong>{[p.record.labels.category, p.record.labels.subject].filter(Boolean).join(": ") || p.record.summary}</strong>
                  {p.record.labels.suspected && <span>{t("Inadhaniwa", "Suspected")}: {p.record.labels.suspected}</span>}
                  <span className="muted">
                    {monthDay(p.takenAt)}, {t(...(SHOTS[p.shot] ?? [p.shot, p.shot]))}
                    {p.caption ? `: ${p.caption}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </article>
      )}
    </>
  );
}
