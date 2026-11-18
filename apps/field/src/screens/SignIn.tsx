import { useState, type FormEvent } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import { api } from "@afisa/backend/api";
import { authErrorMessage } from "@afisa/ui";

const modes = ["ingia", "jisajili"] as const;

export function SignIn() {
  const [mode, setMode] = useQueryState("hatua", parseAsStringLiteral(modes).withDefault("ingia"));
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth);
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = signingIn || signingUp;
  const registering = mode === "jisajili";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!navigator.onLine) {
      setError("Unahitaji mtandao kuingia mara ya kwanza. Baada ya hapo programu inafanya kazi bila mtandao.");
      return;
    }
    const creds = { username: username.trim(), password };
    const result = registering ? await signUp(creds) : await signIn(creds);
    if (result.status !== "complete") setError(authErrorMessage(result.userError));
  };

  return (
    <main className="auth">
      <header className="auth-head">
        <img src="/favicon.svg" alt="" width={56} height={56} />
        <h1>Afisa Ugani</h1>
        <p>Andika kazi ya leo. Ripoti ya mwezi itajijenga yenyewe.</p>
      </header>

      <div className="segmented" role="tablist" aria-label="Chagua">
        <button role="tab" aria-selected={!registering} onClick={() => void setMode("ingia")}>
          Ingia
        </button>
        <button role="tab" aria-selected={registering} onClick={() => void setMode("jisajili")}>
          Jisajili
        </button>
      </div>

      <form className="stack" onSubmit={submit} noValidate>
        <label className="field">
          <span>Jina la mtumiaji</span>
          <input
            id="username"
            name="username"
            className="input"
            autoComplete="username"
            inputMode="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={pending}
          />
          <small>Tumia namba yako ya simu, mfano 0712345678.</small>
        </label>
        <label className="field">
          <span>Nenosiri</span>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete={registering ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={pending}
          />
          {registering && <small>Herufi 8 au zaidi. Usitumie nenosiri unalotumia kwingine.</small>}
        </label>

        {error && (
          <div className="notice notice-danger" role="alert">
            <p>{error}</p>
          </div>
        )}

        <button className="btn btn-primary btn-block" disabled={pending || !username || !password}>
          {pending ? "Subiri…" : registering ? "Fungua akaunti" : "Ingia"}
        </button>
      </form>
      {registering && (
        <p className="muted">
          Baada ya kufungua akaunti utachagua halmashauri na sehemu yako. Mkuu wa sehemu ataidhinisha ombi lako.
        </p>
      )}
    </main>
  );
}
