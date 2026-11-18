import { useAuthActions } from "@convex-dev/auth/react";
import { SECTION_LABELS } from "@afisa/shared";
import type { MembershipInfo } from "../lib/session";

export function Waiting({ membership, name }: { membership: MembershipInfo; name: string | null }) {
  const { signOut } = useAuthActions();
  const suspended = membership.status === "suspended";
  return (
    <main className="page narrow">
      <h1 className="page-title">{suspended ? "Akaunti imesitishwa" : "Ombi lako limepokelewa"}</h1>
      <div className={`notice ${suspended ? "notice-danger" : "notice-wait"}`} role="status">
        {suspended ? (
          <p>
            Huwezi kuandika kumbukumbu kwa sasa. Wasiliana na mkuu wa sehemu ya {SECTION_LABELS[membership.primarySection].sw}.
            {membership.decisionNote ? ` Sababu: ${membership.decisionNote}` : ""}
          </p>
        ) : (
          <p>
            {name ? `${name}, ` : ""}mkuu wa sehemu ya {SECTION_LABELS[membership.primarySection].sw} wa {membership.councilName}
            {" "}ataidhinisha ombi lako na kukupangia maeneo ya kazi. Fungua programu tena baadaye.
          </p>
        )}
      </div>
      <button className="btn btn-quiet btn-block" onClick={() => void signOut()}>
        Toka
      </button>
    </main>
  );
}
