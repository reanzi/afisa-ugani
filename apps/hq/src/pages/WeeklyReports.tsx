/**
 * Weekly section reports (livestock, crops) sent by officers, for one week.
 * Asked of officers only once the section's weekly reports are switched on
 * in Settings; officers send them every Monday for the week before.
 */
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import { partHasData, SECTION_LABELS, shiftWeek, weekKey, weekLabel, weeklyKind, weeklyWindow, WEEKLY_SECTIONS, type Report } from "@afisa/shared";
import { errorMessage, IconDownload, Select, useLabel, useLang, useT, Glide } from "@afisa/ui";
import { useHq } from "../context";
import { Reader, type ReaderDoc } from "../reader/Reader";
import { MissingReports, ReopenReport, SendTags, when } from "./common";

function isReport(p: unknown, week: string): p is Report {
  if (!p || typeof p !== "object") return false;
  const r = p as Record<string, unknown>;
  return r.kind === "weekly" && r.month === week && Array.isArray(r.parts);
}

export function WeeklyReports() {
  const t = useT();
  const lang = useLang();
  const label = useLabel();
  const { councilId } = useHq();
  const settings = useQuery(api.councils.settings, { councilId });
  const [section, setSection] = useQueryState("sehemu", parseAsStringLiteral(WEEKLY_SECTIONS).withDefault("mifugo"));
  const kind = weeklyKind(section);
  const last = shiftWeek(weekKey(new Date()), -1);
  const periods = useQuery(api.submissions.periodsForHq, { councilId, kind });
  const [chosen, setChosen] = useQueryState("wiki", parseAsString);
  const week = chosen ?? last;
  const raw = useQuery(api.submissions.forHq, { councilId, kind, period: week });
  const reports = useMemo(() => raw?.flatMap((r) => (isReport(r.payload, week) ? [{ ...r, report: r.payload }] : [])), [raw, week]);
  const [reading, setReading] = useState<ReaderDoc | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { due } = weeklyWindow(week);
  const on = settings?.weekly[section].on ?? false;
  const sectionName = label(SECTION_LABELS[section]);

  const options = useMemo(() => {
    const set = new Set<string>([...(periods ?? []), last, shiftWeek(last, -1), shiftWeek(last, -2), shiftWeek(last, -3)]);
    return [...set].sort().reverse().map((p) => ({ value: p, label: weekLabel(p, lang) }));
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
        <h1>{t("Ripoti za wiki", "Weekly reports")}</h1>
        <p className="muted">
          {t(
            `Ripoti za wiki za ${sectionName.toLowerCase()} kwa ${weekLabel(week, "sw")}. Zinafika kabla ya Jumatatu saa 11 alfajiri (05:00), tayari kwa kikao cha asubuhi.`,
            `Weekly ${sectionName.toLowerCase()} reports for ${weekLabel(week, "en")}. They arrive by Monday 05:00, ready for the morning meeting.`,
          )}
        </p>
        <div className="filters">
          <div className="segmented" role="tablist" aria-label={t("Sehemu", "Section")}>
            {WEEKLY_SECTIONS.map((s) => (
              <button key={s} role="tab" aria-selected={s === section} onClick={() => void setSection(s)}>
                {label(SECTION_LABELS[s])}
              </button>
            ))}
            <Glide />
          </div>
          <div className="field inline">
            <span id="f-wiki">{t("Wiki", "Week")}</span>
            <Select size="sm" labelledBy="f-wiki" label={t("Wiki", "Week")} value={week} onChange={(v) => void setChosen(v)} options={options} />
          </div>
        </div>
      </header>

      {settings && !on && (
        <div className="notice" role="status">
          <p>
            {t(
              `Ripoti za wiki za ${sectionName.toLowerCase()} zimezimwa: maafisa hawaombwi kuzituma. Ziwashe kwenye Mipangilio.`,
              `Weekly ${sectionName.toLowerCase()} reports are off: officers are not asked to send them. Switch them on in Settings.`,
            )}
          </p>
        </div>
      )}
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      {reports === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {reports?.length === 0 && <p className="empty">{t(`Hakuna ripoti iliyotumwa kwa ${weekLabel(week, "sw")} bado.`, `No reports sent for ${weekLabel(week, "en")} yet.`)}</p>}

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
                      title: `${r.areaLabel}: ${weekLabel(week)}`,
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

      {on && <MissingReports kind={kind} period={week} due={due} />}
      {reading && <Reader doc={reading} onClose={() => setReading(null)} />}
    </section>
  );
}
