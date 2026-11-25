import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import {
  approvableRoles,
  canApproveRequest,
  canManageMember,
  designationLabel,
  LEVEL_LABELS,
  levelForAreas,
  ROLE_LABELS,
  SECTION_LABELS,
  SECTIONS,
  type Role,
  type Section,
} from "@afisa/shared";
import { errorMessage, Select, useLabel, useT } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { AreaPicker, SectionTags, toTarget, useAreas, when, type MemberRow } from "./common";

function Decide({ row, onDone }: { row: MemberRow; onDone: () => void }) {
  const t = useT();
  const label = useLabel();
  const { councilId, actor } = useHq();
  const approve = useMutation(api.memberships.approve);
  const reject = useMutation(api.memberships.reject);
  const target = toTarget(row);
  const areas = useAreas();
  // Section leads only ever make officers, so the role list is the same in every section.
  const roles = approvableRoles(actor, target);
  const [role, setRole] = useState<Role | "">(roles.length === 1 ? roles[0]! : "");
  const [section, setSection] = useState<Section>(row.primarySection);
  const [areaIds, setAreaIds] = useState<Id<"areas">[]>(row.requestedAreaId ? [row.requestedAreaId] : []);
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

  const officer = role === "officer";
  const sectionAllowed = role !== "" && canApproveRequest(actor, { ...target, primarySection: section }, role);
  const ready = role !== "" && sectionAllowed && (!officer || areaIds.length > 0);
  const sectionMatters = role === "officer" || role === "section_head" || role === "section_vice";

  return (
    <div className="decide">
      {row.requestedRole && (
        <p className="muted small">
          {t("Kwenye programu ya zamani aliandika kuwa ni", "On an older app version they said they are")} {label(ROLE_LABELS[row.requestedRole])}.
        </p>
      )}
      {roles.length === 0 ? (
        <div className="notice notice-wait"><p>{t("Huna ruhusa ya kumpa mtu huyu cheo. Unaweza kukataa ombi.", "You cannot give this person a position. You can decline the request.")}</p></div>
      ) : (
        <div className="field">
          <span className="field-label" id={`role-${row._id}`}>{t("Cheo", "Position")}</span>
          <Select
            labelledBy={`role-${row._id}`}
            label={t("Cheo", "Position")}
            value={role}
            onChange={(v) => setRole(v as Role)}
            placeholder={t("Chagua cheo", "Choose a position")}
            options={roles.map((r) => ({ value: r, label: label(ROLE_LABELS[r]) }))}
          />
          {!actor.isRoot && <small>{t("Mkuu wa Idara huwekwa na msimamizi wa mfumo.", "The Head of Department is seated by the system administrator.")}</small>}
        </div>
      )}

      {sectionMatters && (
        <fieldset className="field plain">
          <legend>{role === "officer" ? t("Sehemu kuu", "Main section") : t("Sehemu atakayoongoza", "Section they will lead")}</legend>
          <div className="chips">
            {SECTIONS.map((s) => (
              <button
                type="button"
                key={s}
                className={`chip sec sec-${s}`}
                aria-pressed={section === s}
                disabled={!canApproveRequest(actor, { ...target, primarySection: s }, role as Role)}
                onClick={() => setSection(s)}
              >
                <span className="sec-tag" aria-hidden />
                {label(SECTION_LABELS[s])}
              </button>
            ))}
          </div>
          {section !== row.primarySection && <small>{t(`Aliomba ${label(SECTION_LABELS[row.primarySection])}.`, `They asked for ${label(SECTION_LABELS[row.primarySection])}.`)}</small>}
        </fieldset>
      )}

      {officer && (
        <div className="field">
          <span>{t("Maeneo ya kazi", "Work areas")}</span>
          <small>
            {row.areaHint ? <>{t("Aliomba:", "Asked for:")} “{row.areaHint}”. </> : null}
            {t("Akipangiwa kata atakuwa wa ngazi ya kata; vijiji pekee ni ngazi ya kijiji.", "Any ward makes them ward level; villages only make them village level.")}
          </small>
          <AreaPicker value={areaIds} onChange={setAreaIds} />
          <small className="tone-ok">
            {label(designationLabel(section))}
            {areaIds.length > 0 && `, ${label(LEVEL_LABELS[levelForAreas(areaIds.map((id) => areas?.find((a) => a._id === id)?.kind ?? "village"))]).toLowerCase()}`}
          </small>
        </div>
      )}

      <label className="field">
        <span>{t("Maelezo", "Note")}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Lazima ukikataa ombi", "Required when you decline")} />
      </label>
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      <div className="row-actions">
        <button
          className="btn btn-primary"
          disabled={busy || !ready}
          onClick={() =>
            role !== "" &&
            void run(() =>
              approve({
                councilId,
                membershipId: row._id,
                role,
                primarySection: section,
                areaIds: officer ? areaIds : [],
                note: note || undefined,
                client: hqClient,
              }),
            )
          }
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
        <p className="muted">
          {actor.isRoot
            ? t("Wageni wapya wa halmashauri hii. Mpe Mkuu wa Idara cheo chake; yeye na wakuu wa sehemu watawaidhinisha wengine.", "New guests of this council. Seat the Head of Department; they and the section heads approve everyone else.")
            : t("Wageni wapya husubiri hapa hadi uwape cheo, ngazi na maeneo ya kazi.", "New guests wait here until you give them a position, level and work areas.")}
        </p>
      </header>
      {rows === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {rows?.length === 0 && <p className="empty">{t("Hakuna ombi linalosubiri.", "No requests waiting.")}</p>}
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
                    <span className="requested-role">{label(ROLE_LABELS.guest)}</span>
                    {r.areaHint && <span>“{r.areaHint}”</span>}
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
              {expanded && allowed && <Decide row={r} onDone={() => setOpen(null)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
