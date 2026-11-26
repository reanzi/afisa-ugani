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
  catalogText,
  SECTION_LABELS,
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
import { errorMessage, ReportView, useLabel, useT, type T, Glide } from "@afisa/ui";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { useAreaLabel } from "../lib/report";
import { approvedFrom, useCouncilDefaults, usePresetRows } from "../lib/presets";
import { PresetAsk } from "./PresetAsk";

const PERIODS = ["1", "2", "3", "4", "mwaka"] as const;

type Bar = { key: string; label: string; detail: string; pct: number | null };

/** The tables read well on paper; on the phone, one bar per crop or target first. */
function progressBars(report: { parts: { blocks: unknown[] }[] }, t: T): Bar[] {
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
          const crop = catalogText(String(name));
          out.push({ key: `a:${name}`, label: `${crop}: ${t("eneo", "area")}`, detail: t(`ha ${f(num(planted) ?? 0)} kati ya ${f(num(area)!)}`, `${f(num(planted) ?? 0)} of ${f(num(area)!)} ha`), pct: num(r[5]) });
          if (num(target) && num(prod) !== null) out.push({ key: `p:${name}`, label: `${crop}: ${t("mavuno", "harvest")}`, detail: t(`tani ${f(num(prod)!)} kati ya ${f(num(target)!)}`, `${f(num(prod)!)} of ${f(num(target)!)} t`), pct: num(r[8]) });
        }
      } else if (b.id.endsWith("-m")) {
        const yearView = b.columns.length === 5;
        for (const r of b.rows) {
          const target = num(r[2]);
          if (!target) continue;
          const done = num(yearView ? r[3] : r[5]) ?? 0;
          out.push({ key: `m:${String(r[0])}`, label: catalogText(String(r[0])), detail: `${f(done)} ${t("kati ya", "of")} ${f(target)} ${catalogText(String(r[1]))}`, pct: num(r[r.length - 1]) });
        }
      }
    }
  }
  return out;
}

export function Performance() {
  const { me, councilId, sections } = useWork();
  const t = useT();
  const label = useLabel();
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
        <button className="btn btn-quiet btn-small" onClick={() => void setFy(`${Number(fy.slice(0, 4)) - 1}/${fy.slice(2, 4)}`)} aria-label={t("Mwaka uliopita", "Previous year")}>‹</button>
        <div className="food-title">
          <h2 className="page-title">{t(`Utekelezaji ${fy}`, `Progress ${fy}`)}</h2>
          <p className="muted">{t("Mpango dhidi ya matokeo, kwa vikao (si fomu ya ARDS)", "Plan against results, for meetings (not an ARDS form)")}</p>
        </div>
        <button
          className="btn btn-quiet btn-small"
          onClick={() => void setFy(`${Number(fy.slice(0, 4)) + 1}/${String((Number(fy.slice(0, 4)) + 2) % 100).padStart(2, "0")}`)}
          disabled={fy >= currentFy}
          aria-label={t("Mwaka unaofuata", "Next year")}
        >
          ›
        </button>
      </header>

      <div className="period-pick" role="tablist" aria-label={t("Kipindi", "Period")}>
        {PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={periodKey === p} onClick={() => void setPeriod(p)}>
            {p === "mwaka" ? t("Mwaka", "Year") : t(`Robo ${p}`, `Q${p}`)}
          </button>
        ))}
        <Glide />
      </div>

      {noPlan.length > 0 && (
        <div className="plan-banner">
          <p>
            <strong>
              {(() => {
                const which = noPlan.length < sections.length ? ` (${noPlan.map((s) => label(SECTION_LABELS[s])).join(", ")})` : "";
                return t(`Mpango wa ${fy}${which} haujaidhinishwa.`, `The ${fy} plan${which} is not approved.`);
              })()}
            </strong>{" "}
            {t("Malengo yatabaki wazi hadi uweke mpango na mkuu wa sehemu auidhinishe.", "Targets stay blank until you set a plan and the section head approves it.")}
          </p>
          <Link to={`/malengo?mwaka=${fy}`} className="btn btn-primary">{t("Weka mpango", "Set the plan")}</Link>
        </div>
      )}
      {noPlan.length === 0 && (
        <Link to={`/malengo?mwaka=${fy}`} className="link plan-link">{t(`Angalia au badili mpango wa ${fy}`, `View or change the ${fy} plan`)}</Link>
      )}

      {needed.length > 0 && (
        <section className="stack" aria-labelledby="needed">
          <h3 id="needed" className="section-title">{t("Viwango vinavyohitajika", "Figures needed")}</h3>
          {needed.map((m) => (
            <PresetAsk key={m.key} councilId={councilId} presetKey={m.key} row={byKey.get(m.key)} reason={m.reason} />
          ))}
        </section>
      )}

      {future ? (
        <p className="empty">{t("Robo hii bado haijaanza.", "This quarter has not started yet.")}</p>
      ) : (
        built && (
          <>
            <div className="export-row">
              <button className="btn btn-primary" disabled={busy} onClick={() => void download()}>{busy ? t("Inaandaa…", "Preparing…") : t("Pakua Word (.docx)", "Download Word (.docx)")}</button>
              <button className="btn btn-quiet" onClick={() => void copySummary()}>{copied ? t("Imenakiliwa", "Copied") : t("Nakili muhtasari", "Copy summary")}</button>
            </div>
            {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
            {(() => {
              const bars = progressBars(built.report, t);
              if (bars.length === 0) return null;
              return (
                <ul className="progress-list" aria-label={t("Utekelezaji kwa ufupi", "Progress at a glance")}>
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
