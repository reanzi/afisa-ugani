/**
 * Screens before HQ opens: sign in or create an account, ask to join a council
 * with its code, wait for approval.
 */
import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import {
  AuthForm,
  clearPendingProfile,
  authErrorMessage,
  clearPendingJoin,
  errorMessage,
  JoinWizard,
  savePendingJoin,
  useAutoJoin,
  type JoinAnswers,
  type PendingJoin,
  type SignUpAnswers,
  takePendingProfile,
  useT,
} from "@afisa/ui";
import { hqClient, type Me } from "./context";
import { LangSwitch } from "./LangSwitch";

function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="hq-auth">
      <div className="hq-auth-lang"><LangSwitch /></div>
      <div className={`hq-auth-card${wide ? " wide" : ""}`}>{children}</div>
    </main>
  );
}

type SignUpFn = ReturnType<typeof useSignUpWithUsernamePassword>["signUp"];

/** A new account in the join steps; the request is sent once signed in (JoinWithCode). */
function SignUp({ signUp, pending, onHaveAccount }: { signUp: SignUpFn; pending: boolean; onHaveAccount: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const council = useQuery(api.councils.lookupByCode, code.length === 8 ? { code } : "skip");

  const submit = async (a: SignUpAnswers) => {
    setError(null);
    savePendingJoin({ code: a.code, section: a.section, areaId: a.areaId, areaLabel: a.areaLabel, name: a.name, phone: a.phone });
    const res = await signUp({ username: a.checkNumber, password: a.password });
    if (res.status !== "complete") {
      clearPendingJoin();
      setError(authErrorMessage(res.userError ?? { error: "" }));
    }
  };

  return (
    <JoinWizard
      newAccount
      code={code}
      onCodeChange={setCode}
      council={code.length === 8 ? council : undefined}
      areas={[]}
      askLocation={false}
      defaultName=""
      defaultPhone=""
      checkNumber={null}
      rejectedNote={null}
      busy={pending}
      error={error}
      onSubmit={(a) => void submit(a)}
      onSignOut={onHaveAccount}
    />
  );
}

export function SignIn() {
  const t = useT();
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth);
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth);
  const [registering, setRegistering] = useState(false);

  return (
    <AuthShell wide={registering}>
      <img src="/favicon.svg" alt="" width={44} height={44} />
      <h1>{t("Afisa Ugani, makao makuu", "Afisa Ugani, head office")}</h1>
      <p className="muted">{t("Ripoti za maafisa, maombi, wanachama, maeneo na kumbukumbu za matukio.", "Officers' reports, requests, members, areas and the activity log.")}</p>
      <AuthForm
        registering={registering}
        onModeChange={setRegistering}
        signIn={signIn}
        signUp={signUp}
        pending={signingIn || signingUp}
        registerContent={<SignUp signUp={signUp} pending={signingUp} onHaveAccount={() => setRegistering(false)} />}
      />
    </AuthShell>
  );
}

export function JoinWithCode({ me }: { me: Me }) {
  const t = useT();
  const requestJoin = useMutation(api.memberships.requestJoin);
  const { signOut } = useAuthActions();
  const rejected = me.memberships.find((m) => m.status === "rejected");
  const [pending] = useState(takePendingProfile);

  const send = useCallback(
    async (p: PendingJoin) => {
      await requestJoin({
        councilCode: p.code,
        name: p.name,
        phone: p.phone || undefined,
        primarySection: p.section,
        requestedAreaId: p.areaId ? (p.areaId as Id<"areas">) : undefined,
        areaHint: p.areaLabel,
        client: hqClient,
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
  const code = typed ?? earlier?.code ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const council = useQuery(api.councils.lookupByCode, code.length === 8 ? { code } : "skip");

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
      <AuthShell>
        <p className="muted">{t("Inatuma ombi lako…", "Sending your request…")}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell wide>
      <JoinWizard
        header={
          <header className="join-head">
            <h1>{t("Omba kujiunga na halmashauri", "Ask to join a council")}</h1>
            <p className="muted">{t("Utaingia kama mgeni hadi upewe cheo na msimamizi wa mfumo au Mkuu wa Idara.", "You join as a guest until the system administrator or the Head of Department gives you a position.")}</p>
          </header>
        }
        code={code}
        onCodeChange={setCode}
        council={code.length === 8 ? council : undefined}
        areas={[]}
      askLocation={false}
        defaultName={me.name ?? earlier?.name ?? pending?.name ?? ""}
        defaultPhone={me.phone ?? earlier?.phone ?? pending?.phone ?? ""}
        checkNumber={me.checkNumber}
        rejectedNote={rejected?.decisionNote ?? null}
        initial={earlier ? { section: earlier.section, areaId: earlier.areaId } : undefined}
        busy={busy}
        error={error ?? auto.failed?.error ?? null}
        onSubmit={(a) => void submit(a)}
        onSignOut={() => void signOut()}
      />
    </AuthShell>
  );
}

export function Waiting({ me }: { me: Me }) {
  const t = useT();
  const { signOut } = useAuthActions();
  const m = me.memberships.find((x) => x.status === "pending" || x.status === "suspended")!;
  const suspended = m.status === "suspended";
  return (
    <AuthShell>
      <h1>{suspended ? t("Akaunti imesitishwa", "Account suspended") : t("Ombi lako linasubiri", "Your request is waiting")}</h1>
      {suspended ? (
        <p>
          {t("Huwezi kutumia makao makuu kwa sasa.", "You cannot use head office for now.")}
          {m.decisionNote ? ` ${t("Sababu:", "Reason:")} ${m.decisionNote}` : ""}
        </p>
      ) : (
        <p>
          {t(
            `Umeomba kujiunga na ${m.councilName} na kwa sasa wewe ni mgeni. Msimamizi wa mfumo au Mkuu wa Idara atakupa cheo. Ukurasa huu utafunguka wenyewe ukishaidhinishwa.`,
            `You asked to join ${m.councilName} and are a guest for now. The system administrator or the Head of Department will give you a position. This page opens by itself once approved.`,
          )}
        </p>
      )}
      <button className="btn btn-quiet btn-block" onClick={() => void signOut()}>{t("Toka", "Sign out")}</button>
    </AuthShell>
  );
}

export function NoAccess() {
  const t = useT();
  const { signOut } = useAuthActions();
  return (
    <AuthShell>
      <h1>{t("Huna ruhusa ya makao makuu", "No head office access")}</h1>
      <p>{t("Akaunti hii ni ya afisa ugani. Tumia programu ya Afisa Ugani kwenye simu kuandika kazi zako.", "This is an extension officer's account. Use the Afisa Ugani app on your phone to record your work.")}</p>
      <button className="btn btn-quiet btn-block" onClick={() => void signOut()}>{t("Toka", "Sign out")}</button>
    </AuthShell>
  );
}
