/**
 * Food availability and prices sent by the wards for one period, and the
 * council-wide list made from them. HQ only ever sees what officers sent.
 */
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { parseAsString, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import {
  availabilityLabel,
  catalogText,
  combineFoodReports,
  currentFoodReport,
  foodCycle,
  foodReportAsReport,
  monthLabel,
  shiftMonth,
  validateFoodReport,
  type FoodReportPayload,
} from "@afisa/shared";
import { Select, shortDate, useLang, useT } from "@afisa/ui";
import { useHq } from "../context";
import { Reader, type ReaderDoc } from "../reader/Reader";
import { MissingReports, ReopenReport, SectionTags, SendTags, when } from "./common";

const tsh = (n: number) => n.toLocaleString("en-US");

export function FoodReports() {
  const t = useT();
  const lang = useLang();
  // Availability and saved Swahili item names follow the language chosen.
  const avail = (v: string | null | undefined) => availabilityLabel(v);
  const { councilId, councilFullName: councilName } = useHq();
  const current = currentFoodReport(Date.now()).period;
  const periods = useQuery(api.submissions.periodsForHq, { councilId, kind: "food_prices" });
  const [chosen, setChosen] = useQueryState("kipindi", parseAsString);
  const period = chosen ?? periods?.[0] ?? current;
  const raw = useQuery(api.submissions.forHq, { councilId, kind: "food_prices", period });
  // Payloads were checked when they arrived; check again so an old or odd one cannot break the page.
  const reports = useMemo(
    () => raw?.filter((r) => validateFoodReport(r.payload) === null).map((r) => ({ ...r, payload: r.payload as FoodReportPayload })),
    [raw],
  );
  const combined = useMemo(() => (reports ? combineFoodReports(reports.map((r) => r.payload)) : []), [reports]);
  const [open, setOpen] = useState<string | null>(null);
  const [reading, setReading] = useState<ReaderDoc | null>(null);
  const [copied, setCopied] = useState(false);
  const cycle = foodCycle(period);
  const label = monthLabel(period, lang);

  const options = useMemo(() => {
    const set = new Set<string>([...(periods ?? []), current, shiftMonth(current, -1)]);
    return [...set].sort().reverse().map((p) => ({ value: p, label: monthLabel(p, lang) }));
  }, [periods, current, lang]);

  const copyTable = async () => {
    const head = [
      t("Bidhaa", "Item"), t("Kipimo", "Unit"), t("Wastani (Tsh)", "Average (Tsh)"), t("Chini", "Low"), t("Juu", "High"),
      t("Kata", "Wards"), t("Bei zilizoandikwa", "Prices recorded"), t("Upatikanaji", "Availability"),
    ].join("\t");
    const body = combined.map((r) => [catalogText(r.commodity), catalogText(r.unit), r.average, r.min, r.max, r.wards, r.prices, avail(r.availability)].join("\t"));
    try {
      await navigator.clipboard.writeText([head, ...body].join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section className="hq-page food-reports">
      <header className="hq-page-head">
        <h1>{t("Upatikanaji wa chakula na bei", "Food availability and prices")}</h1>
        <p className="muted">
          {t(
            `Ripoti zilizotumwa na maafisa, bei za ${shortDate(cycle.start)} hadi ${shortDate(cycle.end - 1)}. Kumbukumbu za maafisa zenyewe hazionekani hapa; ni zile walizoamua kutuma tu.`,
            `Reports sent by officers, prices from ${shortDate(cycle.start)} to ${shortDate(cycle.end - 1)}. Officers' own records are not shown here; only what they chose to send.`,
          )}
        </p>
        <div className="filters no-print">
          <div className="field inline">
            <span id="f-kipindi">{t("Kipindi", "Period")}</span>
            <Select size="sm" labelledBy="f-kipindi" label={t("Kipindi", "Period")} value={period} onChange={(v) => void setChosen(v)} options={options} />
          </div>
          <button className="btn btn-quiet btn-small" onClick={() => window.print()} disabled={!reports?.length}>{t("Chapisha", "Print")}</button>
          <button className="btn btn-quiet btn-small" onClick={() => void copyTable()} disabled={!combined.length}>
            {copied ? t("Imenakiliwa", "Copied") : t("Nakili jedwali (Excel)", "Copy table (Excel)")}
          </button>
        </div>
      </header>

      <div className="print-only print-head">
        <strong>{councilName}</strong>
        <span>
          {t("Upatikanaji wa chakula na bei", "Food availability and prices")}: {label} ({shortDate(cycle.start)} – {shortDate(cycle.end - 1)})
        </span>
      </div>

      {reports === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {reports?.length === 0 && (
        <p className="empty">{t("Hakuna ripoti iliyotumwa kwa kipindi hiki bado. Maafisa hutuma kufikia tarehe 22.", "No reports sent for this period yet. Officers send by the 22nd.")}</p>
      )}

      {reports && reports.length > 0 && (
        <>
          <h2 className="food-h2">{t(`Halmashauri nzima: ripoti ${reports.length}`, `Whole council: ${reports.length} reports`)}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>{t("Bidhaa", "Item")}</th>
                <th>{t("Kipimo", "Unit")}</th>
                <th className="num">{t("Wastani (Tsh)", "Average (Tsh)")}</th>
                <th className="num">{t("Chini–juu", "Low–high")}</th>
                <th className="num">{t("Ripoti", "Reports")}</th>
                <th>{t("Upatikanaji", "Availability")}</th>
              </tr>
            </thead>
            <tbody>
              {combined.map((r) => (
                <tr key={`${r.commodity}|${r.unit}`}>
                  <td><strong>{catalogText(r.commodity)}</strong></td>
                  <td>{catalogText(r.unit)}</td>
                  <td className="num"><strong>{tsh(r.average)}</strong></td>
                  <td className="num small">{r.min === r.max ? "" : `${tsh(r.min)}–${tsh(r.max)}`}</td>
                  <td className="num">{r.wards}</td>
                  <td>{r.availability ? <span className={`avail avail-${r.availability}`}>{avail(r.availability)}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{t("Wastani wa halmashauri umepimwa kwa idadi ya bei zilizoandikwa katika kila ripoti.", "The council average is weighted by the number of prices recorded in each report.")}</p>

          <h2 className="food-h2">{t("Ripoti za kata na vijiji", "Ward and village reports")}</h2>
          <ul className="food-sends">
            {reports.map((r) => {
              const expanded = open === r._id;
              return (
                <li key={r._id} className={expanded ? "is-open" : undefined}>
                  <button type="button" className="food-send-head no-print-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r._id)}>
                    <span>
                      <strong>{r.areaLabel}</strong>
                      <small>{r.officerName}, {when(r.submittedAt)}</small>
                      <SendTags r={r} />
                    </span>
                    <SectionTags sections={[r.primarySection]} />
                    <span className="muted small">{t(`bidhaa ${r.payload.rows.length}`, `${r.payload.rows.length} items`)}</span>
                  </button>
                  <div className="food-send-body">
                    <div className="row-actions no-print">
                      <button
                        type="button"
                        className="btn btn-quiet btn-small"
                        onClick={() =>
                          setReading({
                            kind: "report",
                            title: `${r.areaLabel}: ${t("chakula na bei", "food and prices")}, ${cycle.label}`,
                            subtitle: `${r.officerName}, ${t("ilitumwa", "sent")} ${when(r.submittedAt)}`,
                            report: foodReportAsReport(r.payload, { period, areaLabel: r.areaLabel, officerName: r.officerName, councilName }),
                            submissionId: r._id,
                          })
                        }
                      >
                        {t("Soma kama ripoti", "Read as a report")}
                      </button>
                      <ReopenReport id={r._id} officer={r.officerName} canReopen={r.canReopen} reopened={r.reopened} />
                    </div>
                    <table className="table compact">
                      <thead>
                        <tr>
                          <th>{t("Bidhaa", "Item")}</th><th>{t("Kipimo", "Unit")}</th><th className="num">{t("Wastani", "Average")}</th>
                          <th className="num">{t("Chini–juu", "Low–high")}</th><th className="num">{t("Bei", "Prices")}</th><th>{t("Upatikanaji", "Availability")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.payload.rows.map((row) => (
                          <tr key={`${row.commodity}|${row.unit}`}>
                            <td>{catalogText(row.commodity)}</td>
                            <td>{catalogText(row.unit)}</td>
                            <td className="num">{tsh(row.average)}</td>
                            <td className="num small">{row.min === row.max ? "" : `${tsh(row.min)}–${tsh(row.max)}`}</td>
                            <td className="num">{row.count}</td>
                            <td>{avail(row.availability)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.payload.note && <p className="food-note">{r.payload.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <MissingReports kind="food_prices" period={period} due={cycle.due} />
      {reading && <Reader doc={reading} onClose={() => setReading(null)} />}
    </section>
  );
}
