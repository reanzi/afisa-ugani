import { useState } from "react";
import { Link } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { v7 as uuidv7 } from "uuid";
import {
  ANNUAL_TABLES,
  fyLabel,
  partHasData,
  PAYLOAD_VERSION,
  quarterLabel,
  QUARTERLY_TABLES,
  reportingFy,
  reportingQuarter,
  unconfirmedCarry,
  type Report,
} from "@afisa/shared";
import { ConfirmDialog, errorMessage, ReportView, shortDate, useT } from "@afisa/ui";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useReopened, useSealed } from "../lib/food";
import { useAreaLabel } from "../lib/report";
import { periodWindow, usePeriodicReport, visiblePeriod, type PeriodicKind } from "../lib/periodic";

/** The quarterly or annual report to show now, or null while none is due (the tab stays hidden). */
export function useVisiblePeriodic(kind: PeriodicKind) {
  const sealed = useSealed(kind);
  const reopened = useReopened();
  if (!sealed || !reopened) return undefined;
  const now = Date.now();
  const candidate = kind === "quarterly" ? reportingQuarter(now) : reportingFy(now);
  return visiblePeriod(kind, now, candidate, new Set(sealed.keys()), reopened.filter((s) => s.kind === kind).map((s) => s.period));
}

export function PeriodicReport({ kind }: { kind: PeriodicKind }) {
  const visible = useVisiblePeriodic(kind);
  const t = useT();
  if (visible === undefined) return <p className="muted">{t("Inafungua…", "Opening…")}</p>;
  if (visible === null) return <p className="muted">{t("Ripoti hii itaonekana kipindi chake kikikaribia kuisha.", "This report appears when its period is about to end.")}</p>;
  return <PeriodicReportFor kind={kind} period={visible.period} />;
}

function PeriodicReportFor({ kind, period }: { kind: PeriodicKind; period: string }) {
  const t = useT();
  const { councilId, membership } = useWork();
  const areaLabel = useAreaLabel();
  const { report: live, review, previous } = usePeriodicReport(kind, period);
  const sealed = useSealed(kind)?.get(period) ?? null;
  const reopened = useReopened()?.find((s) => s.kind === kind && s.period === period) ?? null;
  const rejected = useLiveQuery(
    () => db.submissions.where("[councilId+kind+period]").equals([councilId, kind, period]).filter((s) => s.syncState === "rejected").last(),
    [councilId, kind, period],
  );
  const report = sealed ? (sealed.payload as unknown as Report) : live;
  const w = periodWindow(kind, period);
  const now = Date.now();
  const canSend = !sealed && now >= w.opens;
  const autoOn = membership.autoSend?.monthly ?? false;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canShare = typeof navigator.canShare === "function";
  const specs = kind === "quarterly" ? QUARTERLY_TABLES : ANNUAL_TABLES;
  const unchecked = unconfirmedCarry(specs, review, previous).length;
  const typedTables = Object.values(review?.tables ?? {}).filter((tv) => Object.keys(tv).length).length;
  const name = kind === "quarterly" ? quarterLabel(period) : t(`Mwaka wa fedha ${fyLabel(period)}`, `Financial year ${fyLabel(period)}`);
  const what = kind === "quarterly" ? t("ripoti ya robo", "quarterly report") : t("ripoti ya mwaka", "annual report");
  const filled = report ? report.parts.filter(partHasData).length : 0;
  const total = report?.parts.length ?? 0;

  const send = async () => {
    if (!live) return;
    await db.submissions.put({
      clientId: uuidv7(),
      councilId,
      kind,
      period,
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
      const { reportToDocx, reportFileName } = await import("@afisa/ui/docx");
      const blob = await reportToDocx(report);
      const file = reportFileName(report);
      if (mode === "share") {
        const f = new File([blob], file, { type: blob.type });
        if (navigator.canShare?.({ files: [f] })) {
          await navigator.share({ files: [f], title: file });
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const fill = `/ripoti/jaza?aina=${kind === "quarterly" ? "robo" : "mwaka"}&kipindi=${period}`;
  return (
    <div className="monthly">
      <header className="month-head">
        <h2 className="page-title">{kind === "quarterly" ? t(`Ripoti ya robo: ${name}`, `Quarterly report: ${name}`) : t(`Ripoti ya mwaka: ${name}`, `Annual report: ${name}`)}</h2>
      </header>

      {sealed && (
        <div className={`seal${sealed.syncState === "pending" ? " seal-wait" : ""}`} role="status">
          <strong>
            {sealed.syncState === "pending"
              ? t("Imefungwa, inasubiri mtandao", "Locked, waiting for network")
              : `${sealed.auto ? t("Ilitumwa yenyewe", "Sent automatically") : t("Imetumwa makao makuu", "Sent to HQ")} ${shortDate(sealed.submittedAt ?? sealed.clientSubmittedAt)}`}
          </strong>
          <span>{t("Ripoti hii imefungwa. Unaweza kuisoma na kuipakua tu.", "This report is locked. You can only read and download it.")}</span>
        </div>
      )}
      {reopened?.reopened && (
        <div className="seal seal-reopened" role="status">
          <strong>{t("Imerudishwa kwa marekebisho", "Returned for corrections")}</strong>
          <span>{reopened.reopened.byName || t("Makao makuu", "HQ")}: “{reopened.reopened.note}”</span>
        </div>
      )}
      {!sealed && rejected && (
        <div className="notice notice-danger" role="alert"><p>{t("Makao makuu hawakuipokea", "HQ did not accept it")}: {rejected.error ?? t("jaribu tena", "try again")}.</p></div>
      )}

      <section className="report-status">
        <div className="meter" aria-label={t(`Sehemu ${filled} kati ya ${total} zina taarifa`, `${filled} of ${total} parts have data`)}>
          {report?.parts.map((p) => <span key={p.id} className={partHasData(p) ? "on" : undefined} title={`${p.number}. ${p.title}`} />)}
        </div>
        <p>
          <strong>{t(`Sehemu ${filled} kati ya ${total}`, `${filled} of ${total} parts`)}</strong>
          {t(" zina taarifa. Sehemu zisizo na taarifa zitaandikwa 0 kama fomu inavyoelekeza.", " have data. Parts without data will show 0, as the form requires.")}
        </p>
        {!sealed && (
          <>
            <Link to={fill} className={`btn btn-block ${typedTables ? "btn-quiet" : "btn-primary"}`}>
              {typedTables ? t("Endelea kujaza fomu", "Continue filling the form") : t("Jaza fomu", "Fill the form")}
            </Link>
            <p className="muted">
              {kind === "quarterly"
                ? t("Hali ya chakula, vikundi, umwagiliaji, mmomonyoko na eneo kwa njia ya kulima. Mafunzo na udhibiti wa kibaiolojia vimejazwa kutoka kumbukumbu zako.", "Food situation, groups, irrigation, erosion and area by tillage method. Training and biological control are filled from your records.")
                : t("Taarifa za msingi, mashine, skimu, mifugo, miundombinu na mawasiliano. Shamba darasa, mbolea na viatilifu vimejazwa kutoka kumbukumbu zako.", "Basic data, machines, schemes, livestock, infrastructure and communications. Field schools, fertilizer and pesticides are filled from your records.")}
            </p>
            {unchecked > 0 && <p className="tone-wait">{t(`Majedwali ${unchecked} bado yana taarifa za mwaka jana ambazo hujazihakiki.`, `${unchecked} tables still hold last year's figures you have not checked.`)}</p>}
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
                  ? t("Ukimaliza marekebisho, itume tena.", "When you finish the corrections, send it again.")
                  : now > w.due
                    ? t(`Tarehe ya mwisho (${shortDate(w.due)}) imepita. Ukiituma sasa itaonekana imechelewa.`, `The due date (${shortDate(w.due)}) has passed. If you send it now it will show as late.`)
                    : autoOn
                      ? t(`Itume kabla ya ${shortDate(w.due)}. Usipoituma, itatumwa yenyewe siku hiyo saa 5:30 usiku.`, `Send it before ${shortDate(w.due)}. If you don't, it sends itself that day at 11:30 pm.`)
                      : t(`Itume kabla ya ${shortDate(w.due)}.`, `Send it before ${shortDate(w.due)}.`)}
              </p>
              <button className="btn btn-primary btn-block" disabled={!live} onClick={() => setConfirm(true)}>
                {reopened ? t("Tuma tena", "Send again") : kind === "quarterly" ? t("Tuma ripoti ya robo", "Send quarterly report") : t("Tuma ripoti ya mwaka", "Send annual report")}
              </button>
            </>
          ) : (
            <p>{t(`Utaweza kuituma kuanzia ${shortDate(w.opens)}.`, `You can send it from ${shortDate(w.opens)}.`)}</p>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirm}
        title={t(`Tuma ${what}?`, `Send the ${what}?`)}
        confirmLabel={t("Ndiyo, tuma", "Yes, send")}
        onConfirm={() => void send()}
        onCancel={() => setConfirm(false)}
      >
        <p>{t("Ripoti itatumwa makao makuu na kufungwa. Huwezi kuibadilisha baada ya kutuma.", "The report will be sent to HQ and locked. You cannot change it after sending.")}</p>
        {typedTables === 0 && <p><strong>{t("Hujajaza fomu.", "You have not filled the form.")}</strong> {t("Majedwali ya kujaza yataonyesha 0.", "The tables to fill will show 0.")}</p>}
        {unchecked > 0 && <p>{t(`Majedwali ${unchecked} yatatumwa na taarifa za mwaka jana.`, `${unchecked} tables will be sent with last year's figures.`)}</p>}
      </ConfirmDialog>

      {report && <ReportView report={report} />}
    </div>
  );
}
