/**
 * Screens before HQ opens: sign in or create an account, ask to join a council
 * with its code, wait for approval.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import { api } from "@afisa/backend/api";
import { HQ_ROLES, isFullName, ROLE_LABELS, SECTIONS, SECTION_LABELS, type Role, type Section } from "@afisa/shared";
import {
  AuthForm,
  clearPendingProfile,
  CodeInput,
  errorMessage,
  Select,
  takePendingProfile,
  useLabel,
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

export function SignIn() {
  const t = useT();
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth);
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth);
  const [registering, setRegistering] = useState(false);

  return (
    <AuthShell>
      <img src="/favicon.svg" alt="" width={44} height={44} />
      <h1>{t("Afisa Ugani, makao makuu", "Afisa Ugani, head office")}</h1>
      <p className="muted">{t("Ripoti za maafisa, maombi, wanachama, maeneo na kumbukumbu za matukio.", "Officers' reports, requests, members, areas and the activity log.")}</p>
      <AuthForm
        registering={registering}
        onModeChange={setRegistering}
        signIn={signIn}
        signUp={signUp}
        pending={signingIn || signingUp}
        afterRegisterNote={t(
          "Baada ya kufungua akaunti utaandika msimbo wa halmashauri yako na cheo chako ili kuomba kujiunga.",
          "After creating the account you will enter your council's code and your position to ask to join.",
        )}
      />
    </AuthShell>
  );
}

export function JoinWithCode({ me }: { me: Me }) {
  const t = useT();
  const label = useLabel();
  const requestJoin = useMutation(api.memberships.requestJoin);
  const { signOut } = useAuthActions();
  const rejected = me.memberships.find((m) => m.status === "rejected");
  const pending = takePendingProfile();
  const [name, setName] = useState(me.name ?? pending?.name ?? "");
  const [phone, setPhone] = useState(me.phone ?? pending?.phone ?? "");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [section, setSection] = useState<Section | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const council = useQuery(api.councils.lookupByCode, code.length >= 6 ? { code } : "skip");
  const ready = isFullName(name) && council && role && section;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await requestJoin({
        councilCode: code.trim(),
        requestedRole: role as Role,
        name: name.trim(),
        phone: phone.trim() || undefined,
        primarySection: section,
        client: hqClient,
      });
      clearPendingProfile();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell wide>
      <form className="stack" onSubmit={submit}>
        <h1>{t("Omba kujiunga na halmashauri", "Ask to join a council")}</h1>
        <p className="muted">{t("Andika msimbo wa halmashauri uliopewa na msimamizi wa mfumo.", "Enter the council code the system administrator gave you.")}</p>
        {rejected?.decisionNote && (
          <div className="notice notice-danger"><p>{t("Ombi la awali halikukubaliwa:", "Your earlier request was not accepted:")} {rejected.decisionNote}</p></div>
        )}
        <div className="field">
          <span className="field-label" id="hq-code">{t("Msimbo wa halmashauri", "Council code")}</span>
          <CodeInput labelledBy="hq-code" value={code} onChange={setCode} autoFocus invalid={code.length === 8 && council === null} />
          {code.length === 8 && council === null && <small className="tone-danger">{t("Msimbo huu haupo. Hakikisha herufi zote 8.", "This code does not exist. Check all 8 characters.")}</small>}
          {council ? <small className="tone-ok">{council.name}, {council.region}</small> : <small>{t("Herufi na namba 8, mfano K7QM-3XPA.", "8 letters and digits, for example K7QM-3XPA.")}</small>}
        </div>
        <label className="field">
          <span>{t("Jina kamili", "Full name")}</span>
          <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("Namba ya simu", "Phone number")}</span>
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label" id="hq-role">{t("Cheo chako", "Your position")}</span>
          <Select labelledBy="hq-role" label={t("Cheo chako", "Your position")} value={role} onChange={(v) => setRole(v as Role)} options={HQ_ROLES.map((r) => ({ value: r, label: label(ROLE_LABELS[r]) }))} />
        </div>
        <fieldset className="field plain">
          <legend>{t("Sehemu yako", "Your section")}</legend>
          <div className="chips">
            {SECTIONS.map((s) => (
              <button type="button" key={s} className={`chip sec sec-${s}`} aria-pressed={section === s} onClick={() => setSection(s)}>
                <span className="sec-tag" aria-hidden />
                {label(SECTION_LABELS[s])}
              </button>
            ))}
          </div>
          <small>{t("Kwa Mkuu wa Idara na Naibu wake, chagua sehemu unayotoka; wataona sehemu zote.", "Heads of Department and their vices: pick the section you come from; you will see all sections.")}</small>
        </fieldset>
        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
        <button className="btn btn-primary btn-block" disabled={!ready || busy}>{busy ? t("Inatuma…", "Sending…") : t("Tuma ombi", "Send request")}</button>
        <button type="button" className="btn btn-quiet btn-block" onClick={() => void signOut()}>{t("Toka", "Sign out")}</button>
      </form>
    </AuthShell>
  );
}

export function Waiting({ me }: { me: Me }) {
  const t = useT();
  const label = useLabel();
  const { signOut } = useAuthActions();
  const m = me.memberships.find((x) => x.status === "pending" || x.status === "suspended")!;
  const suspended = m.status === "suspended";
  const roleName = m.requestedRole ? label(ROLE_LABELS[m.requestedRole]) : t("afisa ugani", "extension officer");
  const approver =
    m.requestedRole === "admin"
      ? t("msimamizi wa mfumo", "the system administrator")
      : m.requestedRole
        ? t("Mkuu wa Idara", "the Head of Department")
        : t("mkuu wa sehemu yako", "your head of section");
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
            `Umeomba kuwa ${roleName} wa ${m.councilName}. Ombi linasubiri idhini ya ${approver}. Ukurasa huu utafunguka wenyewe ukishaidhinishwa.`,
            `You asked to be ${roleName} of ${m.councilName}. The request is waiting for ${approver} to approve it. This page opens by itself once approved.`,
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
