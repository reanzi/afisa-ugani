import { useRef, useState } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useT } from "@afisa/ui";
import { FoodReports } from "./FoodReports";
import { MonthlyReports } from "./MonthlyReports";
import { WeeklyReports } from "./WeeklyReports";
import { PeriodicReports } from "./PeriodicReports";
import { Reader, type ReaderDoc } from "../reader/Reader";

const KINDS = ["mwezi", "robo", "mwaka", "wiki", "chakula"] as const;

export function Reports() {
  const t = useT();
  const [kind, setKind] = useQueryState("aina", parseAsStringLiteral(KINDS).withDefault("mwezi"));
  const file = useRef<HTMLInputElement>(null);
  const [pdf, setPdf] = useState<ReaderDoc | null>(null);

  // A PDF from this computer (a guide, a circular): read here, never uploaded.
  const openPdf = async (f: File | undefined) => {
    if (!f) return;
    setPdf({ kind: "pdf", title: f.name, subtitle: t("Faili kutoka kompyuta hii", "A file from this computer"), data: await f.arrayBuffer() });
    if (file.current) file.current.value = "";
  };

  return (
    <>
      <div className="reports-bar no-print">
        <div className="segmented report-kinds" role="tablist" aria-label={t("Aina ya ripoti", "Kind of report")}>
          <button role="tab" aria-selected={kind === "mwezi"} onClick={() => void setKind("mwezi")}>{t("Ripoti za mwezi", "Monthly reports")}</button>
          <button role="tab" aria-selected={kind === "robo"} onClick={() => void setKind("robo")}>{t("Za robo", "Quarterly")}</button>
          <button role="tab" aria-selected={kind === "mwaka"} onClick={() => void setKind("mwaka")}>{t("Za mwaka", "Annual")}</button>
          <button role="tab" aria-selected={kind === "wiki"} onClick={() => void setKind("wiki")}>{t("Ripoti za wiki", "Weekly reports")}</button>
          <button role="tab" aria-selected={kind === "chakula"} onClick={() => void setKind("chakula")}>{t("Chakula na bei", "Food and prices")}</button>
        </div>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => file.current?.click()}>
          {t("Soma PDF", "Read a PDF")}
        </button>
        <input ref={file} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void openPdf(e.target.files?.[0])} />
      </div>
      {kind === "mwezi" ? (
        <MonthlyReports />
      ) : kind === "robo" ? (
        <PeriodicReports kind="quarterly" />
      ) : kind === "mwaka" ? (
        <PeriodicReports kind="annual" />
      ) : kind === "wiki" ? (
        <WeeklyReports />
      ) : (
        <FoodReports />
      )}
      {pdf && <Reader doc={pdf} onClose={() => setPdf(null)} />}
    </>
  );
}
