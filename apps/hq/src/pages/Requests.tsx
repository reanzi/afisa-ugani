import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { canApproveRequest, canManageMember, ROLE_LABELS, type OfficerLevel } from "@afisa/shared";
import { errorMessage, useLabel, useT } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { AreaPicker, SectionTags, toTarget, when, type MemberRow } from "./common";

function Decide({ row, onDone, canApprove }: { row: MemberRow; onDone: () => void; canApprove: boolean }) {
  const t = useT();
  const label = useLabel();
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

  const officer = !row.requestedRole;
  return (
    <div className="decide">
      {officer ? (
        <>
          <div className="field">
            <span>{t("Maeneo ya kazi", "Work areas")}</span>
            {row.areaHint && <small>{t("Ameandika:", "They wrote:")} “{row.areaHint}”</small>}
            <AreaPicker value={areaIds} onChange={setAreaIds} />
          </div>
          <fieldset className="field plain">
            <legend>{t("Ngazi", "Level")}</legend>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={level === "vaeo"} onClick={() => setLevel("vaeo")}>{t("Kijiji (VAEO)", "Village (VAEO)")}</button>
              <button type="button" className="chip" aria-pressed={level === "waeo"} onClick={() => setLevel("waeo")}>{t("Kata (WAEO)", "Ward (WAEO)")}</button>
            </div>
          </fieldset>
        </>
      ) : (
        <p>
          {t("Ukiidhinisha, atakuwa", "If you approve, they become")} <strong>{label(ROLE_LABELS[row.requestedRole!])}</strong>
          {row.requestedRole === "section_head" || row.requestedRole === "section_vice" ? t(" wa sehemu aliyochagua", " of the section they chose") : ""}
          {t(" na ataweza kutumia makao makuu.", " and can use head office.")}
        </p>
      )}
      <label className="field">
        <span>{t("Maelezo", "Note")}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Lazima ukikataa ombi", "Required when you decline")} />
      </label>
      {!canApprove && (
        <div className="notice notice-wait">
          <p>
            {row.requestedRole === "admin"
              ? t("Ombi la Mkuu wa Idara huidhinishwa na msimamizi wa mfumo.", "A Head of Department request is approved by the system administrator.")
              : t("Huna ruhusa ya kutoa cheo hiki. Unaweza kukataa ombi.", "You cannot give this position. You can decline the request.")}
          </p>
        </div>
      )}
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      <div className="row-actions">
        <button
          className="btn btn-primary"
          disabled={busy || !canApprove || (officer && areaIds.length === 0)}
          onClick={() => void run(() => approve({ councilId, membershipId: row._id, areaIds, level, note: note || undefined, client: hqClient }))}
        >
          {t("Idhinisha", "Approve")}
        </button>
        <button
          className="btn btn-danger"
          disabled={busy || note.trim().length < 3}
          onClick={() => void run(() => reject({ councilId, membershipId: row._id, note, client: hqClient }))}
        >
          {t("Kataa", "Decline")}
        </button>
      </div>
    </div>
  );
}

export function Requests() {
  const t = useT();
  const label = useLabel();
  const { councilId, actor } = useHq();
  const rows = useQuery(api.memberships.listForHq, { councilId, status: "pending" });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>{t("Maombi ya kujiunga", "Requests to join")}</h1>
        <p className="muted">{t("Maafisa wapya husubiri hapa hadi uwaidhinishe na kuwapangia maeneo.", "New officers wait here until you approve them and assign their areas.")}</p>
      </header>
      {rows === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {rows?.length === 0 && <p className="empty">{t("Hakuna ombi linalosubiri.", "No requests waiting.")}</p>}
      <ul className="request-list">
        {rows?.map((r) => {
          const allowed = canManageMember(actor, toTarget(r));
          const canApprove = canApproveRequest(actor, toTarget(r), r.requestedRole);
          const expanded = open === r._id;
          return (
            <li key={r._id} className={`request sec sec-${r.primarySection}`}>
              <div className="request-head">
                <div>
                  <strong className="request-name">{r.name}</strong>
                  <div className="request-meta">
                    <SectionTags sections={r.sections} />
                    {r.requestedRole ? (
                      <span className="requested-role">{t("Anaomba:", "Asks for:")} {label(ROLE_LABELS[r.requestedRole])}</span>
                    ) : (
                      <span>{r.level === "waeo" ? t("Kata (WAEO)", "Ward (WAEO)") : t("Kijiji (VAEO)", "Village (VAEO)")}</span>
                    )}
                    {r.checkNumber && <span>{t("Namba ya utumishi", "Check no.")} {r.checkNumber}</span>}
                    {r.phone && <span>{r.phone}</span>}
                    <span>{t("Aliomba", "Asked")} {when(r.requestedAt)}</span>
                  </div>
                </div>
                {allowed ? (
                  <button className="btn btn-quiet btn-small" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r._id)}>
                    {expanded ? t("Funga", "Close") : t("Shughulikia", "Review")}
                  </button>
                ) : (
                  <span className="muted small">{t("Kwa mkuu wa sehemu husika", "For the section's head")}</span>
                )}
              </div>
              {expanded && allowed && <Decide row={r} canApprove={canApprove} onDone={() => setOpen(null)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
