import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { canManageAreas } from "@afisa/shared";
import { errorMessage } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { useAreas } from "./common";

function AddForm({ kind, parentId, placeholder }: { kind: "ward" | "village"; parentId?: Id<"areas">; placeholder: string }) {
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
      <button className="btn btn-quiet btn-small" disabled={busy || name.trim().length < 2}>Ongeza</button>
      {error && <p className="tone-danger small" role="alert">{error}</p>}
    </form>
  );
}

export function Areas() {
  const { actor } = useHq();
  const areas = useAreas();
  const canEdit = canManageAreas(actor);
  const wards = areas?.filter((a) => a.kind === "ward") ?? [];

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>Maeneo</h1>
        <p className="muted">Kata na vijiji vya halmashauri. Maafisa hupangiwa maeneo haya wanapoidhinishwa.</p>
      </header>
      {canEdit && <AddForm kind="ward" placeholder="Jina la kata mpya" />}
      {areas && wards.length === 0 && <p className="empty">Bado hakuna kata. {canEdit ? "Anza kwa kuongeza kata hapo juu." : "Mkuu wa idara ataziongeza."}</p>}
      <div className="ward-grid">
        {wards.map((w) => {
          const villages = areas!.filter((v) => v.parentId === w._id);
          return (
            <article key={w._id} className="ward">
              <h2>Kata ya {w.name}</h2>
              <p className="muted small">{villages.length === 1 ? "Kijiji 1" : `Vijiji ${villages.length}`}</p>
              <ul>
                {villages.map((v) => <li key={v._id}>{v.name}</li>)}
              </ul>
              {canEdit && <AddForm kind="village" parentId={w._id} placeholder="Ongeza kijiji" />}
            </article>
          );
        })}
      </div>
    </section>
  );
}
