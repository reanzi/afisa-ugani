/**
 * Council settings. For now: whether reports send themselves on their due
 * dates when an officer has not sent them.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import { formatCouncilCode, SECTION_LABELS, type Section } from "@afisa/shared";
import { errorMessage, useConfirm, useLabel, useT, type T } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { CopyCode } from "../CopyCode";

type Key = "food" | "monthly";

const items = (t: T): { key: Key; title: string; body: string }[] => [
  {
    key: "food",
    title: t("Ripoti ya chakula na bei: tarehe 22", "Food and prices report: the 22nd"),
    body: t(
      "Afisa asipoituma, saa 5:30 usiku tarehe 22 inatumwa yenyewe na bei alizoandika. Asiyeandika bei yoyote hatumiwi ripoti.",
      "If the officer has not sent it, at 23:30 on the 22nd it sends itself with the prices they recorded. No report is sent for an officer who recorded none.",
    ),
  },
  {
    key: "monthly",
    title: t("Fomu za ARDS: mwezi (tarehe 5), robo na mwaka (tarehe 7)", "ARDS forms: monthly (the 5th), quarterly and annual (the 7th)"),
    body: t(
      "Afisa anaweza kutuma ripoti ya mwezi mwezi ukiisha, na ya robo au ya mwaka kuanzia tarehe 15 ya mwezi wa mwisho wa robo (ya mwaka: 1 Juni). Asipoituma, saa 5:30 usiku tarehe ya mwisho inatumwa yenyewe kutoka kwenye kumbukumbu na majibu yake.",
      "Officers can send the monthly report once the month ends, and the quarterly or annual one from the 15th of the quarter's last month (annual: 1 June). If they have not, at 23:30 on the due date it sends itself, built from their records and answers.",
    ),
  },
];

/** A switch in the settings list. */
function Switch({ on, label, disabled, onClick }: { on: boolean; label: string; disabled: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" disabled={disabled} onClick={onClick}>
      <span className="switch-track" aria-hidden><span className="switch-thumb" /></span>
      <span className="switch-text">{on ? t("Imewashwa", "On") : t("Imezimwa", "Off")}</span>
    </button>
  );
}

/** Weekly reports per section: asked of officers, and sent by themselves on Monday 05:00 when not sent. */
function WeeklySettings() {
  const t = useT();
  const label = useLabel();
  const { councilId } = useHq();
  const settings = useQuery(api.councils.settings, { councilId });
  const save = useMutation(api.councils.setWeekly);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!settings) return null;

  const set = async (section: "mifugo" | "kilimo", on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await save({ councilId, section, on, client: hqClient });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-group" aria-labelledby="weekly-h">
      <h2 id="weekly-h" className="food-h2">{t("Ripoti za wiki", "Weekly reports")}</h2>
      <p className="muted">
        {t(
          "Zikiwashwa, maafisa wa sehemu hiyo wanatuma ripoti ya wiki (Jumatatu hadi Jumapili) kuanzia Jumapili saa 12 jioni hadi Jumatatu saa 11 alfajiri, tayari kwa kikao cha asubuhi. Zikizimwa, maafisa bado wanaweza kuziandaa kwa matumizi yao.",
          "When on, that section's officers send the week's report (Monday to Sunday) between Sunday 18:00 and Monday 05:00, ready for the morning meeting. When off, officers can still build them for their own use.",
        )}
      </p>
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      <ul className="settings-list">
        {(["mifugo", "kilimo"] as const).map((s) => {
          const w = settings.weekly[s];
          const can = settings.canEditWeekly[s];
          const name = label(SECTION_LABELS[s]);
          return (
            <li key={s}>
              <div>
                <h2>{t(`Ripoti ya wiki: ${name}`, `Weekly report: ${name}`)}</h2>
                <p>
                  {t(
                    "Afisa asipoituma, Jumatatu saa 11 alfajiri (05:00) inatumwa yenyewe kutoka kwenye kumbukumbu zake za wiki.",
                    "If the officer has not sent it, at 05:00 on Monday it sends itself, built from their records for the week.",
                  )}
                </p>
              </div>
              <Switch on={w.on} label={t(`Ripoti ya wiki: ${name}`, `Weekly report: ${name}`)} disabled={!can || busy} onClick={() => void set(s, !w.on)} />
            </li>
          );
        })}
      </ul>
      {!settings.canEditWeekly.mifugo && !settings.canEditWeekly.kilimo && (
        <p className="muted">{t("Mkuu wa Idara au mkuu wa sehemu ndio wanaoweza kubadili mipangilio hii.", "Only the Head of Department or the section head can change these settings.")}</p>
      )}
    </section>
  );
}

/** Section sign-up codes, with a new code when one has leaked. */
function SignUpCodes() {
  const t = useT();
  const label = useLabel();
  const confirm = useConfirm();
  const { councilId } = useHq();
  const data = useQuery(api.councils.myCodes, { councilId });
  const renew = useMutation(api.councils.renewSectionCode);
  const [error, setError] = useState<string | null>(null);
  if (!data || data.codes.length === 0) return null;
  const doRenew = async (section: Section) => {
    const ok = await confirm({
      title: t(`Msimbo mpya wa ${label(SECTION_LABELS[section])}?`, `New code for ${label(SECTION_LABELS[section])}?`),
      body: t("Msimbo wa sasa hautafanya kazi tena kwa usajili mpya. Waliokwisha jisajili hawaathiriki.", "The current code stops working for new sign-ups. People already signed up are not affected."),
      confirmLabel: t("Toa msimbo mpya", "Issue new code"),
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      await renew({ councilId, section, client: hqClient });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="card-form settings-codes">
      <h2>{t("Misimbo ya usajili wa sehemu", "Section sign-up codes")}</h2>
      <p className="muted">
        {t(
          "Mtumishi anayejisajili kwa msimbo wa sehemu anaingia moja kwa moja kwenye sehemu hiyo kama mgeni, akisubiri idhini.",
          "Someone who signs up with a section code goes straight into that section as a guest, waiting for approval.",
        )}
      </p>
      <ul className="code-list">
        {data.codes.map((c) => (
          <li key={c.section} className={`sec sec-${c.section}`}>
            <span className="sec-tag">{label(SECTION_LABELS[c.section])}</span>
            <span className="code-with-copy">
              <span className="code-chip">{formatCouncilCode(c.code)}</span>
              <CopyCode code={c.code} compact />
            </span>
            {data.canRenew.includes(c.section) && (
              <button type="button" className="link small" onClick={() => void doRenew(c.section)}>{t("Badili", "Change")}</button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** The council's short name, for screens. */
function CouncilName({ name, displayName, canEdit }: { name: string; displayName: string | null; canEdit: boolean }) {
  const t = useT();
  const { councilId } = useHq();
  const save = useMutation(api.councils.setDisplayName);
  const [value, setValue] = useState(displayName ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await save({ councilId, displayName: value, client: hqClient });
      setMsg({ ok: true, text: t("Imehifadhiwa.", "Saved.") });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card-form settings-name" onSubmit={submit}>
      <h2>{t("Jina la halmashauri", "Council name")}</h2>
      <p className="muted">
        {t("Jina kamili (kwenye ripoti)", "Full name (on reports)")}: <strong>{name}</strong>
      </p>
      <label className="field">
        <span>{t("Jina fupi (kwenye skrini)", "Short name (on screens)")}</span>
        <input className="input" maxLength={40} value={value} disabled={!canEdit} placeholder="Bagamoyo DC" onChange={(e) => setValue(e.target.value)} />
        <small>{t("Acha wazi ili kutumia jina kamili.", "Leave empty to use the full name.")}</small>
      </label>
      {msg && <p className={msg.ok ? "form-ok" : "field-error"} role="status">{msg.text}</p>}
      {canEdit && <button className="btn btn-primary" disabled={busy || value.trim() === (displayName ?? "")}>{t("Hifadhi", "Save")}</button>}
    </form>
  );
}

export function Settings() {
  const t = useT();
  const { councilId } = useHq();
  const settings = useQuery(api.councils.settings, { councilId });
  const save = useMutation(api.councils.setAutoSend);
  const [busy, setBusy] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: Key) => {
    if (!settings) return;
    setBusy(key);
    setError(null);
    try {
      const next = { ...settings.autoSend, [key]: !settings.autoSend[key] };
      await save({ councilId, food: next.food, monthly: next.monthly, client: hqClient });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>{t("Mipangilio", "Settings")}</h1>
        <p className="muted">
          {t(
            "Kutuma ripoti zenyewe kunasaidia ripoti zifike kwa wakati. Kinachotumwa ni kile afisa alichoandika tu; maafisa wanaona kwenye simu kuwa ripoti itajituma.",
            "Automatic sending helps reports arrive on time. Only what the officer recorded is sent; officers see on their phones that the report will send itself.",
          )}
        </p>
      </header>

      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      {settings === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {settings && (
        <ul className="settings-list">
          {items(t).map((it) => {
            const on = settings.autoSend[it.key];
            return (
              <li key={it.key}>
                <div>
                  <h2>{it.title}</h2>
                  <p>{it.body}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={t(`Tuma yenyewe: ${it.title}`, `Send automatically: ${it.title}`)}
                  className="switch"
                  disabled={!settings.canEdit || busy !== null}
                  onClick={() => void toggle(it.key)}
                >
                  <span className="switch-track" aria-hidden><span className="switch-thumb" /></span>
                  <span className="switch-text">{on ? t("Imewashwa", "On") : t("Imezimwa", "Off")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <WeeklySettings />
      <SignUpCodes />
      {settings && <CouncilName key={settings.displayName ?? ""} name={settings.name} displayName={settings.displayName} canEdit={settings.canEdit} />}
      {settings && !settings.canEdit && <p className="muted">{t("Mkuu wa Idara au Naibu wake ndio wanaoweza kubadili mipangilio hii.", "Only the Head of Department or their vice can change these settings.")}</p>}
    </section>
  );
}
