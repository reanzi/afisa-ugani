/**
 * Weekly section report (livestock or crops), Monday to Sunday. Any officer
 * can build and download it for their own use; sending to HQ is possible
 * only once HQ has switched weekly reports on for that section.
 */
import { useState } from "react";
import { Link } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { v7 as uuidv7 } from "uuid";
import { partHasData, PAYLOAD_VERSION, SECTION_LABELS, shiftWeek, weekLabel, weeklyKind, weeklyWindow, type Report as ArdsReport } from "@afisa/shared";
import { ConfirmDialog, errorMessage, ReportView, shortDate, useLabel, useT, Glide } from "@afisa/ui";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useReopened, useSealed } from "../lib/food";
import { useAreaLabel } from "../lib/report";
import { exportReport, useWeekParams, useWeeklyReport } from "../lib/weekly";

export function WeeklyReport() {
  const t = useT();
  const label = useLabel();
  const { councilId, membership } = useWork();
  const { week, setWeek, current, section, setSection, sections } = useWeekParams();
  const areaLabel = useAreaLabel();
  const kind = section ? weeklyKind(section) : "weekly_kilimo";
  const { report: live, notes } = useWeeklyReport(section, week);
  const sealed = useSealed(kind)?.get(week) ?? null;
  const reopened = useReopened()?.find((s) => s.kind === kind && s.period === week) ?? null;
  const rejected = useLiveQuery(
    () => db.submissions.where("[councilId+kind+period]").equals([councilId, kind, week]).filter((s) => s.syncState === "rejected").last(),
    [councilId, kind, week],
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!section) {
    return (
      <div className="monthly">
        <p className="empty">{t("Ripoti za wiki ni za sehemu za mifugo na kilimo.", "Weekly reports are for the livestock and crops sections.")}</p>
      </div>
    );
  }

  const setting = membership.weekly?.[section] ?? { on: false, auto: false };
  const report = sealed ? (sealed.payload as unknown as ArdsReport) : live;
  const window_ = weeklyWindow(week);
  const now = Date.now();
  const canSend = setting.on && !sealed && now >= window_.opens;
  const filled = report ? report.parts.filter(partHasData).length : 0;
  const total = report?.parts.length ?? 0;
  const sectionName = label(SECTION_LABELS[section]);
  const isCurrent = week === current;

  const send = async () => {
    if (!live) return;
    await db.submissions.put({
      clientId: uuidv7(),
      councilId,
      kind,
      period: week,
      areaLabel,
      payload: live as unknown as Record<string, unknown>,
      payloadVersion: PAYLOAD_VERSION,
      clientSubmittedAt: Date.now(),
      syncState: "pending",
    });
    requestSync();
    setConfirm(false);
  };

  const exportDocx = async (mode: "download" | "share") => {
    if (!report) return;
    setBusy(mode);
    setError(null);
    try {
      await exportReport(report, mode);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="monthly">
      {sections.length > 1 && (
        <div className="segmented" role="tablist" aria-label={t("Sehemu", "Section")}>
          {sections.map((s) => (
            <button key={s} role="tab" aria-selected={s === section} onClick={() => void setSection(s)}>
              {label(SECTION_LABELS[s])}
            </button>
          ))}
          <Glide />
        </div>
      )}

      <header className="month-head">
        <button className="btn btn-quiet btn-small" onClick={() => void setWeek(shiftWeek(week, -1))} aria-label={t("Wiki iliyopita", "Previous week")}>‹</button>
        <div>
          <h2 className="page-title">{t(`Wiki ya ${sectionName.toLowerCase()}`, `${sectionName} week`)}</h2>
          <p className="muted">{weekLabel(week)}{isCurrent ? t(" (wiki hii)", " (this week)") : ""}</p>
        </div>
        <button className="btn btn-quiet btn-small" onClick={() => void setWeek(shiftWeek(week, 1))} disabled={week >= current} aria-label={t("Wiki inayofuata", "Next week")}>›</button>
      </header>

      {sealed && (
        <div className={`seal${sealed.syncState === "pending" ? " seal-wait" : ""}`} role="status">
          <strong>
            {sealed.syncState === "pending"
              ? t("Imefungwa, inasubiri mtandao", "Locked, waiting for network")
              : `${sealed.auto ? t("Ilitumwa yenyewe", "Sent automatically") : t("Imetumwa makao makuu", "Sent to HQ")} ${shortDate(sealed.submittedAt ?? sealed.clientSubmittedAt)}`}
          </strong>
          <span>{sealed.late ? t("Ilifika baada ya Jumatatu saa 11 alfajiri. ", "Arrived after Monday 5:00 am. ") : ""}{t("Ripoti hii imefungwa. Unaweza kuisoma na kuipakua tu.", "This report is locked. You can only read and download it.")}</span>
        </div>
      )}
      {reopened?.reopened && (
        <div className="seal seal-reopened" role="status">
          <strong>{t("Imerudishwa kwa marekebisho", "Returned for corrections")}</strong>
          <span>{reopened.reopened.byName || t("Makao makuu", "HQ")}: “{reopened.reopened.note}”</span>
          <span>{t("Rekebisha kumbukumbu au maelezo ya wiki, kisha uitume tena.", "Fix the records or the week notes, then send it again.")}</span>
        </div>
      )}
      {rejected && !sealed && (
        <div className="notice notice-danger" role="alert">
          <p>{t("Makao makuu hawakuipokea", "HQ did not accept it")}: {rejected.error ?? t("jaribu tena", "try again")}.</p>
        </div>
      )}

      <section className="report-status">
        <div className="meter" aria-label={t(`Sehemu ${filled} kati ya ${total} zina taarifa`, `${filled} of ${total} parts have data`)}>
          {report?.parts.map((p) => (
            <span key={p.id} className={partHasData(p) ? "on" : undefined} title={`${p.number}. ${p.title}`} />
          ))}
        </div>
        <p>
          <strong>{t(`Sehemu ${filled} kati ya ${total}`, `${filled} of ${total} parts`)}</strong>
          {t(" zina taarifa. Sehemu zisizo na taarifa zitaandikwa 0.", " have data. Parts without data will show 0.")}
        </p>
        <Link to={`/ripoti/wiki?wiki=${week}&sehemu=${section}`} className={`btn btn-block ${notes || sealed ? "btn-quiet" : "btn-primary"}`}>
          {sealed ? t("Soma maelezo ya wiki", "Read the week notes") : notes ? t("Badili maelezo ya wiki", "Change the week notes") : t("Andika maelezo ya wiki", "Write the week notes")}
        </Link>
        {!sealed && !notes && <p className="muted">{t("Matukio, kazi, mafanikio na changamoto za wiki. Dakika moja tu.", "The week's events, work, achievements and challenges. Just a minute.")}</p>}
        <div className="export-row">
        <button className="btn btn-quiet" disabled={!report || busy !== null} onClick={() => void exportDocx("download")}>
          {busy === "download" ? t("Inaandaa…", "Preparing…") : t("Pakua Word (.docx)", "Download Word (.docx)")}
        </button>
        {typeof navigator.canShare === "function" && (
          <button className="btn btn-quiet" disabled={!report || busy !== null} onClick={() => void exportDocx("share")}>
            {busy === "share" ? t("Inaandaa…", "Preparing…") : t("Tuma", "Share")}
          </button>
        )}
        </div>
        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      </section>

      {!sealed && (
        <section className="submit-bar">
          {!setting.on ? (
            <p className="muted">
              {t(
                `Makao makuu hawajawasha ripoti za wiki za ${sectionName.toLowerCase()}. Unaweza kuiandaa na kuipakua kwa matumizi yako.`,
                `HQ has not switched on weekly ${sectionName.toLowerCase()} reports. You can still build and download it for your own use.`,
              )}
            </p>
          ) : canSend ? (
            <>
              <p>
                {reopened
                  ? t("Ukimaliza marekebisho, itume tena. Itafungwa tena baada ya kutumwa.", "When you finish the corrections, send it again. It locks again once sent.")
                  : now > window_.due
                  ? t("Muda umepita (Jumatatu saa 11 alfajiri). Ukiituma sasa itaonekana imechelewa.", "The deadline (Monday 5:00 am) has passed. If you send it now it will show as late.")
                  : t("Itume kabla ya Jumatatu saa 11 alfajiri. Usipoituma, itatumwa yenyewe wakati huo na kumbukumbu ulizonazo.", "Send it before Monday 5:00 am. If you don't, it will be sent automatically then with the records you have.")}
              </p>
              <button className="btn btn-primary btn-block" disabled={!live} onClick={() => setConfirm(true)}>
                {reopened ? t("Tuma tena", "Send again") : t("Tuma ripoti ya wiki", "Send weekly report")}
              </button>
            </>
          ) : (
            <p>
              {t(`Utaweza kuituma kuanzia Jumapili ${shortDate(window_.opens)} saa 12 jioni, hadi Jumatatu saa 11 alfajiri.`, `You can send it from Sunday ${shortDate(window_.opens)} 6:00 pm until Monday 5:00 am.`)}
              {t(" Usipoituma, itatumwa yenyewe Jumatatu saa 11 alfajiri.", " If you don't, it will be sent automatically on Monday at 5:00 am.")}
            </p>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirm}
        title={t(`Tuma ripoti ya wiki ya ${weekLabel(week)}?`, `Send the report for ${weekLabel(week)}?`)}
        confirmLabel={t("Ndiyo, tuma", "Yes, send")}
        onConfirm={() => void send()}
        onCancel={() => setConfirm(false)}
      >
        <p>{t("Ripoti itatumwa makao makuu na kufungwa. Huwezi kuibadilisha baada ya kutuma.", "The report will be sent to HQ and locked. You cannot change it after sending.")}</p>
        {!notes && <p><strong>{t("Hujaandika maelezo ya wiki.", "You have not written the week notes.")}</strong> {t("Mafanikio na changamoto zitakuwa tupu.", "Achievements and challenges will be empty.")}</p>}
      </ConfirmDialog>

      {report && <ReportView report={report} />}
    </div>
  );
}
