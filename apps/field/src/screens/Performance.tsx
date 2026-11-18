/**
 * Plan against results, for a quarter or the whole financial year: for ward
 * and village development council meetings. Download as Word or copy the
 * summary. Presets a calculation needs are asked for right here.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useLiveQuery } from "dexie-react-hooks";
import {
  buildPerformance,
  financialYear,
  fyQuarter,
  monthKey,
  monthRange,
  periodMonths,
  shiftMonth,
  type PerfPeriod,
  type TableBlock,
  type TextBlock,
} from "@afisa/shared";
import { errorMessage, ReportView } from "@afisa/ui";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { useAreaLabel } from "../lib/report";
import { approvedFrom, useCouncilDefaults, usePresetRows } from "../lib/presets";
import { PresetAsk } from "./PresetAsk";

const PERIODS = ["1", "2", "3", "4", "mwaka"] as const;

type Bar = { key: string; label: string; detail: string; pct: number | null };

/** The tables read well on paper; on the phone, one bar per crop or target first. */
function progressBars(report: { parts: { blocks: unknown[] }[] }): Bar[] {
  const out: Bar[] = [];
  const num = (c: unknown) => (typeof c === "number" ? c : null);
  const f = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  for (const part of report.parts) {
    for (const raw of part.blocks) {
      const b = raw as TableBlock;
      if (b.kind !== "table") continue;
      if (b.id === "k1") {
        for (const r of b.rows) {
          const [name, area, , target, planted, , , prod] = r;
          if (name === "Jumla" || !num(area)) continue;
          out.push({ key: `a:${name}`, label: `${name}: eneo`, detail: `ha ${f(num(planted) ?? 0)} kati ya ${f(num(area)!)}`, pct: num(r[5]) });
          if (num(target) && num(prod) !== null) out.push({ key: `p:${name}`, label: `${name}: mavuno`, detail: `tani ${f(num(prod)!)} kati ya ${f(num(target)!)}`, pct: num(r[8]) });
        }
      } else if (b.id.endsWith("-m")) {
        const yearView = b.columns.length === 5;
        for (const r of b.rows) {
          const target = num(r[2]);
          if (!target) continue;
          const done = num(yearView ? r[3] : r[5]) ?? 0;
          out.push({ key: `m:${String(r[0])}`, label: String(r[0]), detail: `${f(done)} kati ya ${f(target)} ${String(r[1])}`, pct: num(r[r.length - 1]) });
        }
      }
    }
  }
  return out;
}

export function Performance() {
  const { me, councilId, sections } = useWork();
  const areaLabel = useAreaLabel();
  const thisMonth = monthKey(new Date());
  const currentFy = financialYear(thisMonth);
  const [fyParam, setFy] = useQueryState("mwaka", parseAsString);
  const fy = fyParam && /^\d{4}\/\d{2}$/.test(fyParam) && fyParam <= currentFy ? fyParam : currentFy;
  const [periodParam, setPeriod] = useQueryState("kipindi", parseAsString);
  const defaultPeriod = fy === currentFy ? String(fyQuarter(thisMonth)) : "mwaka";
  const periodKey = (PERIODS as readonly string[]).includes(periodParam ?? "") ? periodParam! : defaultPeriod;
  const period: PerfPeriod = { fy, quarter: periodKey === "mwaka" ? null : (Number(periodKey) as 1 | 2 | 3 | 4) };

  const months = periodMonths({ fy, quarter: null });
  const start = monthRange(months[0]!).start;
  // Reviews of June are often written in early July: look a little past the year.
  const end = monthRange(shiftMonth(months[11]!, 2)).end;
  const records = useLiveQuery(
    () => db.records.where("[councilId+occurredAt]").between([councilId, start], [councilId, end], true, false).toArray(),
    [councilId, start, end],
  );
  const rows = usePresetRows(councilId);
  const defaults = useCouncilDefaults(councilId);
  const approved = useMemo(() => (rows && defaults ? approvedFrom(rows, defaults) : undefined), [rows, defaults]);
  const byKey = useMemo(() => new Map((rows ?? []).map((r) => [r.key, r])), [rows]);

  const built = useMemo(() => {
    if (!records || !approved) return undefined;
    return buildPerformance({
      period,
      asOf: thisMonth,
      records,
      sections,
      plans: approved.plans[fy] ?? {},
      presets: approved.values,
      areaLabel,
      officerName: me.name ?? "",
      phone: me.phone,
    });
    // period is rebuilt each render from fy and periodKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, approved, fy, periodKey, thisMonth, sections, areaLabel, me.name, me.phone]);

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planRows = sections.map((s) => byKey.get(`mpango:${fy}:${s}`));
  const noPlan = sections.filter((_, i) => !planRows[i]?.approvedValue);
  const future = period.quarter !== null && periodMonths(period)[0]! > thisMonth;

  const download = async () => {
    if (!built) return;
    setBusy(true);
    setError(null);
    try {
      const { reportToDocx, reportFileName } = await import("@afisa/ui/docx");
      const blob = await reportToDocx(built.report);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFileName(built.report);
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copySummary = async () => {
    if (!built) return;
    const text = (built.report.parts[0]?.blocks[0] as TextBlock | undefined)?.text ?? "";
    try {
      await navigator.clipboard.writeText(`${built.report.header.title}\n${built.report.header.areaLabel}, ${built.report.header.monthLabel}\n\n${text}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const needed = built?.missing.filter((m) => !m.optional) ?? [];

  return (
    <div className="performance stack">
      <header className="month-head">
        <button className="btn btn-quiet btn-small" onClick={() => void setFy(`${Number(fy.slice(0, 4)) - 1}/${fy.slice(2, 4)}`)} aria-label="Mwaka uliopita">‹</button>
        <div className="food-title">
          <h2 className="page-title">Utekelezaji {fy}</h2>
          <p className="muted">Mpango dhidi ya matokeo, kwa vikao (si fomu ya ARDS)</p>
        </div>
        <button
          className="btn btn-quiet btn-small"
          onClick={() => void setFy(`${Number(fy.slice(0, 4)) + 1}/${String((Number(fy.slice(0, 4)) + 2) % 100).padStart(2, "0")}`)}
          disabled={fy >= currentFy}
          aria-label="Mwaka unaofuata"
        >
          ›
        </button>
      </header>

      <div className="period-pick" role="tablist" aria-label="Kipindi">
        {PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={periodKey === p} onClick={() => void setPeriod(p)}>
            {p === "mwaka" ? "Mwaka" : `Robo ${p}`}
          </button>
        ))}
      </div>

      {noPlan.length > 0 && (
        <div className="plan-banner">
          <p>
            <strong>Mpango wa {fy} {noPlan.length < sections.length ? `(${noPlan.join(", ")}) ` : ""}haujaidhinishwa.</strong> Malengo yatabaki wazi hadi uweke mpango na mkuu wa sehemu auidhinishe.
          </p>
          <Link to={`/malengo?mwaka=${fy}`} className="btn btn-primary">Weka mpango</Link>
        </div>
      )}
      {noPlan.length === 0 && (
        <Link to={`/malengo?mwaka=${fy}`} className="link plan-link">Angalia au badili mpango wa {fy}</Link>
      )}

      {needed.length > 0 && (
        <section className="stack" aria-labelledby="needed">
          <h3 id="needed" className="section-title">Viwango vinavyohitajika</h3>
          {needed.map((m) => (
            <PresetAsk key={m.key} councilId={councilId} presetKey={m.key} row={byKey.get(m.key)} reason={m.reason} />
          ))}
        </section>
      )}

      {future ? (
        <p className="empty">Robo hii bado haijaanza.</p>
      ) : (
        built && (
          <>
            <div className="export-row">
              <button className="btn btn-primary" disabled={busy} onClick={() => void download()}>{busy ? "Inaandaa…" : "Pakua Word (.docx)"}</button>
              <button className="btn btn-quiet" onClick={() => void copySummary()}>{copied ? "Imenakiliwa" : "Nakili muhtasari"}</button>
            </div>
            {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
            {(() => {
              const bars = progressBars(built.report);
              if (bars.length === 0) return null;
              return (
                <ul className="progress-list" aria-label="Utekelezaji kwa ufupi">
                  {bars.map((b) => (
                    <li key={b.key}>
                      <div className="progress-line">
                        <strong>{b.label}</strong>
                        <span className="progress-pct">{b.pct === null ? "—" : `${b.pct}%`}</span>
                      </div>
                      <div className="progress-track" aria-hidden>
                        <span className={`progress-fill${(b.pct ?? 0) >= 100 ? " is-done" : (b.pct ?? 0) < 50 ? " is-low" : ""}`} style={{ width: `${Math.min(100, b.pct ?? 0)}%` }} />
                      </div>
                      <span className="progress-detail">{b.detail}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <ReportView report={built.report} />
            {built.missing.filter((m) => m.optional).map((m) => (
              <PresetAsk key={m.key} councilId={councilId} presetKey={m.key} row={byKey.get(m.key)} reason={m.reason} />
            ))}
          </>
        )
      )}
    </div>
  );
}
