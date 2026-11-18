import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useLiveQuery } from "dexie-react-hooks";
import { ROLE_LABELS, SECTION_LABELS } from "@afisa/shared";
import { useConfirm, useTheme, type ThemeChoice } from "@afisa/ui";
import { APP_VERSION } from "../lib/client";
import { db, getMeta, setMeta } from "../lib/db";
import { WIFI_ONLY_KEY } from "../lib/photos";
import { useWork } from "../lib/session";
import { useMyAreas } from "../lib/areas";
import { requestSync } from "../lib/sync";

const THEMES: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "auto", label: "Kiotomatiki", hint: "Shambani mchana, Usiku jioni" },
  { value: "shambani", label: "Shambani", hint: "Kwa jua kali" },
  { value: "usiku", label: "Usiku", hint: "Kwa giza" },
];

export function Me() {
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
        title: "Utoke bila kutuma?",
        body: `Kumbukumbu ${pending} bado hazijatumwa. Ukitoka sasa zitafutwa kwenye simu hii. Unganisha mtandao kwanza ili zitumwe.`,
        confirmLabel: "Toka hata hivyo",
        cancelLabel: "Bado",
        tone: "danger",
      });
      if (!ok) return;
    }
    await signOut();
    await db.records.clear();
    await db.submissions.clear();
    await db.media.clear();
    await db.meta.clear();
  };

  const assigned = [...wards.map((w) => `Kata ya ${w.name}`), ...villages.filter((v) => !wards.some((w) => w._id === v.parentId)).map((v) => v.name)];

  return (
    <main className="page narrow">
      <h1 className="page-title">{me.name ?? "Mimi"}</h1>

      <dl className="facts">
        <div><dt>Cheo</dt><dd>{ROLE_LABELS[membership.role].sw}{membership.level ? ` (${membership.level.toUpperCase()})` : ""}</dd></div>
        <div><dt>Halmashauri</dt><dd>{membership.councilName}</dd></div>
        {me.checkNumber && <div><dt>Namba ya utumishi</dt><dd>{me.checkNumber}</dd></div>}
        {me.phone && <div><dt>Simu</dt><dd>{me.phone}</dd></div>}
        <div>
          <dt>Sehemu</dt>
          <dd className="sec-list">
            {sections.map((s) => <span key={s} className={`sec sec-${s} sec-tag`}>{SECTION_LABELS[s].sw}</span>)}
          </dd>
        </div>
        <div><dt>Maeneo</dt><dd>{membership.role === "officer" ? (assigned.join(", ") || "Bado hujapangiwa") : "Maeneo yote"}</dd></div>
      </dl>

      <fieldset className="field plain">
        <legend>Mwonekano</legend>
        <div className="theme-options">
          {THEMES.map((t) => (
            <button key={t.value} type="button" className="theme-option" aria-pressed={choice === t.value} onClick={() => setChoice(t.value)}>
              <strong>{t.label}</strong>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <p className="privacy-note">
        Kumbukumbu unazoandika ni zako. Makao makuu huona ripoti unazoamua kutuma tu, si kumbukumbu zenyewe.
      </p>

      <section className="stack">
        <h2 className="section-title">Picha</h2>
        {photos && (
          <p>
            {photos.waiting > 0 ? `Picha ${photos.waiting} zinasubiri kupakiwa.` : "Picha zote zimepakiwa."}{" "}
            {photos.onPhone > 0 && `Picha ${photos.onPhone} ziko kwenye simu hii (MB ${photos.mb}); zinaondoka siku 30 baada ya kupakiwa, picha ndogo zinabaki.`}
          </p>
        )}
        <button type="button" role="switch" aria-checked={wifiOnly} className="setting-switch" onClick={() => void toggleWifi()}>
          <span className="setting-text">
            <strong>Pakia picha kwa Wi-Fi tu</strong>
            <small>Kuokoa bando. Kumbukumbu na ripoti zinatumwa kama kawaida.</small>
          </span>
          <span className="switch-track" aria-hidden><span className="switch-thumb" /></span>
        </button>
      </section>

      <section className="stack">
        <h2 className="section-title">Simu hii</h2>
        <p>
          {pending > 0 ? `Kumbukumbu ${pending} zinasubiri kutumwa.` : "Kumbukumbu zote zimetumwa."}{" "}
          {storage && !storage.persisted && "Kivinjari kinaweza kufuta data kikijaa; sakinisha programu kwenye skrini ya mwanzo ili kuilinda."}
        </p>
        <button className="btn btn-quiet btn-block" onClick={requestSync}>Tuma sasa</button>
        <p className="muted">Toleo {APP_VERSION}{storage?.usedMb !== undefined ? `, inatumia MB ${storage.usedMb}` : ""}.</p>
      </section>

      <button className="btn btn-danger btn-block" onClick={() => void doSignOut()}>Toka</button>
    </main>
  );
}
