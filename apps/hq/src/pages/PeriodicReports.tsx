/**
 * ARDS quarterly and annual reports sent by officers: the sealed copy each
 * officer sent (or that was sent for them on the 7th), shown as the form reads.
 * Values the officer typed in at the period's end are marked ✎.
 */
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { parseAsString, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import {
  annualWindow,
  fyLabel,
  partHasData,
  quarterLabel,
  quarterlyWindow,
  reportingFy,
  reportingQuarter,
  shiftFy,
  shiftQuarter,
  type Report,
} from "@afisa/shared";
import { errorMessage, IconDownload, Select, useLang, useT } from "@afisa/ui";
import { useHq } from "../context";
import { Reader, type ReaderDoc } from "../reader/Reader";
import { MissingReports, ReopenReport, SectionTags, SendTags, when } from "./common";

type Kind = "quarterly" | "annual";

function isReport(p: unknown, kind: Kind, period: string): p is Report {
  if (!p || typeof p !== "object") return false;
  const r = p as Record<string, unknown>;
  return r.kind === kind && r.month === period && Array.isArray(r.parts);
}

export function PeriodicReports({ kind }: { kind: Kind }) {
  const t = useT();
  const lang = useLang();
  const { councilId } = useHq();
  const now = Date.now();
  const latest = kind === "quarterly" ? reportingQuarter(now) : reportingFy(now);
  const shift = kind === "quarterly" ? shiftQuarter : shiftFy;
  const label = (p: string, l: "sw" | "en" = lang) => (kind === "quarterly" ? quarterLabel(p, l) : l === "en" ? `Financial year ${fyLabel(p)}` : `Mwaka wa fedha ${fyLabel(p)}`);
  const periods = useQuery(api.submissions.periodsForHq, { councilId, kind });
  const [chosen, setChosen] = useQueryState("kipindi", parseAsString);
  const period = chosen && (periods ?? []).concat(latest, shift(latest, -1)).includes(chosen) ? chosen : latest;
  const raw = useQuery(api.submissions.forHq, { councilId, kind, period });
  const reports = useMemo(() => raw?.flatMap((r) => (isReport(r.payload, kind, period) ? [{ ...r, report: r.payload }] : [])), [raw, kind, period]);
  const [reading, setReading] = useState<ReaderDoc | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { due } = kind === "quarterly" ? quarterlyWindow(period) : annualWindow(period);

  const options = useMemo(() => {
    const set = new Set<string>([...(periods ?? []), latest, shift(latest, -1)]);
    return [...set].sort().reverse().map((p) => ({ value: p, label: label(p) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods, latest, lang, kind]);

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
        <h1>{kind === "quarterly" ? t("Ripoti za robo (ARDS)", "Quarterly reports (ARDS)") : t("Ripoti za mwaka (ARDS)", "Annual reports (ARDS)")}</h1>
        <p className="muted">
          {kind === "quarterly"
            ? t(
                "Zinatumwa kuanzia tarehe 15 ya mwezi wa mwisho wa robo, na zinatakiwa kufikia tarehe 7 ya mwezi unaofuata. Thamani zenye alama ✎ ziliongezwa na afisa mwishoni mwa kipindi.",
                "Sent from the 15th of the quarter's last month, due by the 7th of the next month. Values marked ✎ were typed in by the officer at the period's end.",
              )
            : t(
                "Zinatumwa kuanzia 1 Juni, na zinatakiwa kufikia 7 Julai. Thamani zenye alama ✎ ziliongezwa na afisa mwishoni mwa mwaka.",
                "Sent from 1 June, due by 7 July. Values marked ✎ were typed in by the officer at the year's end.",
              )}
        </p>
        <div className="filters">
          <div className="field inline">
            <span id="f-kipindi">{t("Kipindi", "Period")}</span>
            <Select size="sm" labelledBy="f-kipindi" label={t("Kipindi", "Period")} value={period} onChange={(v) => void setChosen(v)} options={options} />
          </div>
        </div>
      </header>

      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      {reports === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {reports?.length === 0 && <p className="empty">{t(`Hakuna ripoti iliyotumwa kwa ${label(period, "sw")} bado.`, `No reports sent for ${label(period, "en")} yet.`)}</p>}

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
                      title: `${r.areaLabel}: ${label(period)}`,
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

      <MissingReports kind={kind} period={period} due={due} />
      {reading && <Reader doc={reading} onClose={() => setReading(null)} />}
    </section>
  );
}
