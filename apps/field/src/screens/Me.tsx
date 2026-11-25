import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useLiveQuery } from "dexie-react-hooks";
import { designationLabel, LEVEL_LABELS, ROLE_LABELS, SECTION_LABELS } from "@afisa/shared";
import { LANGS, setLang, useConfirm, useLabel, useLang, useT, useTheme, type ThemeChoice } from "@afisa/ui";
import { APP_VERSION } from "../lib/client";
import { db, getMeta, setMeta } from "../lib/db";
import { WIFI_ONLY_KEY } from "../lib/photos";
import { useWork } from "../lib/session";
import { useMyAreas } from "../lib/areas";
import { requestSync } from "../lib/sync";

const THEMES: { value: ThemeChoice; label: [string, string]; hint: [string, string] }[] = [
  { value: "system", label: ["Mfumo", "System"], hint: ["Kama mpangilio wa simu", "Like the phone setting"] },
  { value: "auto", label: ["Kwa saa", "By time"], hint: ["Shambani mchana, Usiku jioni", "Light by day, dark at night"] },
  { value: "shambani", label: ["Shambani", "Light"], hint: ["Kwa jua kali", "For bright sun"] },
  { value: "usiku", label: ["Usiku", "Dark"], hint: ["Kwa giza", "For the dark"] },
];

export function Me() {
  const t = useT();
  const label = useLabel();
  const lang = useLang();
  const { me, membership, sections } = useWork();
  const { wards, villages } = useMyAreas();
  const { choice, setChoice } = useTheme();
  const { signOut } = useAuthActions();
  const pending = useLiveQuery(() => db.records.where("syncState").equals("pending").count(), [], 0);
  const [storage, setStorage] = useState<{ persisted: boolean; usedMb?: number } | null>(null);

  useEffect(() => {
    void (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted, usedMb: est?.usage ? Math.round(est.usage / 1e5) / 10 : undefined });
    })();
  }, []);

  const photos = useLiveQuery(async () => {
    let waiting = 0;
    let onPhone = 0;
    let mb = 0;
    await db.media.each((m) => {
      if (m.deletedAt) return;
      if (m.syncState === "pending") waiting++;
      if (m.blob) {
        onPhone++;
        mb += m.blob.size / 1e6;
      }
    });
    return { waiting, onPhone, mb: Math.round(mb * 10) / 10 };
  }, []);
  const [wifiOnly, setWifiOnly] = useState(false);
  useEffect(() => {
    void getMeta<boolean>(WIFI_ONLY_KEY).then((v) => setWifiOnly(v ?? false));
  }, []);
  const toggleWifi = async () => {
    const next = !wifiOnly;
    setWifiOnly(next);
    await setMeta(WIFI_ONLY_KEY, next);
    if (!next) requestSync();
  };

  const confirm = useConfirm();
  const doSignOut = async () => {
    if (pending > 0) {
      const ok = await confirm({
        title: t("Utoke bila kutuma?", "Sign out without sending?"),
        body: t(
          `Kumbukumbu ${pending} bado hazijatumwa. Ukitoka sasa zitafutwa kwenye simu hii. Unganisha mtandao kwanza ili zitumwe.`,
          `${pending} records have not been sent yet. If you sign out now they are deleted from this phone. Connect first so they are sent.`,
        ),
        confirmLabel: t("Toka hata hivyo", "Sign out anyway"),
        cancelLabel: t("Bado", "Not yet"),
        tone: "danger",
      });
      if (!ok) return;
    }
    await signOut();
    await db.records.clear();
    await db.submissions.clear();
    await db.media.clear();
    await db.presets.clear();
    await db.meta.clear();
  };

  const assigned = [
    ...wards.map((w) => t(`Kata ya ${w.name}`, `${w.name} ward`)),
    ...villages.filter((v) => !wards.some((w) => w._id === v.parentId)).map((v) => v.name),
  ];
  const position =
    membership.role === "officer"
      ? `${label(designationLabel(membership.primarySection))}${membership.level ? `, ${label(LEVEL_LABELS[membership.level]).toLowerCase()}` : ""}`
      : label(ROLE_LABELS[membership.role]);

  return (
    <main className="page narrow">
      <h1 className="page-title">{me.name ?? t("Mimi", "Me")}</h1>

      <dl className="facts">
        <div><dt>{t("Cheo", "Position")}</dt><dd>{position}</dd></div>
        <div><dt>{t("Halmashauri", "Council")}</dt><dd>{membership.councilName}</dd></div>
        {me.checkNumber && <div><dt>{t("Namba ya utumishi", "Check number")}</dt><dd>{me.checkNumber}</dd></div>}
        {me.phone && <div><dt>{t("Simu", "Phone")}</dt><dd>{me.phone}</dd></div>}
        <div>
          <dt>{t("Sehemu", "Sections")}</dt>
          <dd className="sec-list">
            {sections.map((s) => <span key={s} className={`sec sec-${s} sec-tag`}>{label(SECTION_LABELS[s])}</span>)}
          </dd>
        </div>
        <div><dt>{t("Maeneo", "Areas")}</dt><dd>{membership.role === "officer" ? (assigned.join(", ") || t("Bado hujapangiwa", "Not assigned yet")) : t("Maeneo yote", "All areas")}</dd></div>
      </dl>

      <fieldset className="field plain">
        <legend>{t("Lugha", "Language")}</legend>
        <div className="choice-row" role="radiogroup" aria-label={t("Lugha", "Language")}>
          {LANGS.map((l) => (
            <button key={l.value} type="button" role="radio" aria-checked={lang === l.value} className="choice-pill" lang={l.value} onClick={() => setLang(l.value)}>
              {l.label}
            </button>
          ))}
        </div>
        <small>{t("Ripoti rasmi (ARDS) zinabaki kwa Kiswahili.", "Official reports (ARDS) stay in Swahili.")}</small>
      </fieldset>

      <fieldset className="field plain">
        <legend>{t("Mwonekano", "Appearance")}</legend>
        <div className="theme-options">
          {THEMES.map((th) => (
            <button key={th.value} type="button" className="theme-option" aria-pressed={choice === th.value} onClick={() => setChoice(th.value)}>
              <strong>{t(...th.label)}</strong>
              <span>{t(...th.hint)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <section className="privacy-card" aria-labelledby="privacy-title">
        <div className="privacy-card-head">
          <span className="privacy-card-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0z" fill="currentColor" /></svg>
          </span>
          <h2 id="privacy-title">{t("Faragha yako", "Your privacy")}</h2>
        </div>
        <p>
          {t(
            "Kumbukumbu unazoandika ni zako. Makao makuu huona ripoti unazoamua kutuma tu, si kumbukumbu zenyewe.",
            "The records you write are yours. Head office sees only the reports you choose to send, not the records themselves.",
          )}
        </p>
        <Link to="/sera" className="privacy-card-link">
          <span>{t("Soma sera ya matumizi", "Read the usage policy")}</span>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M7.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      </section>

      <section className="stack">
        <h2 className="section-title">{t("Picha", "Photos")}</h2>
        {photos && (
          <p>
            {photos.waiting > 0 ? t(`Picha ${photos.waiting} zinasubiri kupakiwa.`, `${photos.waiting} photos waiting to upload.`) : t("Picha zote zimepakiwa.", "All photos uploaded.")}{" "}
            {photos.onPhone > 0 &&
              t(
                `Picha ${photos.onPhone} ziko kwenye simu hii (MB ${photos.mb}); zinaondoka siku 30 baada ya kupakiwa, picha ndogo zinabaki.`,
                `${photos.onPhone} photos are on this phone (${photos.mb} MB); they are removed 30 days after upload, small previews stay.`,
              )}
          </p>
        )}
        <button type="button" role="switch" aria-checked={wifiOnly} className="setting-switch" onClick={() => void toggleWifi()}>
          <span className="setting-text">
            <strong>{t("Pakia picha kwa Wi-Fi tu", "Upload photos on Wi-Fi only")}</strong>
            <small>{t("Kuokoa bando. Kumbukumbu na ripoti zinatumwa kama kawaida.", "Saves mobile data. Records and reports still send as usual.")}</small>
          </span>
          <span className="switch-track" aria-hidden><span className="switch-thumb" /></span>
        </button>
      </section>

      <section className="stack">
        <h2 className="section-title">{t("Simu hii", "This phone")}</h2>
        <p>
          {pending > 0 ? t(`Kumbukumbu ${pending} zinasubiri kutumwa.`, `${pending} records waiting to send.`) : t("Kumbukumbu zote zimetumwa.", "All records sent.")}{" "}
          {storage && !storage.persisted && t("Kivinjari kinaweza kufuta data kikijaa; sakinisha programu kwenye skrini ya mwanzo ili kuilinda.", "The browser may clear data when full; install the app on the home screen to protect it.")}
        </p>
        <button className="btn btn-quiet btn-block" onClick={requestSync}>{t("Tuma sasa", "Send now")}</button>
        <p className="muted">{t("Toleo", "Version")} {APP_VERSION}{storage?.usedMb !== undefined ? t(`, inatumia MB ${storage.usedMb}`, `, using ${storage.usedMb} MB`) : ""}.</p>
      </section>

      <button className="btn btn-danger btn-block" onClick={() => void doSignOut()}>{t("Toka", "Sign out")}</button>
    </main>
  );
}
