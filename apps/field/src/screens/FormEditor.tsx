/**
 * Filling in a report at the end of its period.
 *
 * - Quarterly and annual forms: typed-in tables (report/forms.ts) are edited
 *   row by row; inventory tables start from last year's values until the
 *   officer confirms them.
 * - Every report (monthly too): tables built from records can't be edited,
 *   but the officer can add to a row or add a whole row for work that was not
 *   recorded. Added values are marked ✎ in the report.
 */
import { useState } from "react";
import { Link } from "react-router";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import {
  ANNUAL_PARTS,
  ANNUAL_TABLES,
  EXTRA_PREFIX,
  extraRows,
  fyLabel,
  isExtraRow,
  isSubtotal,
  monthLabel,
  quarterLabel,
  QUARTERLY_PARTS,
  QUARTERLY_TABLES,
  unconfirmedCarry,
  type Additions,
  type Cell,
  type CellAddition,
  type InputCol,
  type InputTable,
  type PeriodReview,
  type Report,
  type RowAddition,
  type RowValues,
  type TableBlock,
  type TableValues,
} from "@afisa/shared";
import { Dialog, formatCell, Select, useT } from "@afisa/ui";
import { useWork } from "../lib/session";
import { useMonthlyReport } from "../lib/report";
import { useSealed } from "../lib/food";
import { saveMonthlyAdditions, savePeriodReview, usePeriodicReport, type PeriodicKind } from "../lib/periodic";
import "../periodic.css";

type Draft = { tables: Record<string, TableValues>; confirmed: string[]; additions: Additions };
type Save = (next: Draft) => Promise<string | null>;

const KINDS = ["mwezi", "robo", "mwaka"] as const;
const newId = () => `${EXTRA_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isNumericCol = (c: InputCol) => c.kind === "count" || c.kind === "decimal";
const parseNum = (s: string, integer: boolean): number | null | "bad" => {
  const v = s.trim().replace(/,/g, "");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) return "bad";
  return n;
};

export function FormEditor() {
  const [kind] = useQueryState("aina", parseAsStringLiteral(KINDS).withDefault("robo"));
  const [period] = useQueryState("kipindi", parseAsString.withDefault(""));
  if (!period) return <main className="page narrow"><p className="muted">—</p></main>;
  return kind === "mwezi" ? <MonthlyAdditions month={period} /> : <PeriodicEditor kind={kind === "robo" ? "quarterly" : "annual"} period={period} />;
}

function useSaveCtx() {
  const { me, councilId, membership } = useWork();
  return { userId: me.userId, councilId, section: membership.primarySection };
}

function MonthlyAdditions({ month }: { month: string }) {
  const t = useT();
  const ctx = useSaveCtx();
  const { base, review } = useMonthlyReport(month);
  const sealed = useSealed("monthly")?.get(month) ?? null;
  const save: Save = (next) => saveMonthlyAdditions(ctx, month, review, next.additions);
  return (
    <Editor
      title={t(`Ongeza taarifa: ${monthLabel(month)}`, `Add information: ${monthLabel(month)}`)}
      lead={t(
        "Kazi uliyofanya lakini hukuirekodi siku hiyo. Ongeza kwenye mstari, au ongeza mstari mpya. Kila kilichoongezwa kinaonekana kwenye ripoti kwa alama ✎.",
        "Work you did but did not record on the day. Add to a row, or add a new row. Everything added shows in the report with the ✎ mark.",
      )}
      backTo={`/ripoti?mwezi=${month}`}
      base={base}
      specs={[]}
      draft={{ tables: {}, confirmed: [], additions: review?.additions ?? {} }}
      previous={null}
      locked={!!sealed}
      onSave={save}
    />
  );
}

function PeriodicEditor({ kind, period }: { kind: PeriodicKind; period: string }) {
  const t = useT();
  const ctx = useSaveCtx();
  const { base, review, previous } = usePeriodicReport(kind, period);
  const sealed = useSealed(kind)?.get(period) ?? null;
  const save: Save = (next) => savePeriodReview(kind, ctx, { period, ...next });
  const name = kind === "quarterly" ? quarterLabel(period) : t(`Mwaka wa fedha ${fyLabel(period)}`, `Financial year ${fyLabel(period)}`);
  return (
    <Editor
      title={kind === "quarterly" ? t(`Jaza ripoti ya robo: ${name}`, `Fill the quarterly report: ${name}`) : t(`Jaza ripoti ya mwaka: ${name}`, `Fill the annual report: ${name}`)}
      lead={t(
        "Jedwali linalotoka kwenye kumbukumbu zako limejazwa tayari. Jaza mengine kwa makadirio ya kijiji/ kata yako; kisichokuwepo kitaandikwa 0.",
        "Tables that come from your records are already filled. Fill the others with estimates for your village/ward; anything absent shows as 0.",
      )}
      backTo={`/ripoti?aina=${kind === "quarterly" ? "robo" : "mwaka"}`}
      base={base}
      specs={kind === "quarterly" ? QUARTERLY_TABLES : ANNUAL_TABLES}
      partsOrder={(kind === "quarterly" ? QUARTERLY_PARTS : ANNUAL_PARTS).map((p) => p.id)}
      draft={{ tables: review?.tables ?? {}, confirmed: review?.confirmed ?? [], additions: review?.additions ?? {} }}
      previous={previous}
      locked={!!sealed}
      onSave={save}
    />
  );
}

function Editor(props: {
  title: string;
  lead: string;
  backTo: string;
  base: Report | undefined;
  specs: readonly InputTable[];
  partsOrder?: string[];
  draft: Draft;
  previous: PeriodReview | null;
  locked: boolean;
  onSave: Save;
}) {
  const t = useT();
  const { base, specs, draft, previous, locked, onSave } = props;
  const [error, setError] = useState<string | null>(null);
  if (!base) return <main className="page narrow"><p className="muted">{t("Inafungua…", "Opening…")}</p></main>;

  const save = async (next: Draft) => {
    const problem = await onSave(next);
    setError(problem ? t(`Haikuhifadhiwa (${problem}).`, `Not saved (${problem}).`) : null);
    return problem === null;
  };
  const pending = unconfirmedCarry(specs, { period: "", tables: draft.tables, confirmed: draft.confirmed }, previous);

  return (
    <main className="page narrow fe">
      <Link to={props.backTo} className="back">{t("Rudi kwenye ripoti", "Back to the report")}</Link>
      <h1 className="page-title">{props.title}</h1>
      <p className="lead">{props.lead}</p>
      {locked && (
        <div className="seal" role="status">
          <strong>{t("Ripoti imeshatumwa", "The report has been sent")}</strong>
          <span>{t("Taarifa zake zimefungwa. Unaweza kuzisoma tu.", "Its information is locked. You can only read it.")}</span>
        </div>
      )}
      {pending.length > 0 && !locked && (
        <div className="notice notice-wait" role="status">
          <p>{t(`Majedwali ${pending.length} yana taarifa za mwaka jana. Yahakiki, kisha bonyeza “Ni sahihi” au badilisha kilichobadilika.`, `${pending.length} tables hold last year's figures. Check them, then press “Correct” or change what changed.`)}</p>
        </div>
      )}
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}

      {base.parts.map((part) => {
        const tables = part.blocks.filter((b): b is TableBlock => b.kind === "table");
        if (!tables.length) return null;
        return (
          <section key={part.id} className="fe-part stack">
            <h2 className="section-title">{part.number}. {part.title}</h2>
            {tables.map((block) => {
              const spec = specs.find((s) => s.id === block.id);
              return spec ? (
                <InputTableCard key={block.id} spec={spec} block={block} draft={draft} previous={previous} locked={locked} save={save} />
              ) : (
                <RecordTableCard key={block.id} block={block} draft={draft} locked={locked} save={save} />
              );
            })}
          </section>
        );
      })}
      <Link to={props.backTo} className="btn btn-primary btn-block">{t("Nimemaliza: rudi kwenye ripoti", "Done: back to the report")}</Link>
    </main>
  );
}

// ---------- shared bits ----------

function rowSummary(block: TableBlock, row: Cell[], from = 1): string {
  const parts: string[] = [];
  for (let i = from; i < row.length && parts.length < 4; i++) {
    const v = row[i];
    if (v === undefined || v === null || v === "" || v === 0) continue;
    parts.push(`${block.columns[i]?.label ?? ""}: ${formatCell(v)}`);
  }
  return parts.join(" · ");
}

function cellAdds(a: Additions, table: string, row: string): CellAddition[] {
  return (a.cells ?? []).filter((c) => c.table === table && c.row.trim().toLowerCase() === row.trim().toLowerCase());
}

function withCellAdds(a: Additions, table: string, row: string, next: CellAddition[]): Additions {
  const others = (a.cells ?? []).filter((c) => !(c.table === table && c.row.trim().toLowerCase() === row.trim().toLowerCase()));
  return { ...a, cells: [...others, ...next] };
}

// ---------- typed-in tables ----------

function InputTableCard({ spec, block, draft, previous, locked, save }: { spec: InputTable; block: TableBlock; draft: Draft; previous: PeriodReview | null; locked: boolean; save: (d: Draft) => Promise<boolean> }) {
  const t = useT();
  const [editing, setEditing] = useState<{ key: string; label: string } | null>(null);
  const mine = draft.tables[spec.id];
  const fromLastYear = spec.carry && !(mine && Object.keys(mine).length) && !!previous?.tables?.[spec.id];
  const values: TableValues = (mine && Object.keys(mine).length ? mine : fromLastYear ? previous!.tables![spec.id]! : {}) ?? {};
  const confirmed = draft.confirmed.includes(spec.id);
  const offset = spec.rows ? 1 : 0;
  const extras = extraRows(values);

  const saveTable = (next: TableValues, extra: Partial<Draft> = {}) =>
    save({ ...draft, ...extra, tables: { ...draft.tables, [spec.id]: next }, confirmed: [...new Set([...draft.confirmed, ...(spec.carry ? [spec.id] : [])])] });

  const confirm = () => saveTable(values);

  // Report rows for the editor: fixed rows (and record-built extra rows), then the officer's rows.
  const items: { key: string; label: string; cells: Cell[]; subtotal?: boolean; editable: boolean }[] = [];
  let r = 0;
  if (spec.rows) {
    for (const row of spec.rows) {
      items.push({ key: row.key, label: row.label, cells: block.rows[r] ?? [], subtotal: isSubtotal(row), editable: !isSubtotal(row) });
      r++;
    }
    while (r < block.rows.length - extras.length - (spec.totalLabel ? 1 : 0)) {
      const cells = block.rows[r]!;
      items.push({ key: `auto${r}`, label: String(cells[0] ?? ""), cells, editable: false });
      r++;
    }
  }
  extras.forEach(([key, row], i) => {
    const cells = block.rows[r + i] ?? [];
    items.push({ key, label: String(row._label ?? (spec.rows ? "" : (cells[0] ?? ""))), cells, editable: true });
  });

  return (
    <article className="fe-table">
      {block.title && <h3 className="fe-title">{block.title}</h3>}
      {spec.hint && <p className="muted small">{spec.hint}</p>}
      {fromLastYear && !locked && (
        <div className="fe-carry">
          <span>{t("Taarifa za mwaka jana", "Last year's figures")}</span>
          <button className="btn btn-small" onClick={() => void confirm()}>{t("Ni sahihi", "Correct")}</button>
        </div>
      )}
      {spec.carry && confirmed && !fromLastYear && <p className="fe-ok small">{t("Imehakikiwa kwa mwaka huu.", "Checked for this year.")}</p>}
      <ul className="fe-rows">
        {items.map((it) => {
          const summary = rowSummary(block, it.cells, offset);
          return (
            <li key={it.key}>
              <button
                className={`fe-row${it.subtotal ? " is-total" : ""}`}
                disabled={locked || it.subtotal || (!it.editable && !spec.cols.some((c) => c.auto))}
                onClick={() => setEditing({ key: it.key, label: it.label || String(it.cells[0] ?? "") })}
              >
                <span className="fe-row-label">{(spec.rows ? it.label : String(it.cells[0] ?? "")) || t("Mstari", "Row")}</span>
                <span className={`fe-row-sum${summary ? "" : " is-empty"}`}>{summary || t("Haijajazwa", "Not filled")}</span>
              </button>
            </li>
          );
        })}
        {!spec.rows && extras.length === 0 && <li className="muted small">{t("Hakuna mstari bado.", "No rows yet.")}</li>}
      </ul>
      {!locked && (spec.extraRows ?? 0) > extras.length && (
        <button className="btn btn-quiet btn-small" onClick={() => setEditing({ key: newId(), label: "" })}>
          + {spec.extraLabel ? t(`Ongeza: ${spec.extraLabel}`, `Add: ${spec.extraLabel}`) : t("Ongeza mstari", "Add a row")}
        </button>
      )}
      {editing && (
        <RowDialog
          spec={spec}
          rowKey={editing.key}
          label={editing.label}
          values={values[editing.key] ?? {}}
          cells={items.find((i) => i.key === editing.key)?.cells ?? []}
          offset={offset}
          adds={cellAdds(draft.additions, spec.id, editing.label)}
          onClose={() => setEditing(null)}
          onDelete={isExtraRow(editing.key) && values[editing.key] ? async () => {
            const next = { ...values };
            delete next[editing.key];
            if (await saveTable(next)) setEditing(null);
          } : undefined}
          onSave={async (row, adds) => {
            let next: TableValues = { ...values };
            if (spec.single && Object.values(spec.cols).some((c) => c.kind === "check" && row[c.key])) {
              next = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([ck]) => spec.cols.find((c) => c.key === ck)?.kind !== "check"))]));
            }
            // Rows built from records hold no typed values: only their additions are saved.
            if (spec.rows?.some((x) => x.key === editing.key) || isExtraRow(editing.key)) next[editing.key] = row;
            const additions = adds ? withCellAdds(draft.additions, spec.id, editing.label, adds) : draft.additions;
            if (await saveTable(next, { additions })) setEditing(null);
          }}
        />
      )}
    </article>
  );
}

function RowDialog({
  spec,
  rowKey,
  label,
  values,
  cells,
  offset,
  adds,
  onClose,
  onSave,
  onDelete,
}: {
  spec: InputTable;
  rowKey: string;
  label: string;
  values: RowValues;
  cells: Cell[];
  offset: number;
  adds: CellAddition[];
  onClose: () => void;
  onSave: (row: RowValues, adds: CellAddition[] | null) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const t = useT();
  const extra = isExtraRow(rowKey);
  const typedRow = spec.rows?.some((r) => r.key === rowKey) || extra;
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === undefined ? "" : String(v)])),
  );
  const [addForm, setAddForm] = useState<Record<number, string>>(() => Object.fromEntries(adds.map((a) => [a.col, String(a.value)])));
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const row: RowValues = {};
    if (extra && spec.rows) {
      if (!form._label?.trim()) return setBad(t("Andika jina.", "Write the name."));
      row._label = form._label.trim();
    }
    for (const c of spec.cols) {
      if (c.auto || c.compute) continue;
      const raw = form[c.key] ?? "";
      if (isNumericCol(c)) {
        const n = parseNum(raw, c.kind === "count");
        if (n === "bad") return setBad(t(`${c.label}: andika namba sahihi${c.kind === "count" ? " (bila desimali)" : ""}.`, `${c.label}: enter a valid number${c.kind === "count" ? " (no decimals)" : ""}.`));
        if (n !== null) row[c.key] = n;
      } else if (c.kind === "check") {
        if (raw === "1") row[c.key] = 1;
      } else if (raw.trim()) row[c.key] = raw.trim();
    }
    let nextAdds: CellAddition[] | null = null;
    if (spec.cols.some((c) => c.auto)) {
      nextAdds = [];
      for (const [i, c] of spec.cols.entries()) {
        if (!c.auto) continue;
        const n = parseNum(addForm[i + offset] ?? "", false);
        if (n === "bad") return setBad(t(`${c.label}: andika namba sahihi.`, `${c.label}: enter a valid number.`));
        if (n) nextAdds.push({ table: spec.id, row: label, col: i + offset, value: n });
      }
    }
    setBusy(true);
    await onSave(row, nextAdds);
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={extra && !values._label ? (spec.extraLabel ?? t("Mstari mpya", "New row")) : label || t("Mstari", "Row")}
      busy={busy}
      actions={
        <>
          {onDelete && <button className="btn btn-quiet is-danger-text" onClick={() => void onDelete()}>{t("Futa mstari", "Delete row")}</button>}
          <button className="btn btn-quiet" onClick={onClose}>{t("Ghairi", "Cancel")}</button>
          <button className="btn btn-primary" onClick={() => void submit()}>{t("Hifadhi", "Save")}</button>
        </>
      }
    >
      <div className="stack fe-form">
        {extra && spec.rows && (
          <label className="field">
            <span>{spec.extraLabel ?? t("Jina", "Name")}</span>
            <input className="input" value={form._label ?? ""} onChange={(e) => set("_label", e.target.value)} />
          </label>
        )}
        {spec.cols.map((c, i) => {
          const shown = cells[i + offset];
          if (c.compute) {
            return <p key={c.key} className="computed">{c.label}: <strong>{formatCell(shown ?? 0)}</strong> {t("(inahesabiwa yenyewe)", "(worked out for you)")}</p>;
          }
          if (c.auto) {
            return (
              <div key={c.key} className="fe-auto">
                <p>{c.label}: <strong>{formatCell(shown ?? 0)}</strong> <span className="muted small">{t("kutoka kumbukumbu zako", "from your records")}</span></p>
                <label className="field">
                  <span className="small">{t("Ongeza ambazo hazikurekodiwa", "Add what was not recorded")}</span>
                  <input className="input" inputMode="decimal" value={addForm[i + offset] ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, [i + offset]: e.target.value }))} />
                </label>
              </div>
            );
          }
          if (!typedRow) return null;
          const head = <span>{c.label}{c.marker ? <span className="muted"> {c.marker}</span> : null}</span>;
          if (c.kind === "check") {
            return (
              <label key={c.key} className="check-row">
                <input type="checkbox" checked={form[c.key] === "1"} onChange={(e) => set(c.key, e.target.checked ? "1" : "")} />
                {head}
              </label>
            );
          }
          if (c.kind === "choice") {
            return (
              <div key={c.key} className="field">
                {head}
                <Select value={form[c.key] ?? ""} onChange={(v) => set(c.key, v)} options={(c.options ?? []).map((o) => ({ value: o.value, label: o.label }))} label={c.label} />
              </div>
            );
          }
          return (
            <label key={c.key} className="field">
              {head}
              <input
                className="input"
                inputMode={isNumericCol(c) ? (c.kind === "count" ? "numeric" : "decimal") : "text"}
                value={form[c.key] ?? ""}
                onChange={(e) => set(c.key, e.target.value)}
              />
            </label>
          );
        })}
        {bad && <p className="field-error" role="alert">{bad}</p>}
      </div>
    </Dialog>
  );
}

// ---------- tables built from records ----------

function RecordTableCard({ block, draft, locked, save }: { block: TableBlock; draft: Draft; locked: boolean; save: (d: Draft) => Promise<boolean> }) {
  const t = useT();
  const [adding, setAdding] = useState<{ row: number } | { newRow: RowAddition | null } | null>(null);
  const totals = new Set(block.totalRows ?? []);
  const added = (draft.additions.rows ?? []).filter((r) => r.table === block.id);
  const numericCol = (i: number) => block.columns[i]?.align === "end" || block.rows.some((r, ri) => !totals.has(ri) && typeof r[i] === "number");

  return (
    <article className="fe-table">
      {block.title && <h3 className="fe-title">{block.title}</h3>}
      <p className="muted small">{t("Imejazwa kutoka kumbukumbu zako.", "Filled from your records.")}</p>
      <ul className="fe-rows">
        {block.rows.map((row, i) => {
          if (totals.has(i)) return null;
          const label = String(row[0] ?? "");
          const n = cellAdds(draft.additions, block.id, label).length;
          const summary = rowSummary(block, row);
          return (
            <li key={i}>
              <button className="fe-row" disabled={locked || !label} onClick={() => setAdding({ row: i })}>
                <span className="fe-row-label">{label || "—"}</span>
                <span className={`fe-row-sum${summary ? "" : " is-empty"}`}>{summary || t("Hakuna", "None")}</span>
                {n > 0 && <span className="fe-badge">✎ {n}</span>}
              </button>
            </li>
          );
        })}
        {added.map((r) => (
          <li key={r.id}>
            <button className="fe-row is-added" disabled={locked} onClick={() => setAdding({ newRow: r })}>
              <span className="fe-row-label">✎ {String(r.cells[0] ?? "") || t("Mstari ulioongeza", "Row you added")}</span>
              <span className="fe-row-sum">{r.cells.slice(1).filter((c) => c !== null && c !== "").map((c) => formatCell(c)).join(" · ")}</span>
            </button>
          </li>
        ))}
      </ul>
      {!locked && (
        <button className="btn btn-quiet btn-small" onClick={() => setAdding({ newRow: null })}>+ {t("Ongeza mstari ambao haukurekodiwa", "Add a row that was not recorded")}</button>
      )}
      {adding && "row" in adding && (
        <AddToRowDialog
          block={block}
          row={adding.row}
          numericCol={numericCol}
          adds={cellAdds(draft.additions, block.id, String(block.rows[adding.row]![0] ?? ""))}
          onClose={() => setAdding(null)}
          onSave={async (adds) => {
            if (await save({ ...draft, additions: withCellAdds(draft.additions, block.id, String(block.rows[adding.row]![0] ?? ""), adds) })) setAdding(null);
          }}
        />
      )}
      {adding && "newRow" in adding && (
        <NewRowDialog
          block={block}
          existing={adding.newRow}
          numericCol={numericCol}
          onClose={() => setAdding(null)}
          onDelete={adding.newRow ? async () => {
            if (await save({ ...draft, additions: { ...draft.additions, rows: (draft.additions.rows ?? []).filter((r) => r.id !== adding.newRow!.id) } })) setAdding(null);
          } : undefined}
          onSave={async (row) => {
            const rows = (draft.additions.rows ?? []).filter((r) => r.id !== row.id);
            if (await save({ ...draft, additions: { ...draft.additions, rows: [...rows, row] } })) setAdding(null);
          }}
        />
      )}
    </article>
  );
}

function AddToRowDialog({ block, row, numericCol, adds, onClose, onSave }: { block: TableBlock; row: number; numericCol: (i: number) => boolean; adds: CellAddition[]; onClose: () => void; onSave: (adds: CellAddition[]) => Promise<void> }) {
  const t = useT();
  const cells = block.rows[row]!;
  const label = String(cells[0] ?? "");
  const [form, setForm] = useState<Record<number, string>>(() => Object.fromEntries(adds.map((a) => [a.col, String(a.value)])));
  const [bad, setBad] = useState<string | null>(null);
  const submit = async () => {
    const next: CellAddition[] = [];
    for (let i = 1; i < block.columns.length; i++) {
      const raw = (form[i] ?? "").trim();
      if (!raw) continue;
      if (numericCol(i)) {
        const n = parseNum(raw, false);
        if (n === "bad") return setBad(t(`${block.columns[i]!.label}: andika namba sahihi.`, `${block.columns[i]!.label}: enter a valid number.`));
        if (n) next.push({ table: block.id, row: label, col: i, value: n });
      } else next.push({ table: block.id, row: label, col: i, value: raw });
    }
    await onSave(next);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t(`Ongeza: ${label}`, `Add: ${label}`)}
      actions={
        <>
          <button className="btn btn-quiet" onClick={onClose}>{t("Ghairi", "Cancel")}</button>
          <button className="btn btn-primary" onClick={() => void submit()}>{t("Hifadhi", "Save")}</button>
        </>
      }
    >
      <div className="stack fe-form">
        <p className="muted small">{t("Andika kiasi cha kuongeza tu, si jumla mpya. Thamani za kumbukumbu hazibadilishwi.", "Write only the amount to add, not a new total. Recorded values are not changed.")}</p>
        {block.columns.slice(1).map((c, j) => {
          const i = j + 1;
          return (
            <label key={i} className="field">
              <span>
                {c.label}
                <span className="muted"> · {t("sasa", "now")} {formatCell(cells[i] ?? "") || "—"}</span>
              </span>
              <input className="input" inputMode={numericCol(i) ? "decimal" : "text"} placeholder={numericCol(i) ? "+0" : t("maelezo ya ziada", "extra notes")} value={form[i] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [i]: e.target.value }))} />
            </label>
          );
        })}
        {bad && <p className="field-error" role="alert">{bad}</p>}
      </div>
    </Dialog>
  );
}

function NewRowDialog({ block, existing, numericCol, onClose, onSave, onDelete }: { block: TableBlock; existing: RowAddition | null; numericCol: (i: number) => boolean; onClose: () => void; onSave: (r: RowAddition) => Promise<void>; onDelete?: () => Promise<void> }) {
  const t = useT();
  const [form, setForm] = useState<Record<number, string>>(() => Object.fromEntries((existing?.cells ?? []).map((c, i) => [i, c === null ? "" : String(c)])));
  const [bad, setBad] = useState<string | null>(null);
  const submit = async () => {
    const cells: (number | string | null)[] = [];
    for (let i = 0; i < block.columns.length; i++) {
      const raw = (form[i] ?? "").trim();
      if (!raw) { cells.push(null); continue; }
      if (i > 0 && numericCol(i)) {
        const n = parseNum(raw, false);
        if (n === "bad") return setBad(t(`${block.columns[i]!.label}: andika namba sahihi.`, `${block.columns[i]!.label}: enter a valid number.`));
        cells.push(n);
      } else cells.push(raw);
    }
    if (!cells[0]) return setBad(t(`Jaza “${block.columns[0]?.label || t("jina", "name")}”.`, `Fill in “${block.columns[0]?.label || "name"}”.`));
    await onSave({ table: block.id, id: existing?.id ?? newId(), cells });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={existing ? t("Badili mstari ulioongeza", "Change the row you added") : t("Mstari mpya", "New row")}
      actions={
        <>
          {onDelete && <button className="btn btn-quiet is-danger-text" onClick={() => void onDelete()}>{t("Futa", "Delete")}</button>}
          <button className="btn btn-quiet" onClick={onClose}>{t("Ghairi", "Cancel")}</button>
          <button className="btn btn-primary" onClick={() => void submit()}>{t("Hifadhi", "Save")}</button>
        </>
      }
    >
      <div className="stack fe-form">
        {block.columns.map((c, i) => (
          <label key={i} className="field">
            <span>{c.label || t("Jina", "Name")}{c.marker ? <span className="muted"> {c.marker}</span> : null}</span>
            <input className="input" inputMode={i > 0 && numericCol(i) ? "decimal" : "text"} value={form[i] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [i]: e.target.value }))} />
          </label>
        ))}
        {bad && <p className="field-error" role="alert">{bad}</p>}
      </div>
    </Dialog>
  );
}
