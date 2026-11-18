import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useT } from "@afisa/ui";
import { FoodReports } from "./FoodReports";
import { MonthlyReports } from "./MonthlyReports";

const KINDS = ["mwezi", "chakula"] as const;

export function Reports() {
  const t = useT();
  const [kind, setKind] = useQueryState("aina", parseAsStringLiteral(KINDS).withDefault("mwezi"));
  return (
    <>
      <div className="segmented report-kinds no-print" role="tablist" aria-label={t("Aina ya ripoti", "Kind of report")}>
        <button role="tab" aria-selected={kind === "mwezi"} onClick={() => void setKind("mwezi")}>{t("Ripoti za mwezi", "Monthly reports")}</button>
        <button role="tab" aria-selected={kind === "chakula"} onClick={() => void setKind("chakula")}>{t("Chakula na bei", "Food and prices")}</button>
      </div>
      {kind === "mwezi" ? <MonthlyReports /> : <FoodReports />}
    </>
  );
}
