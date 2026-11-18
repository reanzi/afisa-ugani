import { useState } from "react";
import { Link } from "react-router";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { monthKey, monthLabel, partHasData, shiftMonth } from "@afisa/shared";
import { errorMessage } from "@afisa/ui";
import { useMonthlyReport } from "../lib/report";
import { ReportView } from "./ReportView";
import { FoodReport } from "./FoodReport";

export function useMonthParam() {
  const current = monthKey(new Date());
  const [raw, setMonth] = useQueryState("mwezi", parseAsString.withDefault(current));
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= current ? raw : current;
  return { month, setMonth, current };
}

function MonthlyReport() {
  const { month, setMonth, current } = useMonthParam();
  const { report, review } = useMonthlyReport(month);
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
      const { reportToDocx, reportFileName } = await import("../lib/docx");
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

      <section className="report-status">
        <div className="meter" aria-label={`Sehemu ${filled} kati ya ${total} zina taarifa`}>
          {report?.parts.map((p) => (
            <span key={p.id} className={partHasData(p) ? "on" : undefined} title={`${p.number}. ${p.title}`} />
          ))}
        </div>
        <p>
          <strong>Sehemu {filled} kati ya {total}</strong> zina taarifa. Sehemu zisizo na taarifa zitaandikwa 0 kama fomu inavyoelekeza.
        </p>
        <Link to={`/ripoti/majibu?mwezi=${month}`} className={`btn btn-block ${review ? "btn-quiet" : "btn-primary"}`}>
          {review ? "Badili majibu ya mwisho wa mwezi" : "Jibu maswali ya mwisho wa mwezi"}
        </Link>
        {!review && <p className="muted">Hali ya mvua, mafanikio, changamoto na makadirio ya mazao. Dakika chache tu.</p>}
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
