import { useState } from "react";
import { Link } from "react-router";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useLiveQuery } from "dexie-react-hooks";
import { v7 as uuidv7 } from "uuid";
import { monthKey, monthLabel, monthlyWindow, partHasData, PAYLOAD_VERSION, shiftMonth, type Report as ArdsReport } from "@afisa/shared";
import { ConfirmDialog, errorMessage, ReportView, shortDate, useT } from "@afisa/ui";
import { useAreaLabel, useMonthlyReport } from "../lib/report";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useReopened, useSealed } from "../lib/food";
import { FoodReport } from "./FoodReport";
import { Performance } from "./Performance";
import { WeeklyReport } from "./WeeklyReport";
import { useWeeklySections } from "../lib/weekly";

export function useMonthParam() {
  const current = monthKey(new Date());
  const [raw, setMonth] = useQueryState("mwezi", parseAsString.withDefault(current));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= current ? raw : current;
  return { month, setMonth, current };
}

function MonthlyReport() {
  const { month, setMonth, current } = useMonthParam();
  const { councilId, membership } = useWork();
  const areaLabel = useAreaLabel();
  const { report: live, review } = useMonthlyReport(month);
  const sealed = useSealed("monthly")?.get(month) ?? null;
  const reopened = useReopened()?.find((s) => s.kind === "monthly" && s.period === month) ?? null;
  const rejected = useLiveQuery(
    () => db.submissions.where("[councilId+kind+period]").equals([councilId, "monthly", month]).filter((s) => s.syncState === "rejected").last(),
    [councilId, month],
  );
  // Once sent, the report shown is the one that was sent, not a fresh build.
  const report = sealed ? (sealed.payload as unknown as ArdsReport) : live;
  const window_ = monthlyWindow(month);
  const now = Date.now();
  const canSend = !sealed && now >= window_.opens;
  const autoOn = membership.autoSend?.monthly ?? false;
  const [confirm, setConfirm] = useState(false);
  const t = useT();

  const send = async () => {
    if (!live) return;
    await db.submissions.put({
      clientId: uuidv7(),
      councilId,
      kind: "monthly",
      period: month,
      areaLabel,
      payload: live as unknown as Record<string, unknown>,
      payloadVersion: PAYLOAD_VERSION,
      clientSubmittedAt: Date.now(),
      syncState: "pending",
    });
    requestSync();
    setConfirm(false);
  };
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canShare = typeof navigator.canShare === "function";

  const filled = report ? report.parts.filter(partHasData).length : 0;
  const total = report?.parts.length ?? 0;

  const exportDocx = async (mode: "download" | "share") => {
    if (!report) return;
    setBusy(mode);
    setError(null);
    try {
      const { reportToDocx, reportFileName } = await import("@afisa/ui/docx");
      const blob = await reportToDocx(report);
      const name = reportFileName(report);
      if (mode === "share") {
        const file = new File([blob], name, { type: blob.type });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="monthly">
      <header className="month-head">
        <button className="btn btn-quiet btn-small" onClick={() => void setMonth(shiftMonth(month, -1))} aria-label={t("Mwezi uliopita", "Previous month")}>‹</button>
        <h2 className="page-title">{t(`Ripoti ya ${monthLabel(month)}`, `${monthLabel(month)} report`)}</h2>
        <button
          className="btn btn-quiet btn-small"
          onClick={() => void setMonth(shiftMonth(month, 1))}
          disabled={month >= current}
          aria-label={t("Mwezi unaofuata", "Next month")}
        >
          ›
        </button>
      </header>

      {sealed && (
        <div className={`seal${sealed.syncState === "pending" ? " seal-wait" : ""}`} role="status">
          <strong>
            {sealed.syncState === "pending"
              ? t("Imefungwa, inasubiri mtandao", "Locked, waiting for network")
              : `${sealed.auto ? t("Ilitumwa yenyewe", "Sent automatically") : t("Imetumwa makao makuu", "Sent to HQ")} ${shortDate(sealed.submittedAt ?? sealed.clientSubmittedAt)}`}
          </strong>
          <span>{sealed.late ? t("Ilifika baada ya tarehe 5. ", "Arrived after the 5th. ") : ""}{t("Ripoti hii imefungwa. Unaweza kuisoma na kuipakua tu.", "This report is locked. You can only read and download it.")}</span>
        </div>
      )}
      {reopened?.reopened && (
        <div className="seal seal-reopened" role="status">
          <strong>{t("Imerudishwa kwa marekebisho", "Returned for corrections")}</strong>
          <span>{reopened.reopened.byName || t("Makao makuu", "HQ")}: “{reopened.reopened.note}”</span>
          <span>{t("Rekebisha kumbukumbu au majibu ya mwisho wa mwezi, kisha uitume tena.", "Fix the records or month-end answers, then send it again.")}</span>
        </div>
      )}
      {!sealed && rejected && (
        <div className="notice notice-danger" role="alert"><p>{t("Makao makuu hawakuipokea", "HQ did not accept it")}: {rejected.error ?? t("jaribu tena", "try again")}.</p></div>
      )}

      <section className="report-status">
        <div className="meter" aria-label={t(`Sehemu ${filled} kati ya ${total} zina taarifa`, `${filled} of ${total} parts have data`)}>
          {report?.parts.map((p) => (
            <span key={p.id} className={partHasData(p) ? "on" : undefined} title={`${p.number}. ${p.title}`} />
          ))}
        </div>
        <p>
          <strong>{t(`Sehemu ${filled} kati ya ${total}`, `${filled} of ${total} parts`)}</strong>{t(" zina taarifa. Sehemu zisizo na taarifa zitaandikwa 0 kama fomu inavyoelekeza.", " have data. Parts without data will show 0, as the form requires.")}
        </p>
        {sealed ? (
          <Link to={`/ripoti/majibu?mwezi=${month}`} className="btn btn-block btn-quiet">{t("Soma majibu ya mwisho wa mwezi", "Read the month-end answers")}</Link>
        ) : (
          <>
            <Link to={`/ripoti/majibu?mwezi=${month}`} className={`btn btn-block ${review ? "btn-quiet" : "btn-primary"}`}>
              {review ? t("Badili majibu ya mwisho wa mwezi", "Change the month-end answers") : t("Jibu maswali ya mwisho wa mwezi", "Answer the month-end questions")}
            </Link>
            {!review && <p className="muted">{t("Hali ya mvua, mafanikio, changamoto na makadirio ya mazao. Dakika chache tu.", "Rainfall, achievements, challenges and crop estimates. Just a few minutes.")}</p>}
          </>
        )}
        <div className="export-row">
          <button className="btn btn-quiet" disabled={!report || busy !== null} onClick={() => void exportDocx("download")}>
            {busy === "download" ? t("Inaandaa…", "Preparing…") : t("Pakua Word (.docx)", "Download Word (.docx)")}
          </button>
          {canShare && (
            <button className="btn btn-quiet" disabled={!report || busy !== null} onClick={() => void exportDocx("share")}>
              {busy === "share" ? t("Inaandaa…", "Preparing…") : t("Tuma", "Share")}
            </button>
          )}
        </div>
        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      </section>

      {!sealed && (
        <section className="submit-bar">
          {canSend ? (
            <>
              <p>
                {reopened
                  ? t("Ukimaliza marekebisho, itume tena. Itafungwa tena baada ya kutumwa.", "When you finish the corrections, send it again. It locks again once sent.")
                  : now > window_.due
                  ? t("Tarehe 5 imepita. Ukiituma sasa itaonekana imechelewa.", "The 5th has passed. If you send it now it will show as late.")
                  : autoOn
                    ? t("Itume kabla ya tarehe 5. Usipoituma, itatumwa yenyewe tarehe 5 saa 5:30 usiku.", "Send it before the 5th. If you don't, it will be sent automatically on the 5th at 11:30 pm.")
                    : t("Mwezi umeisha. Itume kabla ya tarehe 5.", "The month has ended. Send it before the 5th.")}
              </p>
              <button className="btn btn-primary btn-block" disabled={!live} onClick={() => setConfirm(true)}>{reopened ? t("Tuma tena", "Send again") : t("Tuma ripoti ya mwezi", "Send monthly report")}</button>
            </>
          ) : (
            <p>{t(`Utaweza kuituma kuanzia ${shortDate(window_.opens)}, mwezi ukiisha.`, `You can send it from ${shortDate(window_.opens)}, when the month ends.`)}{autoOn ? t(" Usipoituma, itatumwa yenyewe tarehe 5.", " If you don't, it will be sent automatically on the 5th.") : ""}</p>
          )}
        </section>
      )}

      <ConfirmDialog open={confirm} title={t(`Tuma ripoti ya ${monthLabel(month)}?`, `Send the ${monthLabel(month)} report?`)} confirmLabel={t("Ndiyo, tuma", "Yes, send")} onConfirm={() => void send()} onCancel={() => setConfirm(false)}>
        <p>{t("Ripoti itatumwa makao makuu na kufungwa. Huwezi kuibadilisha baada ya kutuma.", "The report will be sent to HQ and locked. You cannot change it after sending.")}</p>
        {!review && <p><strong>{t("Hujajibu maswali ya mwisho wa mwezi.", "You have not answered the month-end questions.")}</strong> {t("Sehemu za mvua, mafanikio na changamoto zitakuwa tupu.", "The rainfall, achievements and challenges parts will be empty.")}</p>}
      </ConfirmDialog>

      {report && <ReportView report={report} />}
    </div>
  );
}

const KINDS = ["mwezi", "wiki", "malengo", "chakula"] as const;

export function Report() {
  const [chosen, setKind] = useQueryState("aina", parseAsStringLiteral(KINDS).withDefault("mwezi"));
  const t = useT();
  const weekly = useWeeklySections().length > 0;
  const kind = chosen === "wiki" && !weekly ? "mwezi" : chosen;
  return (
    <main className="page">
      <div className="segmented report-kinds" role="tablist" aria-label={t("Aina ya ripoti", "Report type")}>
        <button role="tab" aria-selected={kind === "mwezi"} onClick={() => void setKind("mwezi")}>{t("Mwezi", "Monthly")}</button>
        {weekly && <button role="tab" aria-selected={kind === "wiki"} onClick={() => void setKind("wiki")}>{t("Wiki", "Weekly")}</button>}
        <button role="tab" aria-selected={kind === "malengo"} onClick={() => void setKind("malengo")}>{t("Malengo", "Targets")}</button>
        <button role="tab" aria-selected={kind === "chakula"} onClick={() => void setKind("chakula")}>{t("Chakula", "Food")}</button>
      </div>
      {kind === "mwezi" ? <MonthlyReport /> : kind === "wiki" ? <WeeklyReport /> : kind === "malengo" ? <Performance /> : <FoodReport />}
    </main>
  );
}
