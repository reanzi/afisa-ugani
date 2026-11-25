/**
 * Section sign-up codes in the side menu, to share with new staff: all three
 * for the Head of Department (and vice) and root, your own section otherwise.
 * Someone who signs up with a section code lands in that section.
 */
import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import { formatCouncilCode, SECTION_LABELS } from "@afisa/shared";
import { useLabel, useT } from "@afisa/ui";
import { hqClient, useHq } from "./context";
import { CopyCode } from "./CopyCode";

export function SectionCodes() {
  const t = useT();
  const label = useLabel();
  const { councilId } = useHq();
  const data = useQuery(api.councils.myCodes, { councilId });
  const prepare = useMutation(api.councils.prepareSectionCodes);
  const asked = useRef<string | null>(null);

  // Councils made before section codes: make them once, quietly.
  useEffect(() => {
    if (data?.missing && asked.current !== councilId) {
      asked.current = councilId;
      void prepare({ councilId, client: hqClient }).catch(() => undefined);
    }
  }, [data?.missing, councilId, prepare]);

  if (!data || data.codes.length === 0) return null;
  return (
    <section className="side-codes" aria-labelledby="side-codes-title">
      <h2 id="side-codes-title" className="side-codes-title">
        {data.codes.length > 1 ? t("Misimbo ya usajili", "Sign-up codes") : t("Msimbo wa usajili", "Sign-up code")}
      </h2>
      <ul>
        {data.codes.map((c) => (
          <li key={c.section} className={`sec sec-${c.section}`}>
            <span className="side-code-sec">{label(SECTION_LABELS[c.section])}</span>
            <span className="side-code">{formatCouncilCode(c.code)}</span>
            <CopyCode code={c.code} compact />
          </li>
        ))}
      </ul>
      <p className="side-codes-hint">{t("Mpe mtumishi mpya ajisajili nao.", "Give it to new staff to sign up with.")}</p>
    </section>
  );
}
