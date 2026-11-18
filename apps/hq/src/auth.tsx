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
import { HQ_ROLES, ROLE_LABELS, SECTIONS, SECTION_LABELS, type Role, type Section } from "@afisa/shared";
import { authErrorMessage, errorMessage, Select } from "@afisa/ui";
import { hqClient, type Me } from "./context";

export function SignIn() {
  const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth);
  const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth);
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = signingIn || signingUp;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const creds = { username: username.trim(), password };
    const res = registering ? await signUp(creds) : await signIn(creds);
    if (res.status !== "complete") setError(authErrorMessage(res.userError));
  };

  return (
    <main className="hq-auth">
      <form className="hq-auth-card" onSubmit={submit}>
        <img src="/favicon.svg" alt="" width={44} height={44} />
        <h1>Afisa Ugani, makao makuu</h1>
        <p className="muted">Maombi ya maafisa, wanachama, maeneo na kumbukumbu za matukio.</p>
        <div className="segmented" role="tablist" aria-label="Chagua">
          <button type="button" role="tab" aria-selected={!registering} onClick={() => setRegistering(false)}>Ingia</button>
          <button type="button" role="tab" aria-selected={registering} onClick={() => setRegistering(true)}>Fungua akaunti</button>
        </div>
        <label className="field">
          <span>Jina la mtumiaji</span>
          <input id="username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          {registering && <small>Tumia namba yako ya simu, mfano 0712345678.</small>}
        </label>
        <label className="field">
          <span>Nenosiri</span>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete={registering ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {registering && <small>Herufi 8 au zaidi.</small>}
        </label>
        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
        <button className="btn btn-primary btn-block" disabled={pending || !username || !password}>
          {pending ? "Subiri…" : registering ? "Fungua akaunti" : "Ingia"}
        </button>
        {registering && (
          <p className="muted small">Baada ya kufungua akaunti utaandika msimbo wa halmashauri yako na cheo chako ili kuomba kujiunga.</p>
        )}
      </form>
    </main>
  );
}

export function JoinWithCode({ me }: { me: Me }) {
  const requestJoin = useMutation(api.memberships.requestJoin);
  const { signOut } = useAuthActions();
  const rejected = me.memberships.find((m) => m.status === "rejected");
  const [name, setName] = useState(me.name ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [section, setSection] = useState<Section | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const council = useQuery(api.councils.lookupByCode, code.trim().length >= 3 ? { code } : "skip");
  const ready = name.trim().length >= 3 && council && role && section;

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
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="hq-auth">
      <form className="hq-auth-card wide" onSubmit={submit}>
        <h1>Omba kujiunga na halmashauri</h1>
        <p className="muted">Andika msimbo wa halmashauri uliopewa na msimamizi wa mfumo.</p>
        {rejected?.decisionNote && (
          <div className="notice notice-danger"><p>Ombi la awali halikukubaliwa: {rejected.decisionNote}</p></div>
        )}
        <label className="field">
          <span>Msimbo wa halmashauri</span>
          <input className="input code-input" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="mfano: BAGAMOYO-TC" />
          {code.trim().length >= 3 && council === null && <small className="tone-danger">Msimbo huu haupo.</small>}
          {council && <small className="tone-ok">{council.name}, {council.region}</small>}
        </label>
        <label className="field">
          <span>Jina kamili</span>
          <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Namba ya simu (si lazima)</span>
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label" id="hq-role">Cheo chako</span>
          <Select labelledBy="hq-role" label="Cheo chako" value={role} onChange={(v) => setRole(v as Role)} options={HQ_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r].sw }))} />
        </div>
        <fieldset className="field plain">
          <legend>Sehemu yako</legend>
          <div className="chips">
            {SECTIONS.map((s) => (
              <button type="button" key={s} className={`chip sec sec-${s}`} aria-pressed={section === s} onClick={() => setSection(s)}>
                <span className="sec-tag" aria-hidden />
                {SECTION_LABELS[s].sw}
              </button>
            ))}
          </div>
          <small>Kwa Mkuu wa Idara na Naibu wake, chagua sehemu unayotoka; wataona sehemu zote.</small>
        </fieldset>
        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
        <button className="btn btn-primary btn-block" disabled={!ready || busy}>{busy ? "Inatuma…" : "Tuma ombi"}</button>
        <button type="button" className="btn btn-quiet btn-block" onClick={() => void signOut()}>Toka</button>
      </form>
    </main>
  );
}

export function Waiting({ me }: { me: Me }) {
  const { signOut } = useAuthActions();
  const m = me.memberships.find((x) => x.status === "pending" || x.status === "suspended")!;
  const suspended = m.status === "suspended";
  return (
    <main className="hq-auth">
      <div className="hq-auth-card">
        <h1>{suspended ? "Akaunti imesitishwa" : "Ombi lako linasubiri"}</h1>
        {suspended ? (
          <p>Huwezi kutumia makao makuu kwa sasa.{m.decisionNote ? ` Sababu: ${m.decisionNote}` : ""}</p>
        ) : (
          <p>
            Umeomba kuwa {m.requestedRole ? ROLE_LABELS[m.requestedRole].sw : "afisa ugani"} wa {m.councilName}. Ombi linasubiri idhini ya{" "}
            {m.requestedRole === "admin" ? "msimamizi wa mfumo" : m.requestedRole ? "Mkuu wa Idara" : "mkuu wa sehemu yako"}.
            Ukurasa huu utafunguka wenyewe ukishaidhinishwa.
          </p>
        )}
        <button className="btn btn-quiet btn-block" onClick={() => void signOut()}>Toka</button>
      </div>
    </main>
  );
}

export function NoAccess() {
  const { signOut } = useAuthActions();
  return (
    <main className="hq-auth">
      <div className="hq-auth-card">
        <h1>Huna ruhusa ya makao makuu</h1>
        <p>Akaunti hii ni ya afisa ugani. Tumia programu ya Afisa Ugani kwenye simu kuandika kazi zako.</p>
        <button className="btn btn-quiet btn-block" onClick={() => void signOut()}>Toka</button>
      </div>
    </main>
  );
}
