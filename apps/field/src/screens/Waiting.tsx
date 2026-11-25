import { useAuthActions } from "@convex-dev/auth/react";
import { SECTION_LABELS } from "@afisa/shared";
import { useLabel, useT } from "@afisa/ui";
import type { MembershipInfo } from "../lib/session";

export function Waiting({ membership, name }: { membership: MembershipInfo; name: string | null }) {
  const { signOut } = useAuthActions();
  const suspended = membership.status === "suspended";
  const t = useT();
  const label = useLabel();
  const section = label(SECTION_LABELS[membership.primarySection]);
  return (
    <main className="page narrow">
      <h1 className="page-title">{suspended ? t("Akaunti imesitishwa", "Account suspended") : t("Ombi lako limepokelewa", "Your request was received")}</h1>
      <div className={`notice ${suspended ? "notice-danger" : "notice-wait"}`} role="status">
        {suspended ? (
          <p>
            {t(
              `Huwezi kuandika kumbukumbu kwa sasa. Wasiliana na mkuu wa sehemu ya ${section}.`,
              `You cannot record activities for now. Contact the head of the ${section} section.`,
            )}
            {membership.decisionNote ? ` ${t("Sababu", "Reason")}: ${membership.decisionNote}` : ""}
          </p>
        ) : (
          <p>
            {name ? `${name}, ` : ""}
            {t(
              `ombi lako la kujiunga na ${membership.councilName} limepokelewa. Mkuu wa sehemu ya ${section} au Mkuu wa Idara atakupa cheo na maeneo ya kazi. Fungua programu tena baadaye.`,
              `your request to join ${membership.councilName} was received. The head of the ${section} section or the Head of Department will give you a role and work areas. Open the app again later.`,
            )}
          </p>
        )}
      </div>
      <button className="btn btn-quiet btn-block" onClick={() => void signOut()}>
        {t("Toka", "Sign out")}
      </button>
    </main>
  );
}
