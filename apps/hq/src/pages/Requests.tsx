import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { canManageMember, type OfficerLevel } from "@afisa/shared";
import { errorMessage } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { AreaPicker, SectionTags, toTarget, when, type MemberRow } from "./common";

function Decide({ row, onDone }: { row: MemberRow; onDone: () => void }) {
  const { councilId } = useHq();
  const approve = useMutation(api.memberships.approve);
  const reject = useMutation(api.memberships.reject);
  const [areaIds, setAreaIds] = useState<Id<"areas">[]>([]);
  const [level, setLevel] = useState<OfficerLevel>(row.level ?? "vaeo");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="decide">
      <div className="field">
        <span>Maeneo ya kazi</span>
        {row.areaHint && <small>Ameandika: “{row.areaHint}”</small>}
        <AreaPicker value={areaIds} onChange={setAreaIds} />
      </div>
      <fieldset className="field plain">
        <legend>Ngazi</legend>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={level === "vaeo"} onClick={() => setLevel("vaeo")}>Kijiji (VAEO)</button>
          <button type="button" className="chip" aria-pressed={level === "waeo"} onClick={() => setLevel("waeo")}>Kata (WAEO)</button>
        </div>
      </fieldset>
      <label className="field">
        <span>Maelezo</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lazima ukikataa ombi" />
      </label>
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      <div className="row-actions">
        <button
          className="btn btn-primary"
          disabled={busy || areaIds.length === 0}
          onClick={() => void run(() => approve({ councilId, membershipId: row._id, areaIds, level, note: note || undefined, client: hqClient }))}
        >
          Idhinisha
        </button>
        <button
          className="btn btn-danger"
          disabled={busy || note.trim().length < 3}
          onClick={() => void run(() => reject({ councilId, membershipId: row._id, note, client: hqClient }))}
        >
          Kataa
        </button>
      </div>
    </div>
  );
}

export function Requests() {
  const { councilId, actor } = useHq();
  const rows = useQuery(api.memberships.listForHq, { councilId, status: "pending" });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>Maombi ya kujiunga</h1>
        <p className="muted">Maafisa wapya husubiri hapa hadi uwaidhinishe na kuwapangia maeneo.</p>
      </header>
      {rows === undefined && <p className="muted">Inapakia…</p>}
      {rows?.length === 0 && <p className="empty">Hakuna ombi linalosubiri.</p>}
      <ul className="request-list">
        {rows?.map((r) => {
          const allowed = canManageMember(actor, toTarget(r));
          const expanded = open === r._id;
          return (
            <li key={r._id} className={`request sec sec-${r.primarySection}`}>
              <div className="request-head">
                <div>
                  <strong className="request-name">{r.name}</strong>
                  <div className="request-meta">
                    <SectionTags sections={r.sections} />
                    <span>{r.level === "waeo" ? "Kata (WAEO)" : "Kijiji (VAEO)"}</span>
                    {r.phone && <span>{r.phone}</span>}
                    <span>Aliomba {when(r.requestedAt)}</span>
                  </div>
                </div>
                {allowed ? (
                  <button className="btn btn-quiet btn-small" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r._id)}>
                    {expanded ? "Funga" : "Shughulikia"}
                  </button>
                ) : (
                  <span className="muted small">Kwa mkuu wa sehemu husika</span>
                )}
              </div>
              {expanded && allowed && <Decide row={r} onDone={() => setOpen(null)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
