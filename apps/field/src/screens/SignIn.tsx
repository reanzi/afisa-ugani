import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import { api } from "@afisa/backend/api";
import { AuthForm } from "@afisa/ui";

const modes = ["ingia", "jisajili"] as const;

export function SignIn() {
  const [mode, setMode] = useQueryState("hatua", parseAsStringLiteral(modes).withDefault("ingia"));
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth);
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth);

  return (
    <main className="auth">
      <header className="auth-head">
        <img src="/favicon.svg" alt="" width={56} height={56} />
        <h1>Afisa Ugani</h1>
        <p>Andika kazi ya leo. Ripoti ya mwezi itajijenga yenyewe.</p>
      </header>
      <AuthForm
        registering={mode === "jisajili"}
        onModeChange={(r) => void setMode(r ? "jisajili" : "ingia")}
        signIn={signIn}
        signUp={signUp}
        pending={signingIn || signingUp}
        requireOnline
        afterRegisterNote="Baada ya kufungua akaunti utachagua halmashauri na sehemu yako. Mkuu wa sehemu ataidhinisha ombi lako."
      />
    </main>
  );
}
