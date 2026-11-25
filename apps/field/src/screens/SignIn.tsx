import { useState } from "react";
import { useQuery } from "convex/react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import { api } from "@afisa/backend/api";
import { AuthForm, authErrorMessage, clearPendingJoin, JoinWizard, savePendingJoin, useT, type SignUpAnswers } from "@afisa/ui";

const modes = ["ingia", "jisajili"] as const;

type SignUpFn = ReturnType<typeof useSignUpWithUsernamePassword>["signUp"];

/**
 * A new account in the same three steps as joining: council code, section and
 * area, then the person and their sign-in details. The account is created
 * first; the request is sent by the first signed-in screen (Join, useAutoJoin).
 */
function SignUp({ signUp, pending, onHaveAccount }: { signUp: SignUpFn; pending: boolean; onHaveAccount: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const council = useQuery(api.councils.lookupByCode, code.length === 8 ? { code } : "skip");
  const areas = useQuery(api.councils.joinAreas, council && !council.blocked ? { code } : "skip");

  const submit = async (a: SignUpAnswers) => {
    setError(null);
    if (!navigator.onLine) {
      setError(t("Unahitaji mtandao kufungua akaunti. Baada ya hapo programu inafanya kazi bila mtandao.", "You need a connection to create an account. After that the app works offline."));
      return;
    }
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
      areas={areas}
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
  const [mode, setMode] = useQueryState("hatua", parseAsStringLiteral(modes).withDefault("ingia"));
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth);
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth);
  const t = useT();

  return (
    <main className="auth">
      <header className="auth-head">
        <img src="/favicon.svg" alt="" width={56} height={56} />
        <h1>Afisa Ugani</h1>
        <p>{t("Andika kazi ya leo. Ripoti ya mwezi itajijenga yenyewe.", "Record today's work. The monthly report builds itself.")}</p>
      </header>
      <AuthForm
        registering={mode === "jisajili"}
        onModeChange={(r) => void setMode(r ? "jisajili" : "ingia")}
        signIn={signIn}
        signUp={signUp}
        pending={signingIn || signingUp}
        requireOnline
        registerContent={<SignUp signUp={signUp} pending={signingUp} onHaveAccount={() => void setMode("ingia")} />}
      />
    </main>
  );
}
