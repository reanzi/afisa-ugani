import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useLiveQuery } from "dexie-react-hooks";
import { ROLE_LABELS, SECTION_LABELS } from "@afisa/shared";
import { useTheme, type ThemeChoice } from "@afisa/ui";
import { APP_VERSION } from "../lib/client";
import { db } from "../lib/db";
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

  const doSignOut = async () => {
    if (pending > 0) {
      const ok = window.confirm(
        `Kumbukumbu ${pending} bado hazijatumwa. Ukitoka sasa zitafutwa kwenye simu hii. Unganisha mtandao kwanza ili zitumwe. Utoke hata hivyo?`,
      );
      if (!ok) return;
    }
    await signOut();
    await db.records.clear();
    await db.meta.clear();
  };

  const assigned = [...wards.map((w) => `Kata ya ${w.name}`), ...villages.filter((v) => !wards.some((w) => w._id === v.parentId)).map((v) => v.name)];

  return (
    <main className="page narrow">
      <h1 className="page-title">{me.name ?? "Mimi"}</h1>

      <dl className="facts">
        <div><dt>Cheo</dt><dd>{ROLE_LABELS[membership.role].sw}{membership.level ? ` (${membership.level.toUpperCase()})` : ""}</dd></div>
        <div><dt>Halmashauri</dt><dd>{membership.councilName}</dd></div>
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
