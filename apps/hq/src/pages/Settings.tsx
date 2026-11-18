/**
 * Council settings. For now: whether reports send themselves on their due
 * dates when an officer has not sent them.
 */
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import { errorMessage } from "@afisa/ui";
import { hqClient, useHq } from "../context";

type Key = "food" | "monthly";

const ITEMS: { key: Key; title: string; body: string }[] = [
  {
    key: "food",
    title: "Ripoti ya chakula na bei: tarehe 22",
    body: "Afisa asipoituma, saa 5:30 usiku tarehe 22 inatumwa yenyewe na bei alizoandika. Asiyeandika bei yoyote hatumiwi ripoti.",
  },
  {
    key: "monthly",
    title: "Ripoti ya mwezi (ARDS): tarehe 5",
    body: "Afisa anaweza kuituma wakati wowote mwezi ukiisha. Asipoituma, saa 5:30 usiku tarehe 5 inatumwa yenyewe kutoka kwenye kumbukumbu zake za mwezi.",
  },
];

export function Settings() {
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
        <h1>Mipangilio</h1>
        <p className="muted">
          Kutuma ripoti zenyewe kunasaidia ripoti zifike kwa wakati. Kinachotumwa ni kile afisa alichoandika tu; maafisa wanaona kwenye simu kuwa ripoti itajituma.
        </p>
      </header>

      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      {settings === undefined && <p className="muted">Inapakia…</p>}
      {settings && (
        <ul className="settings-list">
          {ITEMS.map((it) => {
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
                  aria-label={`Tuma yenyewe: ${it.title}`}
                  className="switch"
                  disabled={!settings.canEdit || busy !== null}
                  onClick={() => void toggle(it.key)}
                >
                  <span className="switch-track" aria-hidden><span className="switch-thumb" /></span>
                  <span className="switch-text">{on ? "Imewashwa" : "Imezimwa"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {settings && !settings.canEdit && <p className="muted">Mkuu wa Idara au Naibu wake ndio wanaoweza kubadili mipangilio hii.</p>}
    </section>
  );
}
