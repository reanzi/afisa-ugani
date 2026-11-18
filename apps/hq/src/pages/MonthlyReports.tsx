/**
 * ARDS monthly reports sent by officers. Each is the sealed copy the officer
 * sent (or that was sent for them on the 5th), shown as the form reads.
 */
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { parseAsString, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import { monthKey, monthLabel, monthlyWindow, partHasData, shiftMonth, type Report } from "@afisa/shared";
import { errorMessage, IconDownload, Select, useLang, useT } from "@afisa/ui";
import { useHq } from "../context";
import { Reader, type ReaderDoc } from "../reader/Reader";
import { MissingReports, ReopenReport, SectionTags, SendTags, when } from "./common";

function isReport(p: unknown, month: string): p is Report {
  if (!p || typeof p !== "object") return false;
  const r = p as Record<string, unknown>;
  return r.kind === "monthly" && r.month === month && Array.isArray(r.parts);
}

export function MonthlyReports() {
  const t = useT();
  const lang = useLang();
  const { councilId } = useHq();
  const last = shiftMonth(monthKey(new Date()), -1);
  const periods = useQuery(api.submissions.periodsForHq, { councilId, kind: "monthly" });
  const [chosen, setChosen] = useQueryState("mwezi", parseAsString);
  const month = chosen ?? last;
  const raw = useQuery(api.submissions.forHq, { councilId, kind: "monthly", period: month });
  const reports = useMemo(() => raw?.flatMap((r) => (isReport(r.payload, month) ? [{ ...r, report: r.payload }] : [])), [raw, month]);
  const [reading, setReading] = useState<ReaderDoc | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { due } = monthlyWindow(month);

  const options = useMemo(() => {
    const set = new Set<string>([...(periods ?? []), last, shiftMonth(last, -1)]);
    return [...set].sort().reverse().map((p) => ({ value: p, label: monthLabel(p, lang) }));
  }, [periods, last, lang]);

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
        <h1>{t("Ripoti za mwezi (ARDS)", "Monthly reports (ARDS)")}</h1>
        <p className="muted">
          {t(
            `Ripoti walizotuma maafisa kwa ${monthLabel(month)}. Zinatakiwa kufikia tarehe 5 ya mwezi unaofuata. Kila ripoti ni nakala iliyofungwa; ikihitaji marekebisho, irudishe kwa afisa.`,
            `Reports officers sent for ${monthLabel(month, "en")}. They are due by the 5th of the next month. Each is a sealed copy; if one needs correcting, send it back to the officer.`,
          )}
        </p>
        <div className="filters">
          <div className="field inline">
            <span id="f-mwezi">{t("Mwezi", "Month")}</span>
            <Select size="sm" labelledBy="f-mwezi" label={t("Mwezi", "Month")} value={month} onChange={(v) => void setChosen(v)} options={options} />
          </div>
        </div>
      </header>

      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      {reports === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {reports?.length === 0 && <p className="empty">{t(`Hakuna ripoti iliyotumwa kwa ${monthLabel(month)} bado.`, `No reports sent for ${monthLabel(month, "en")} yet.`)}</p>}

      {reports && reports.length > 0 && (
        <ul className="food-sends">
          {reports.map((r) => {
            const filled = r.report.parts.filter(partHasData).length;
            return (
              <li key={r._id} className="report-row">
                <button
                  type="button"
                  className="food-send-head"
                  onClick={() =>
                    setReading({
                      kind: "report",
                      title: `${r.areaLabel}: ${monthLabel(month)}`,
                      subtitle: `${r.officerName}, ${t("ilitumwa", "sent")} ${when(r.submittedAt)}`,
                      report: r.report,
                      submissionId: r._id,
                    })
                  }
                >
                  <span>
                    <strong>{r.areaLabel}</strong>
                    <small>{r.officerName}, {when(r.submittedAt)}</small>
                    <SendTags r={r} />
                  </span>
                  <SectionTags sections={[r.primarySection]} />
                  <span className="muted small">{t(`sehemu ${filled}/${r.report.parts.length}`, `${filled}/${r.report.parts.length} parts`)}</span>
                  <span className="read-cta">{t("Soma", "Read")}</span>
                </button>
                <div className="row-actions">
                  <button className="btn btn-quiet btn-small btn-with-icon" disabled={busy !== null} onClick={() => void download(r._id, r.report)}>
                    <IconDownload size={18} />
                    {busy === r._id ? t("Inaandaa…", "Preparing…") : "Word"}
                  </button>
                  <ReopenReport id={r._id} officer={r.officerName} canReopen={r.canReopen} reopened={r.reopened} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <MissingReports kind="monthly" period={month} due={due} />
      {reading && <Reader doc={reading} onClose={() => setReading(null)} />}
    </section>
  );
}
