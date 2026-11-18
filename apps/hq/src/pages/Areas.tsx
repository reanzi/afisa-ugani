import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { canManageAreas } from "@afisa/shared";
import { errorMessage, useT } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { useAreas } from "./common";

function AddForm({ kind, parentId, placeholder }: { kind: "ward" | "village"; parentId?: Id<"areas">; placeholder: string }) {
  const t = useT();
  const { councilId } = useHq();
  const create = useMutation(api.areas.create);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({ councilId, kind, name, parentId, client: hqClient });
      setName("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="add-inline" onSubmit={submit}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button className="btn btn-quiet btn-small" disabled={busy || name.trim().length < 2}>{t("Ongeza", "Add")}</button>
      {error && <p className="tone-danger small" role="alert">{error}</p>}
    </form>
  );
}

export function Areas() {
  const t = useT();
  const { actor } = useHq();
  const areas = useAreas();
  const canEdit = canManageAreas(actor);
  const wards = areas?.filter((a) => a.kind === "ward") ?? [];

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>{t("Maeneo", "Areas")}</h1>
        <p className="muted">{t("Kata na vijiji vya halmashauri. Maafisa hupangiwa maeneo haya wanapoidhinishwa.", "The council's wards and villages. Officers are assigned to these when approved.")}</p>
      </header>
      {canEdit && <AddForm kind="ward" placeholder={t("Jina la kata mpya", "New ward name")} />}
      {areas && wards.length === 0 && <p className="empty">{t("Bado hakuna kata.", "No wards yet.")} {canEdit ? t("Anza kwa kuongeza kata hapo juu.", "Start by adding a ward above.") : t("Mkuu wa idara ataziongeza.", "The Head of Department will add them.")}</p>}
      <div className="ward-grid">
        {wards.map((w) => {
          const villages = areas!.filter((v) => v.parentId === w._id);
          return (
            <article key={w._id} className="ward">
              <h2>{t(`Kata ya ${w.name}`, `${w.name} ward`)}</h2>
              <p className="muted small">{villages.length === 1 ? t("Kijiji 1", "1 village") : t(`Vijiji ${villages.length}`, `${villages.length} villages`)}</p>
              <ul>
                {villages.map((v) => <li key={v._id}>{v.name}</li>)}
              </ul>
              {canEdit && <AddForm kind="village" parentId={w._id} placeholder={t("Ongeza kijiji", "Add a village")} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}
