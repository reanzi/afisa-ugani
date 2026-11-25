import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { clearPendingProfile, errorMessage, JoinWizard, takePendingProfile, useAutoJoin, useT, type JoinAnswers, type PendingJoin } from "@afisa/ui";
import { clientMeta } from "../lib/client";

/**
 * Ask to join a council: code, then section and area, then name. Everyone
 * joins as a guest. Right after sign-up the saved request is sent by itself.
 */
export function Join({ rejectedNote, defaultName, defaultPhone, checkNumber }: { rejectedNote: string | null; defaultName: string | null; defaultPhone: string | null; checkNumber: string | null }) {
  // Typed when the account was created, before the server knew who this is.
  const [pending] = useState(takePendingProfile);
  const requestJoin = useMutation(api.memberships.requestJoin);
  const { signOut } = useAuthActions();

  const send = useCallback(
    async (p: PendingJoin) => {
      await requestJoin({
        councilCode: p.code,
        name: p.name,
        phone: p.phone || undefined,
        primarySection: p.section,
        requestedAreaId: p.areaId ? (p.areaId as Id<"areas">) : undefined,
        areaHint: p.areaLabel,
        client: await clientMeta(),
      });
      clearPendingProfile();
    },
    [requestJoin],
  );
  const auto = useAutoJoin(async (p) => {
    try {
      await send(p);
    } catch (e) {
      throw new Error(errorMessage(e));
    }
  });

  const earlier = auto.failed?.pending;
  const [typed, setCode] = useState<string | null>(null);
  // The code from sign-up, until they type another.
  const code = typed ?? earlier?.code ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const council = useQuery(api.councils.lookupByCode, code.length === 8 ? { code } : "skip");
  const areas = useQuery(api.councils.joinAreas, council && !council.blocked ? { code } : "skip");

  const submit = async (a: JoinAnswers) => {
    setBusy(true);
    setError(null);
    try {
      await send({ ...a, code });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (auto.sending) {
    return (
      <main className="center-screen" aria-busy="true">
        <p>{t("Inatuma ombi lako…", "Sending your request…")}</p>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <JoinWizard
        header={
          <header>
            <h1 className="page-title">{t("Omba kujiunga", "Request to join")}</h1>
            <p className="lead">{t("Utaingia kama mgeni. Makao makuu watakupa cheo na maeneo ya kazi.", "You join as a guest. HQ will give you a role and work areas.")}</p>
          </header>
        }
        code={code}
        onCodeChange={setCode}
        council={code.length === 8 ? council : undefined}
        areas={areas}
        defaultName={defaultName ?? earlier?.name ?? pending?.name ?? ""}
        defaultPhone={defaultPhone ?? earlier?.phone ?? pending?.phone ?? ""}
        checkNumber={checkNumber}
        rejectedNote={rejectedNote}
        initial={earlier ? { section: earlier.section, areaId: earlier.areaId } : undefined}
        busy={busy}
        error={error ?? auto.failed?.error ?? null}
        onSubmit={(a) => void submit(a)}
        onSignOut={() => void signOut()}
      />
    </main>
  );
}
