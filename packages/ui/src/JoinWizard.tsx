/**
 * Asking to join a council, in three steps, shared by HQ and the Field app:
 *   1. the council code,
 *   2. the section and where they work (ward, then village),
 *   3. who they are.
 * Nobody picks a role: they join as a guest and HQ gives the role later.
 * Data comes from the app (it owns the Convex queries); this is the screen.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  cleanName,
  designationLabel,
  isFullName,
  normalizeCheckNumber,
  normalizePhone,
  registrationProblems,
  SECTIONS,
  SECTION_LABELS,
  type RegistrationProblem,
  type Section,
} from "@afisa/shared";
import { CodeInput } from "./CodeInput";
import { PasswordInput } from "./PasswordInput";
import { Select } from "./Select";
import { useLabel, useT } from "./i18n";

/** What a typed code opened. `section` is set for a section code: it decides the section. */
export type JoinCouncil = { name: string; region: string; blocked: string | null; section?: Section | null };
export type JoinArea = { _id: string; kind: "ward" | "village"; name: string; parentId: string | null };
export type JoinAnswers = {
  section: Section;
  /** The village when chosen, otherwise the ward. */
  areaId: string;
  areaLabel: string;
  name: string;
  phone: string;
};

/** A new account: the join answers plus the sign-in details. */
export type SignUpAnswers = JoinAnswers & { code: string; checkNumber: string; password: string };

/**
 * The request waits in this browser while the account is being created, then
 * the first signed-in screen sends it (useAutoJoin). The password is never kept.
 */
export type PendingJoin = JoinAnswers & { code: string };
const PENDING_JOIN = "afisa.pendingJoin";

export function savePendingJoin(p: PendingJoin) {
  try {
    localStorage.setItem(PENDING_JOIN, JSON.stringify(p));
  } catch {
    /* they can fill the join steps again */
  }
}
export function readPendingJoin(): PendingJoin | null {
  try {
    const raw = localStorage.getItem(PENDING_JOIN);
    return raw ? (JSON.parse(raw) as PendingJoin) : null;
  } catch {
    return null;
  }
}
export function clearPendingJoin() {
  try {
    localStorage.removeItem(PENDING_JOIN);
  } catch {
    /* ignore */
  }
}

/**
 * Sends the request saved during sign-up, once, as soon as the new account is
 * signed in. `failed` keeps the answers so the wizard can show them again.
 */
export function useAutoJoin(send: (p: PendingJoin) => Promise<void>): { sending: boolean; failed: { pending: PendingJoin; error: string } | null } {
  const [pending] = useState(readPendingJoin);
  const [sending, setSending] = useState(pending !== null);
  const [failed, setFailed] = useState<{ pending: PendingJoin; error: string } | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!pending || started.current) return;
    started.current = true;
    send(pending)
      .then(() => clearPendingJoin())
      .catch((e: unknown) => {
        clearPendingJoin();
        setFailed({ pending, error: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => setSending(false));
  }, [pending, send]);
  return { sending, failed };
}

type Step = 1 | 2 | 3;

export type JoinWizardProps = {
  code: string;
  onCodeChange: (code: string) => void;
  /** undefined while looking up, null when no council has this code. */
  council: JoinCouncil | null | undefined;
  areas: JoinArea[] | undefined;
  defaultName: string;
  defaultPhone: string;
  /** The public-service check number they signed in with (their sign-in name). */
  checkNumber: string | null;
  rejectedNote: string | null;
  busy: boolean;
  error: string | null;
  header?: ReactNode;
  onSignOut: () => void;
  /** Answers from an earlier try, shown again (section and area). */
  initial?: { section?: Section; areaId?: string };
  /**
   * Ask where they work (ward, village). Off in HQ: head-office staff work at
   * head office; their lead can add stations later.
   */
  askLocation?: boolean;
} & (
  | { newAccount?: false; onSubmit: (answers: JoinAnswers) => void }
  /** Not signed in yet: the last step also asks for the check number and a password. */
  | { newAccount: true; onSubmit: (answers: SignUpAnswers) => void }
);

export function JoinWizard(props: JoinWizardProps) {
  const {
    code,
    onCodeChange,
    council,
    areas,
    defaultName,
    defaultPhone,
    checkNumber,
    rejectedNote,
    busy,
    error,
    onSignOut,
    header,
    initial,
    askLocation = true,
  } = props;
  const newAccount = props.newAccount === true;
  const t = useT();
  const label = useLabel();
  const [step, setStep] = useState<Step>(1);
  const [section, setSection] = useState<Section | null>(initial?.section ?? null);
  const [wardId, setWardId] = useState("");
  const [villageId, setVillageId] = useState("");
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [check, setCheck] = useState("");
  const [password, setPassword] = useState("");
  const [problems, setProblems] = useState<RegistrationProblem[]>([]);
  const bad = (p: RegistrationProblem) => problems.includes(p);

  // An earlier answer: put the ward and village back once the areas arrive.
  useEffect(() => {
    if (!initial?.areaId || !areas || wardId) return;
    const hit = areas.find((a) => a._id === initial.areaId);
    if (!hit) return;
    if (hit.kind === "ward") setWardId(hit._id);
    else if (hit.parentId) {
      setWardId(hit.parentId);
      setVillageId(hit._id);
    }
  }, [areas, initial?.areaId, wardId]);

  // A section code decides the section.
  const fixedSection = council?.section ?? null;
  useEffect(() => {
    if (fixedSection) setSection(fixedSection);
  }, [fixedSection]);

  const wards = useMemo(() => (areas ?? []).filter((a) => a.kind === "ward"), [areas]);
  const villages = useMemo(() => (areas ?? []).filter((a) => a.kind === "village" && a.parentId === wardId), [areas, wardId]);
  const ward = wards.find((w) => w._id === wardId);
  const village = villages.find((v) => v._id === villageId);

  const codeReady = code.length === 8 && Boolean(council) && !council?.blocked;
  const workReady = section !== null && (!askLocation || Boolean(ward));
  const meReady = newAccount ? isFullName(name) && check.trim().length > 0 && password.length > 0 && phone.trim().length > 0 : isFullName(name);

  const areaLabel = !askLocation ? t("Makao makuu", "Head office") : ward ? (village ? `${village.name}, ${t("kata ya", "ward")} ${ward.name}` : t(`Kata ya ${ward.name}`, `${ward.name} ward`)) : "";

  const steps: { n: Step; title: string }[] = [
    { n: 1, title: t("Halmashauri", "Council") },
    { n: 2, title: askLocation ? t("Kazi yako", "Your work") : t("Sehemu yako", "Your section") },
    { n: 3, title: t("Taarifa zako", "About you") },
  ];
  const canOpen = (n: Step) => n === 1 || (n === 2 && codeReady) || (n === 3 && codeReady && workReady);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 1 && codeReady) return setStep(2);
    if (step === 2 && workReady) return setStep(3);
    if (step === 3 && codeReady && workReady && meReady && section) {
      const base = { section, areaId: villageId || wardId, areaLabel, name: cleanName(name), phone: phone.trim() };
      if (props.newAccount) {
        const found = registrationProblems({ name, phone, checkNumber: check, password });
        setProblems(found);
        if (found.length > 0) return;
        props.onSubmit({ ...base, phone: normalizePhone(phone), code, checkNumber: normalizeCheckNumber(check), password });
      } else {
        props.onSubmit(base);
      }
    }
  };

  return (
    <form className="join" onSubmit={submit} noValidate>
      {header}
      <ol className="join-steps" aria-label={t("Hatua", "Steps")}>
        {steps.map((s) => (
          <li key={s.n} className={s.n === step ? "is-current" : s.n < step ? "is-done" : undefined}>
            <button type="button" disabled={!canOpen(s.n) || busy} aria-current={s.n === step ? "step" : undefined} onClick={() => setStep(s.n)}>
              <span className="join-step-n" aria-hidden>{s.n < step ? "✓" : s.n}</span>
              <span>{s.title}</span>
            </button>
          </li>
        ))}
      </ol>

      {rejectedNote && step === 1 && (
        <div className="notice notice-danger" role="status">
          <p><strong>{t("Ombi lako la awali halikukubaliwa.", "Your earlier request was not accepted.")}</strong> {t("Sababu:", "Reason:")} {rejectedNote}</p>
        </div>
      )}

      {step === 1 && (
        <section className="join-panel join-code" aria-labelledby="join-code">
          <h2 id="join-code">{t("Msimbo wa halmashauri au sehemu", "Council or section code")}</h2>
          <p className="muted">{t("Herufi na namba 8 ulizopewa na mkuu wa sehemu yako au wa idara, mfano K7QM-3XPA.", "The 8 letters and digits your section head or Head of Department gave you, for example K7QM-3XPA.")}</p>
          <CodeInput labelledBy="join-code" value={code} onChange={onCodeChange} autoFocus invalid={code.length === 8 && (council === null || Boolean(council?.blocked))} />
          {code.length === 8 && council === undefined && <p className="muted small">{t("Inatafuta…", "Looking up…")}</p>}
          {code.length === 8 && council === null && <p className="join-result is-bad">{t("Msimbo huu haupo. Hakikisha herufi zote 8.", "No council has this code. Check all 8 characters.")}</p>}
          {council?.blocked && (
            <p className="join-result is-bad"><strong>{council.name}</strong><span>{council.blocked}</span></p>
          )}
          {council && !council.blocked && code.length === 8 && (
            <p className="join-result is-ok">
              <strong>{council.name}</strong>
              <span>
                {council.section
                  ? t(`Sehemu ya ${label(SECTION_LABELS[council.section])} · Mkoa wa ${council.region}`, `${label(SECTION_LABELS[council.section])} section · ${council.region} region`)
                  : t(`Mkoa wa ${council.region}`, `${council.region} region`)}
              </span>
            </p>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="join-panel" aria-labelledby="join-work">
          <h2 id="join-work">{t("Sehemu yako", "Your section")}</h2>
          {fixedSection && <p className="muted small">{t("Sehemu imetokana na msimbo ulioandika.", "The section comes from the code you entered.")}</p>}
          <div className="join-sections" role="radiogroup" aria-labelledby="join-work">
            {SECTIONS.filter((s) => !fixedSection || s === fixedSection).map((s) => (
              <button
                type="button"
                role="radio"
                aria-checked={section === s}
                key={s}
                className={`join-section sec sec-${s}`}
                disabled={Boolean(fixedSection)}
                onClick={() => setSection(s)}
              >
                <strong>{label(SECTION_LABELS[s])}</strong>
                <span>{label(designationLabel(s))}</span>
              </button>
            ))}
          </div>

          {askLocation && (<>
          <h2 id="join-where">{t("Unafanya kazi wapi?", "Where do you work?")}</h2>
          <div className="join-where">
            <div className="field">
              <span className="field-label" id="join-ward">{t("Kata", "Ward")}</span>
              <Select
                labelledBy="join-ward"
                label={t("Kata", "Ward")}
                value={wardId}
                onChange={(v) => {
                  setWardId(v);
                  setVillageId("");
                }}
                placeholder={areas === undefined ? t("Inapakia…", "Loading…") : t("Chagua kata", "Choose a ward")}
                options={wards.map((w) => ({ value: w._id, label: w.name }))}
                searchable
              />
            </div>
            <div className="field">
              <span className="field-label" id="join-village">{t("Kijiji au mtaa (si lazima)", "Village or street (optional)")}</span>
              <Select
                labelledBy="join-village"
                label={t("Kijiji au mtaa", "Village or street")}
                value={villageId}
                onChange={setVillageId}
                disabled={!ward}
                placeholder={ward ? t("Kata nzima", "The whole ward") : t("Chagua kata kwanza", "Choose a ward first")}
                options={[{ value: "", label: t("Kata nzima", "The whole ward") }, ...villages.map((v) => ({ value: v._id, label: v.name }))]}
                searchable
              />
            </div>
          </div>
          </>)}
          <p className="muted small">
            {askLocation
              ? t("Haya ni mapendekezo tu. Makao makuu watakupa cheo na maeneo yako ya kazi.", "These are only suggestions. Head office will give you your position and work areas.")
              : t("Kituo chako kikuu ni makao makuu. Mkuu wa Idara au wa sehemu anaweza kukuongezea kituo kingine baadaye.", "Your main station is head office. The Head of Department or your section head can add another station later.")}
          </p>
        </section>
      )}

      {step === 3 && (
        <section className="join-panel" aria-labelledby="join-me">
          <h2 id="join-me">{t("Taarifa zako", "About you")}</h2>
          {checkNumber && (
            <label className="field">
              <span>{t("Namba ya utumishi (check number)", "Check number")}</span>
              <input className="input" value={checkNumber} readOnly aria-readonly="true" />
              <small>{t("Ndiyo namba unayoingia nayo. Haibadilishwi hapa.", "This is the number you sign in with. It cannot be changed here.")}</small>
            </label>
          )}
          <label className={`field${bad("name") ? " has-error" : ""}`}>
            <span>{t("Jina kamili", "Full name")}</span>
            <input className="input" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
            <small className={bad("name") ? "field-error" : undefined}>
              {t("Majina mawili au matatu kama yalivyo kwenye kitambulisho cha kazi.", "Two or three names, as on your work ID.")}
            </small>
          </label>
          {newAccount && (
            <label className={`field${bad("checkNumber") ? " has-error" : ""}`}>
              <span>{t("Namba ya utumishi (check number)", "Check number")}</span>
              <input
                className="input"
                autoComplete="username"
                inputMode="numeric"
                value={check}
                onChange={(e) => setCheck(e.target.value.replace(/[^\d\s]/g, ""))}
                disabled={busy}
              />
              <small className={bad("checkNumber") ? "field-error" : undefined}>
                {t("Tarakimu 5 hadi 12, kama zilivyo kwenye hati ya mshahara. Utaitumia kuingia.", "5 to 12 digits, as on your payslip. You will sign in with it.")}
              </small>
            </label>
          )}
          <label className={`field${bad("phone") ? " has-error" : ""}`}>
            <span>{newAccount ? t("Namba ya simu", "Phone number") : t("Namba ya simu (si lazima)", "Phone number (optional)")}</span>
            <input className="input" type="tel" autoComplete="tel" inputMode="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
          </label>
          {newAccount && (
            <label className={`field${bad("password") ? " has-error" : ""}`}>
              <span>{t("Nenosiri", "Password")}</span>
              <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
              <small className={bad("password") ? "field-error" : undefined}>
                {t("Herufi 8 au zaidi. Usitumie nenosiri unalotumia kwingine.", "8 or more characters. Do not reuse a password from elsewhere.")}
              </small>
            </label>
          )}
          <dl className="join-summary">
            {checkNumber && <div><dt>{t("Namba ya utumishi", "Check number")}</dt><dd>{checkNumber}</dd></div>}
            <div><dt>{t("Halmashauri", "Council")}</dt><dd>{council?.name}</dd></div>
            <div><dt>{t("Sehemu", "Section")}</dt><dd>{section && label(SECTION_LABELS[section])}</dd></div>
            <div><dt>{t("Eneo", "Area")}</dt><dd>{areaLabel}</dd></div>
          </dl>
        </section>
      )}

      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}

      <div className="join-actions">
        {step > 1 ? (
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setStep((step - 1) as Step)}>
            {t("Rudi", "Back")}
          </button>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={onSignOut}>{newAccount ? t("Nina akaunti", "I have an account") : t("Toka", "Sign out")}</button>
        )}
        <button
          className="btn btn-primary"
          disabled={busy || (step === 1 ? !codeReady : step === 2 ? !workReady : !meReady)}
        >
          {step < 3
            ? t("Endelea", "Continue")
            : busy
              ? t("Inatuma…", "Sending…")
              : newAccount
                ? t("Fungua akaunti na tuma ombi", "Create account and send request")
                : t("Tuma ombi", "Send request")}
        </button>
      </div>
    </form>
  );
}
