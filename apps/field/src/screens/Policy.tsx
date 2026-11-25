import { useNavigate } from "react-router";
import { PolicyView, useT } from "@afisa/ui";

/** The usage policy, to read again any time from Mimi. */
export function Policy() {
  const navigate = useNavigate();
  const t = useT();
  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/mimi", { replace: true }));
  return (
    <main className="page narrow policy-gate">
      <button type="button" className="back" onClick={goBack}>{t("Rudi", "Back")}</button>
      <PolicyView />
    </main>
  );
}
