/**
 * Food availability and prices sent by the wards for one period, and the
 * council-wide list made from them. HQ only ever sees what officers sent.
 */
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { parseAsString, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import { availabilityLabel, combineFoodReports, currentFoodReport, foodCycle, shiftMonth } from "@afisa/shared";
import { Select, shortDate } from "@afisa/ui";
import { useHq } from "../context";
import { SectionTags, when } from "./common";

const tsh = (n: number) => n.toLocaleString("en-US");

export function FoodReports() {
  const { councilId, councilName } = useHq();
  const current = currentFoodReport(Date.now()).period;
  const periods = useQuery(api.submissions.periodsForHq, { councilId, kind: "food_prices" });
  const [chosen, setChosen] = useQueryState("kipindi", parseAsString);
  const period = chosen ?? periods?.[0] ?? current;
  const reports = useQuery(api.submissions.forHq, { councilId, kind: "food_prices", period });
  const combined = useMemo(() => (reports ? combineFoodReports(reports.map((r) => r.payload)) : []), [reports]);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cycle = foodCycle(period);

  const options = useMemo(() => {
    const set = new Set<string>([...(periods ?? []), current, shiftMonth(current, -1)]);
    return [...set].sort().reverse().map((p) => ({ value: p, label: foodCycle(p).label }));
  }, [periods, current]);

  const copyTable = async () => {
    const head = ["Bidhaa", "Kipimo", "Wastani (Tsh)", "Chini", "Juu", "Kata", "Bei zilizoandikwa", "Upatikanaji"].join("\t");
    const body = combined.map((r) => [r.commodity, r.unit, r.average, r.min, r.max, r.wards, r.prices, availabilityLabel(r.availability)].join("\t"));
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
        <h1>Upatikanaji wa chakula na bei</h1>
        <p className="muted">
          Ripoti zilizotumwa na maafisa, kipindi cha {shortDate(cycle.start)} hadi {shortDate(cycle.end - 1)}. Kumbukumbu za maafisa zenyewe hazionekani hapa;
          ni zile walizoamua kutuma tu.
        </p>
        <div className="filters no-print">
          <div className="field inline">
            <span id="f-kipindi">Kipindi</span>
            <Select size="sm" labelledBy="f-kipindi" label="Kipindi" value={period} onChange={(v) => void setChosen(v)} options={options} />
          </div>
          <button className="btn btn-quiet btn-small" onClick={() => window.print()} disabled={!reports?.length}>Chapisha</button>
          <button className="btn btn-quiet btn-small" onClick={() => void copyTable()} disabled={!combined.length}>
            {copied ? "Imenakiliwa" : "Nakili jedwali (Excel)"}
          </button>
        </div>
      </header>

      <div className="print-only print-head">
        <strong>{councilName}</strong>
        <span>Upatikanaji wa chakula na bei: {cycle.label} ({shortDate(cycle.start)} hadi {shortDate(cycle.end - 1)})</span>
      </div>

      {reports === undefined && <p className="muted">Inapakia…</p>}
      {reports?.length === 0 && (
        <p className="empty">Hakuna ripoti iliyotumwa kwa kipindi hiki bado. Maafisa hutuma kufikia tarehe 22.</p>
      )}

      {reports && reports.length > 0 && (
        <>
          <h2 className="food-h2">Halmashauri nzima: kata {reports.length}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Bidhaa</th>
                <th>Kipimo</th>
                <th className="num">Wastani (Tsh)</th>
                <th className="num">Chini–juu</th>
                <th className="num">Kata</th>
                <th>Upatikanaji</th>
              </tr>
            </thead>
            <tbody>
              {combined.map((r) => (
                <tr key={`${r.commodity}|${r.unit}`}>
                  <td><strong>{r.commodity}</strong></td>
                  <td>{r.unit}</td>
                  <td className="num"><strong>{tsh(r.average)}</strong></td>
                  <td className="num small">{r.min === r.max ? "" : `${tsh(r.min)}–${tsh(r.max)}`}</td>
                  <td className="num">{r.wards}</td>
                  <td>{r.availability ? <span className={`avail avail-${r.availability}`}>{availabilityLabel(r.availability)}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Wastani wa halmashauri umepimwa kwa idadi ya bei zilizoandikwa katika kila kata.</p>

          <h2 className="food-h2">Ripoti za kata na vijiji</h2>
          <ul className="food-sends">
            {reports.map((r) => {
              const expanded = open === r._id;
              return (
                <li key={r._id} className={expanded ? "is-open" : undefined}>
                  <button type="button" className="food-send-head no-print-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r._id)}>
                    <span>
                      <strong>{r.areaLabel}</strong>
                      <small>{r.officerName}, {when(r.submittedAt)}{r.revision > 1 ? `, toleo la ${r.revision}` : ""}</small>
                    </span>
                    <SectionTags sections={[r.primarySection]} />
                    <span className="muted small">bidhaa {r.payload.rows.length}</span>
                  </button>
                  <div className="food-send-body">
                    <table className="table compact">
                      <thead>
                        <tr><th>Bidhaa</th><th>Kipimo</th><th className="num">Wastani</th><th className="num">Chini–juu</th><th className="num">Bei</th><th>Upatikanaji</th></tr>
                      </thead>
                      <tbody>
                        {r.payload.rows.map((row) => (
                          <tr key={`${row.commodity}|${row.unit}`}>
                            <td>{row.commodity}</td>
                            <td>{row.unit}</td>
                            <td className="num">{tsh(row.average)}</td>
                            <td className="num small">{row.min === row.max ? "" : `${tsh(row.min)}–${tsh(row.max)}`}</td>
                            <td className="num">{row.count}</td>
                            <td>{availabilityLabel(row.availability)}</td>
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
    </section>
  );
}
