import { useNavigate } from "react-router";
import { PolicyView } from "@afisa/ui";

/** The usage policy, to read again any time from Mimi. */
export function Policy() {
  const navigate = useNavigate();
  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/mimi", { replace: true }));
  return (
    <main className="page narrow policy-gate">
      <button type="button" className="back" onClick={goBack}>Rudi</button>
      <PolicyView />
    </main>
  );
}
