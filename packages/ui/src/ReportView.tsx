import type { Block, Cell, Report, TableBlock } from "@afisa/shared";

export function formatCell(c: Cell): string {
  if (c === null || c === "") return "";
  if (typeof c === "number") return c.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return c;
}

function TableView({ block }: { block: TableBlock }) {
  return (
    <div className="rv-table-wrap" role="region" aria-label={block.title ?? block.id} tabIndex={0}>
      <table className="rv-table">
        <thead>
          {block.groups && block.groups.some((g) => g.label) && (
            <tr>
              {block.groups.map((g, i) => (
                <th key={i} colSpan={g.span} className={g.label ? "rv-group" : "rv-group-empty"}>{g.label}</th>
              ))}
            </tr>
          )}
          <tr>
            {block.columns.map((c, i) => (
              <th key={i} scope="col">
                {c.label}
                {c.marker && <span className="rv-marker"> {c.marker}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} className={block.totalRows?.includes(r) ? "rv-total" : undefined}>
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
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  return (
    <div className="rv-block">
      {block.title && <h3 className="rv-block-title">{block.title}</h3>}
      {block.kind === "table" ? (
        <TableView block={block} />
      ) : block.text ? (
        <p className={`rv-text ${block.source === "records" ? "is-draft" : ""}`}>{block.text}</p>
      ) : (
        <p className="rv-text is-empty">Haijajazwa.</p>
      )}
      {block.kind === "text" && block.source === "records" && (
        <p className="rv-hint">Imetungwa kutoka kumbukumbu zako. Unaweza kuibadili kwenye majibu ya mwisho wa mwezi.</p>
      )}
      {block.note && <p className="rv-note">{block.note}</p>}
    </div>
  );
}

export function ReportView({ report }: { report: Report }) {
  return (
    <div className="rv">
      {report.parts.map((part) => {
        const filled = part.blocks.some((b) => b.hasData);
        return (
          <details key={part.id} className="rv-part" open={filled}>
            <summary>
              <span className="rv-part-title">{part.number ? `${part.number}. ` : ""}{part.title}</span>
              <span className={filled ? "rv-state tone-ok" : "rv-state"}>{filled ? "Ina taarifa" : "Hakuna taarifa"}</span>
            </summary>
            {part.blocks.map((b) => <BlockView key={b.id} block={b} />)}
          </details>
        );
      })}
    </div>
  );
}
