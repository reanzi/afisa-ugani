/**
 * Council settings. For now: whether reports send themselves on their due
 * dates when an officer has not sent them.
 */
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import { errorMessage, useT, type T } from "@afisa/ui";
import { hqClient, useHq } from "../context";

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
    title: t("Ripoti ya mwezi (ARDS): tarehe 5", "Monthly report (ARDS): the 5th"),
    body: t(
      "Afisa anaweza kuituma wakati wowote mwezi ukiisha. Asipoituma, saa 5:30 usiku tarehe 5 inatumwa yenyewe kutoka kwenye kumbukumbu zake za mwezi.",
      "The officer can send it any time after the month ends. If they have not, at 23:30 on the 5th it sends itself, built from their records for the month.",
    ),
  },
];

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
      {settings && !settings.canEdit && <p className="muted">{t("Mkuu wa Idara au Naibu wake ndio wanaoweza kubadili mipangilio hii.", "Only the Head of Department or their vice can change these settings.")}</p>}
    </section>
  );
}
