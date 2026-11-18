/** My account: who I am here, my name and phone, and my password. */
import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@afisa/backend/api";
import { cleanName, isFullName, isValidPhone, ROLE_LABELS, SECTION_LABELS, titleCaseName } from "@afisa/shared";
import { authErrorMessage, errorMessage, PasswordInput, useLabel, useT } from "@afisa/ui";
import { hqClient, type Me } from "../context";

export function AccountPage({ me }: { me: Me }) {
  const t = useT();
  const label = useLabel();
  const save = useMutation(api.users.updateProfile);
  const changePassword = useMutation(api.auth.changePassword);

  const [name, setName] = useState(me.name ? titleCaseName(me.name) : "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const submitProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    if (!isFullName(name)) return setProfileMsg({ ok: false, text: t("Andika jina kamili: majina mawili au zaidi.", "Write your full name: two names or more.") });
    if (phone.trim() && !isValidPhone(phone)) return setProfileMsg({ ok: false, text: t("Namba ya simu si sahihi. Mfano 0712 345 678.", "The phone number is not valid. For example 0712 345 678.") });
    setSavingProfile(true);
    try {
      await save({ name: titleCaseName(cleanName(name)), phone: phone.trim() || undefined, client: hqClient });
      setProfileMsg({ ok: true, text: t("Imehifadhiwa.", "Saved.") });
    } catch (err) {
      setProfileMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setSavingProfile(false);
    }
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (next !== again) return setPwMsg({ ok: false, text: t("Nenosiri jipya halifanani mara zote mbili.", "The new password does not match.") });
    setSavingPw(true);
    try {
      const res = await changePassword({ currentPassword: current, newPassword: next });
      if ("success" in res && res.success) {
        setPwMsg({ ok: true, text: t("Nenosiri limebadilishwa.", "Password changed.") });
        setCurrent("");
        setNext("");
        setAgain("");
      } else if ("userError" in res && res.userError) {
        setPwMsg({ ok: false, text: authErrorMessage(res.userError) });
      } else {
        setPwMsg({ ok: false, text: t("Imeshindikana. Jaribu tena.", "That did not work. Try again.") });
      }
    } catch (err) {
      setPwMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <section className="hq-page account-page">
      <header className="hq-page-head">
        <h1>{t("Akaunti yangu", "My account")}</h1>
        <p className="muted">{me.name ? titleCaseName(me.name) : ""}</p>
      </header>

      <dl className="facts account-facts">
        <div>
          <dt>{t("Namba ya utumishi", "Check number")}</dt>
          <dd>{me.checkNumber ?? "—"}</dd>
        </div>
        {me.memberships
          .filter((m) => m.status === "active")
          .map((m) => (
            <div key={m._id}>
              <dt>{m.councilName}</dt>
              <dd>
                {label(ROLE_LABELS[m.role])}, {m.sections.map((s) => label(SECTION_LABELS[s])).join(", ")}
              </dd>
            </div>
          ))}
      </dl>

      <div className="account-forms">
        <form className="card-form" onSubmit={submitProfile} noValidate>
          <h2>{t("Jina na simu", "Name and phone")}</h2>
          <label className="field">
            <span>{t("Jina kamili", "Full name")}</span>
            <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("Namba ya simu", "Phone number")}</span>
            <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          {profileMsg && <p className={profileMsg.ok ? "form-ok" : "field-error"} role="status">{profileMsg.text}</p>}
          <button className="btn btn-primary" disabled={savingProfile}>{t("Hifadhi", "Save")}</button>
        </form>

        <form className="card-form" onSubmit={submitPassword} noValidate>
          <h2>{t("Badili nenosiri", "Change password")}</h2>
          <label className="field">
            <span>{t("Nenosiri la sasa", "Current password")}</span>
            <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("Nenosiri jipya", "New password")}</span>
            <PasswordInput autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            <small>{t("Herufi 8 au zaidi.", "8 characters or more.")}</small>
          </label>
          <label className="field">
            <span>{t("Rudia nenosiri jipya", "Repeat the new password")}</span>
            <PasswordInput autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </label>
          {pwMsg && <p className={pwMsg.ok ? "form-ok" : "field-error"} role="status">{pwMsg.text}</p>}
          <button className="btn btn-primary" disabled={savingPw || !current || next.length < 8}>{t("Badili nenosiri", "Change password")}</button>
        </form>
      </div>
    </section>
  );
}
