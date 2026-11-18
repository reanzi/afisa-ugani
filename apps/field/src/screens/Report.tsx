import { useState } from "react";
import { Link } from "react-router";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useLiveQuery } from "dexie-react-hooks";
import { v7 as uuidv7 } from "uuid";
import { monthKey, monthLabel, monthlyWindow, partHasData, PAYLOAD_VERSION, shiftMonth, type Report as ArdsReport } from "@afisa/shared";
import { ConfirmDialog, errorMessage, ReportView, shortDate } from "@afisa/ui";
import { useAreaLabel, useMonthlyReport } from "../lib/report";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useReopened, useSealed } from "../lib/food";
import { FoodReport } from "./FoodReport";

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
        <button className="btn btn-quiet btn-small" onClick={() => void setMonth(shiftMonth(month, -1))} aria-label="Mwezi uliopita">‹</button>
        <h2 className="page-title">Ripoti ya {monthLabel(month)}</h2>
        <button
          className="btn btn-quiet btn-small"
          onClick={() => void setMonth(shiftMonth(month, 1))}
          disabled={month >= current}
          aria-label="Mwezi unaofuata"
        >
          ›
        </button>
      </header>

      {sealed && (
        <div className={`seal${sealed.syncState === "pending" ? " seal-wait" : ""}`} role="status">
          <strong>
            {sealed.syncState === "pending"
              ? "Imefungwa, inasubiri mtandao"
              : `${sealed.auto ? "Ilitumwa yenyewe" : "Imetumwa makao makuu"} ${shortDate(sealed.submittedAt ?? sealed.clientSubmittedAt)}`}
          </strong>
          <span>{sealed.late ? "Ilifika baada ya tarehe 5. " : ""}Ripoti hii imefungwa. Unaweza kuisoma na kuipakua tu.</span>
        </div>
      )}
      {reopened?.reopened && (
        <div className="seal seal-reopened" role="status">
          <strong>Imerudishwa kwa marekebisho</strong>
          <span>{reopened.reopened.byName || "Makao makuu"}: “{reopened.reopened.note}”</span>
          <span>Rekebisha kumbukumbu au majibu ya mwisho wa mwezi, kisha uitume tena.</span>
        </div>
      )}
      {!sealed && rejected && (
        <div className="notice notice-danger" role="alert"><p>Makao makuu hawakuipokea: {rejected.error ?? "jaribu tena"}.</p></div>
      )}

      <section className="report-status">
        <div className="meter" aria-label={`Sehemu ${filled} kati ya ${total} zina taarifa`}>
          {report?.parts.map((p) => (
            <span key={p.id} className={partHasData(p) ? "on" : undefined} title={`${p.number}. ${p.title}`} />
          ))}
        </div>
        <p>
          <strong>Sehemu {filled} kati ya {total}</strong> zina taarifa. Sehemu zisizo na taarifa zitaandikwa 0 kama fomu inavyoelekeza.
        </p>
        {sealed ? (
          <Link to={`/ripoti/majibu?mwezi=${month}`} className="btn btn-block btn-quiet">Soma majibu ya mwisho wa mwezi</Link>
        ) : (
          <>
            <Link to={`/ripoti/majibu?mwezi=${month}`} className={`btn btn-block ${review ? "btn-quiet" : "btn-primary"}`}>
              {review ? "Badili majibu ya mwisho wa mwezi" : "Jibu maswali ya mwisho wa mwezi"}
            </Link>
            {!review && <p className="muted">Hali ya mvua, mafanikio, changamoto na makadirio ya mazao. Dakika chache tu.</p>}
          </>
        )}
        <div className="export-row">
          <button className="btn btn-quiet" disabled={!report || busy !== null} onClick={() => void exportDocx("download")}>
            {busy === "download" ? "Inaandaa…" : "Pakua Word (.docx)"}
          </button>
          {canShare && (
            <button className="btn btn-quiet" disabled={!report || busy !== null} onClick={() => void exportDocx("share")}>
              {busy === "share" ? "Inaandaa…" : "Tuma"}
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
                  ? "Ukimaliza marekebisho, itume tena. Itafungwa tena baada ya kutumwa."
                  : now > window_.due
                  ? "Tarehe 5 imepita. Ukiituma sasa itaonekana imechelewa."
                  : autoOn
                    ? `Itume kabla ya tarehe 5. Usipoituma, itatumwa yenyewe tarehe 5 saa 5:30 usiku.`
                    : "Mwezi umeisha. Itume kabla ya tarehe 5."}
              </p>
              <button className="btn btn-primary btn-block" disabled={!live} onClick={() => setConfirm(true)}>{reopened ? "Tuma tena" : "Tuma ripoti ya mwezi"}</button>
            </>
          ) : (
            <p>Utaweza kuituma kuanzia {shortDate(window_.opens)}, mwezi ukiisha.{autoOn ? " Usipoituma, itatumwa yenyewe tarehe 5." : ""}</p>
          )}
        </section>
      )}

      <ConfirmDialog open={confirm} title={`Tuma ripoti ya ${monthLabel(month)}?`} confirmLabel="Ndiyo, tuma" onConfirm={() => void send()} onCancel={() => setConfirm(false)}>
        <p>Ripoti itatumwa makao makuu na kufungwa. Huwezi kuibadilisha baada ya kutuma.</p>
        {!review && <p><strong>Hujajibu maswali ya mwisho wa mwezi.</strong> Sehemu za mvua, mafanikio na changamoto zitakuwa tupu.</p>}
      </ConfirmDialog>

      {report && <ReportView report={report} />}
    </div>
  );
}

const KINDS = ["mwezi", "chakula"] as const;

export function Report() {
  const [kind, setKind] = useQueryState("aina", parseAsStringLiteral(KINDS).withDefault("mwezi"));
  return (
    <main className="page">
      <div className="segmented report-kinds" role="tablist" aria-label="Aina ya ripoti">
        <button role="tab" aria-selected={kind === "mwezi"} onClick={() => void setKind("mwezi")}>Ripoti ya mwezi</button>
        <button role="tab" aria-selected={kind === "chakula"} onClick={() => void setKind("chakula")}>Chakula na bei</button>
      </div>
      {kind === "mwezi" ? <MonthlyReport /> : <FoodReport />}
    </main>
  );
}
