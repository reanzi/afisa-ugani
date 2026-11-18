import { parseAsStringLiteral, useQueryState } from "nuqs";
import { FoodReports } from "./FoodReports";
import { MonthlyReports } from "./MonthlyReports";

const KINDS = ["mwezi", "chakula"] as const;

export function Reports() {
  const [kind, setKind] = useQueryState("aina", parseAsStringLiteral(KINDS).withDefault("mwezi"));
  return (
    <>
      <div className="segmented report-kinds no-print" role="tablist" aria-label="Aina ya ripoti">
        <button role="tab" aria-selected={kind === "mwezi"} onClick={() => void setKind("mwezi")}>Ripoti za mwezi</button>
        <button role="tab" aria-selected={kind === "chakula"} onClick={() => void setKind("chakula")}>Chakula na bei</button>
      </div>
      {kind === "mwezi" ? <MonthlyReports /> : <FoodReports />}
    </>
  );
}
