/**
 * Sign in with the check number; create an account with full name, phone,
 * check number and password. Shared by Field and HQ.
 *
 * convex-auth creates the account from the check number and password only,
 * so the name and phone wait in this browser until the first signed-in screen
 * saves them (takePendingProfile).
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Glide } from "./Glide.tsx";
import {
  cleanName,
  normalizeCheckNumber,
  normalizePhone,
  registrationProblems,
  type RegistrationProblem,
} from "@afisa/shared";
import { authErrorMessage } from "./format";
import { useT } from "./i18n";
import { PasswordInput } from "./PasswordInput";

type Creds = { username: string; password: string };
type AuthResult = { status: string; userError?: { error: string; minimumLength?: number; maximumLength?: number; retryAfterMs?: number } };

const PENDING = "afisa.pendingProfile";

export type PendingProfile = { name: string; phone: string };

export function takePendingProfile(): PendingProfile | null {
  try {
    const raw = localStorage.getItem(PENDING);
    return raw ? (JSON.parse(raw) as PendingProfile) : null;
  } catch {
    return null;
  }
}

export function clearPendingProfile() {
  try {
    localStorage.removeItem(PENDING);
  } catch {
    /* ignore */
  }
}

export function AuthForm({
  registering,
  onModeChange,
  signIn,
  signUp,
  pending,
  requireOnline = false,
  afterRegisterNote,
  registerContent,
}: {
  registering: boolean;
  onModeChange: (registering: boolean) => void;
  signIn: (c: Creds) => Promise<AuthResult>;
  signUp: (c: Creds) => Promise<AuthResult>;
  pending: boolean;
  /** Field: the first sign-in on a phone needs the network. */
  requireOnline?: boolean;
  afterRegisterNote?: ReactNode;
  /** Shown instead of the account fields when creating an account (the join wizard). */
  registerContent?: ReactNode;
}) {
  const t = useT();
  const [checkNumber, setCheckNumber] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [problems, setProblems] = useState<RegistrationProblem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bad = (p: RegistrationProblem) => problems.includes(p);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (requireOnline && !navigator.onLine) {
      setError(t("Unahitaji mtandao kuingia mara ya kwanza. Baada ya hapo programu inafanya kazi bila mtandao.", "You need a connection to sign in the first time. After that the app works offline."));
      return;
    }
    const creds = { username: normalizeCheckNumber(checkNumber), password };
    if (registering) {
      const found = registrationProblems({ name, phone, checkNumber, password });
      setProblems(found);
      if (found.length > 0) return;
      try {
        localStorage.setItem(PENDING, JSON.stringify({ name: cleanName(name), phone: normalizePhone(phone) }));
      } catch {
        /* the officer can type them again on the next screen */
      }
      const res = await signUp(creds);
      if (res.status !== "complete") {
        clearPendingProfile();
        setError(authErrorMessage(res.userError ?? { error: "" }));
      }
      return;
    }
    const res = await signIn({ username: checkNumber.trim().replace(/\s/g, ""), password });
    if (res.status !== "complete") setError(authErrorMessage(res.userError ?? { error: "" }));
  };

  const switchTo = (r: boolean) => {
    setProblems([]);
    setError(null);
    onModeChange(r);
  };

  const tabs = (
    <div className="segmented" role="tablist" aria-label={t("Chagua", "Choose")}>
      <button type="button" role="tab" aria-selected={!registering} onClick={() => switchTo(false)}>
        {t("Ingia", "Sign in")}
      </button>
      <button type="button" role="tab" aria-selected={registering} onClick={() => switchTo(true)}>
        {t("Fungua akaunti", "Create account")}
      </button>
      <Glide />
    </div>
  );

  if (registering && registerContent) {
    return (
      <div className="auth-form stack">
        {tabs}
        {registerContent}
      </div>
    );
  }

  return (
    <form className="auth-form stack" onSubmit={submit} noValidate>
      <div className="segmented" role="tablist" aria-label={t("Chagua", "Choose")}>
        <button type="button" role="tab" aria-selected={!registering} onClick={() => switchTo(false)}>
          {t("Ingia", "Sign in")}
        </button>
        <button type="button" role="tab" aria-selected={registering} onClick={() => switchTo(true)}>
          {t("Fungua akaunti", "Create account")}
        </button>
        <Glide />
      </div>

      {registering && (
        <label className={`field${bad("name") ? " has-error" : ""}`}>
          <span>{t("Jina kamili", "Full name")}</span>
          <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
          <small className={bad("name") ? "field-error" : undefined}>
            {t("Majina mawili au matatu kama yalivyo kwenye kitambulisho cha kazi.", "Two or three names, as on your work ID.")}
          </small>
        </label>
      )}

      <label className={`field${bad("checkNumber") ? " has-error" : ""}`}>
        <span>{t("Namba ya utumishi (Check number)", "Check number")}</span>
        <input
          className="input"
          autoComplete="username"
          inputMode="numeric"
          value={checkNumber}
          onChange={(e) => setCheckNumber(registering ? e.target.value.replace(/[^\d\s]/g, "") : e.target.value)}
          disabled={pending}
        />
        {registering && (
          <small className={bad("checkNumber") ? "field-error" : undefined}>
            {t("Tarakimu 5 hadi 12, kama zilivyo kwenye hati ya mshahara. Utaitumia kuingia.", "5 to 12 digits, as on your payslip. You will sign in with it.")}
          </small>
        )}
      </label>

      {registering && (
        <label className={`field${bad("phone") ? " has-error" : ""}`}>
          <span>{t("Namba ya simu", "Phone number")}</span>
          <input className="input" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={pending} />
          <small className={bad("phone") ? "field-error" : undefined}>{t("Mfano 0712 345 678.", "For example 0712 345 678.")}</small>
        </label>
      )}

      <label className={`field${bad("password") ? " has-error" : ""}`}>
        <span>{t("Nenosiri", "Password")}</span>
        <PasswordInput
          autoComplete={registering ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
        />
        {registering && (
          <small className={bad("password") ? "field-error" : undefined}>
            {t("Herufi 8 au zaidi. Usitumie nenosiri unalotumia kwingine.", "8 or more characters. Do not reuse a password from elsewhere.")}
          </small>
        )}
      </label>

      {error && (
        <div className="notice notice-danger" role="alert">
          <p>{error}</p>
        </div>
      )}

      <button className="btn btn-primary btn-block" disabled={pending || !checkNumber || !password}>
        {pending ? t("Subiri…", "Please wait…") : registering ? t("Fungua akaunti", "Create account") : t("Ingia", "Sign in")}
      </button>
      {registering && afterRegisterNote && <p className="muted small">{afterRegisterNote}</p>}
    </form>
  );
}
