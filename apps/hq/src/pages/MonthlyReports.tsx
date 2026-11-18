/**
 * ARDS monthly reports sent by officers. Each is the sealed copy the officer
 * sent (or that was sent for them on the 5th), shown as the form reads.
 */
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { parseAsString, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import { monthKey, monthLabel, monthlyWindow, partHasData, shiftMonth, type Report } from "@afisa/shared";
import { errorMessage, ReportView, Select } from "@afisa/ui";
import { useHq } from "../context";
import { MissingReports, SectionTags, SendTags, when } from "./common";

function isReport(p: unknown, month: string): p is Report {
  if (!p || typeof p !== "object") return false;
  const r = p as Record<string, unknown>;
  return r.kind === "monthly" && r.month === month && Array.isArray(r.parts);
}

export function MonthlyReports() {
  const { councilId } = useHq();
  const last = shiftMonth(monthKey(new Date()), -1);
  const periods = useQuery(api.submissions.periodsForHq, { councilId, kind: "monthly" });
  const [chosen, setChosen] = useQueryState("mwezi", parseAsString);
  const month = chosen ?? last;
  const raw = useQuery(api.submissions.forHq, { councilId, kind: "monthly", period: month });
  const reports = useMemo(() => raw?.flatMap((r) => (isReport(r.payload, month) ? [{ ...r, report: r.payload }] : [])), [raw, month]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { due } = monthlyWindow(month);

  const options = useMemo(() => {
    const set = new Set<string>([...(periods ?? []), last, shiftMonth(last, -1)]);
    return [...set].sort().reverse().map((p) => ({ value: p, label: monthLabel(p) }));
  }, [periods, last]);

  const download = async (id: string, report: Report) => {
    setBusy(id);
    setError(null);
    try {
      const { reportToDocx, reportFileName } = await import("@afisa/ui/docx");
      const blob = await reportToDocx(report);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFileName(report);
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>Ripoti za mwezi (ARDS)</h1>
        <p className="muted">
          Ripoti walizotuma maafisa kwa {monthLabel(month)}. Zinatakiwa kufikia tarehe 5 ya mwezi unaofuata. Kila ripoti ni nakala iliyofungwa; haibadiliki.
        </p>
        <div className="filters">
          <div className="field inline">
            <span id="f-mwezi">Mwezi</span>
            <Select size="sm" labelledBy="f-mwezi" label="Mwezi" value={month} onChange={(v) => void setChosen(v)} options={options} />
          </div>
        </div>
      </header>

      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      {reports === undefined && <p className="muted">Inapakia…</p>}
      {reports?.length === 0 && <p className="empty">Hakuna ripoti iliyotumwa kwa {monthLabel(month)} bado.</p>}

      {reports && reports.length > 0 && (
        <ul className="food-sends">
          {reports.map((r) => {
            const expanded = open === r._id;
            const filled = r.report.parts.filter(partHasData).length;
            return (
              <li key={r._id} className={expanded ? "is-open" : undefined}>
                <button type="button" className="food-send-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r._id)}>
                  <span>
                    <strong>{r.areaLabel}</strong>
                    <small>{r.officerName}, {when(r.submittedAt)}</small>
                    <SendTags auto={r.auto} late={r.late} />
                  </span>
                  <SectionTags sections={[r.primarySection]} />
                  <span className="muted small">sehemu {filled}/{r.report.parts.length}</span>
                </button>
                {expanded && (
                  <div className="food-send-body monthly-body">
                    <div className="row-actions">
                      <button className="btn btn-quiet btn-small" disabled={busy !== null} onClick={() => void download(r._id, r.report)}>
                        {busy === r._id ? "Inaandaa…" : "Pakua Word (.docx)"}
                      </button>
                    </div>
                    <ReportView report={r.report} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <MissingReports kind="monthly" period={month} due={due} />
    </section>
  );
}
