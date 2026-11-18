import { Fragment, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import {
  assignableRoles,
  canAssignRole,
  canGrantSection,
  canManageMember,
  canRevokeSection,
  ROLE_LABELS,
  SECTION_LABELS,
  SECTIONS,
  type Role,
} from "@afisa/shared";
import { errorMessage, Select } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { AreaPicker, areaNames, SectionTags, toTarget, useAreas, type MemberRow } from "./common";

const STATUS_LABELS = { active: "Hai", pending: "Linasubiri", suspended: "Limesitishwa", rejected: "Limekataliwa" } as const;
const statusFilter = ["active", "suspended", "rejected", "zote"] as const;
const sectionFilter = [...SECTIONS, "zote"] as const;

function Manage({ row }: { row: MemberRow }) {
  const { councilId, actor } = useHq();
  const assignRole = useMutation(api.memberships.assignRole);
  const grant = useMutation(api.memberships.grantSection);
  const revoke = useMutation(api.memberships.revokeSection);
  const setActive = useMutation(api.memberships.setActive);
  const assignAreas = useMutation(api.memberships.assignAreas);
  const [areas, setAreas] = useState<Id<"areas">[]>(row.areaIds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = toTarget(row);
  const base = { councilId, membershipId: row._id, client: hqClient };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const roles = assignableRoles(actor).filter((r) => canAssignRole(actor, target, r));
  const manage = canManageMember(actor, target);
  const areasChanged = areas.length !== row.areaIds.length || areas.some((a) => !row.areaIds.includes(a));

  return (
    <div className="manage">
      {roles.length > 0 && (
        <div className="field">
          <span className="field-label" id={`role-${row._id}`}>Cheo</span>
          <Select
            labelledBy={`role-${row._id}`}
            label="Badili cheo"
            value=""
            disabled={busy}
            placeholder={`${ROLE_LABELS[row.role].sw} (sasa). Badili kuwa…`}
            onChange={(v) => v && void run(() => assignRole({ ...base, role: v as Role }))}
            options={roles.map((r) => ({
              value: r,
              label: `${ROLE_LABELS[r].sw}${r === "section_head" || r === "section_vice" ? ` wa ${SECTION_LABELS[row.primarySection].sw}` : ""}`,
            }))}
          />
        </div>
      )}

      <div className="field">
        <span>Sehemu</span>
        <div className="chips">
          {SECTIONS.map((s) => {
            const has = row.sections.includes(s);
            const can = has ? canRevokeSection(actor, target, s) : canGrantSection(actor, target, s);
            return (
              <button
                key={s}
                type="button"
                className={`chip sec sec-${s}`}
                aria-pressed={has}
                disabled={busy || !can}
                title={s === row.primarySection ? "Sehemu kuu haiwezi kuondolewa" : undefined}
                onClick={() => void run(() => (has ? revoke({ ...base, section: s }) : grant({ ...base, section: s })))}
              >
                <span className="sec-tag" aria-hidden />
                {SECTION_LABELS[s].sw}
              </button>
            );
          })}
        </div>
        <small>Sehemu ya ziada huongezwa na mkuu wa sehemu hiyo pekee.</small>
      </div>

      {manage && (
        <div className="field">
          <span>Maeneo ya kazi</span>
          <AreaPicker value={areas} onChange={setAreas} />
          {areasChanged && (
            <button className="btn btn-primary btn-small" disabled={busy} onClick={() => void run(() => assignAreas({ ...base, areaIds: areas }))}>
              Hifadhi maeneo
            </button>
          )}
        </div>
      )}

      {manage && (row.status === "active" || row.status === "suspended") && (
        <div className="row-actions">
          {row.status === "active" ? (
            <button className="btn btn-danger btn-small" disabled={busy} onClick={() => void run(() => setActive({ ...base, active: false }))}>
              Sitisha akaunti
            </button>
          ) : (
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => void run(() => setActive({ ...base, active: true }))}>
              Rejesha akaunti
            </button>
          )}
        </div>
      )}
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
    </div>
  );
}

export function Members() {
  const { councilId } = useHq();
  const [filters, setFilters] = useQueryStates({
    hali: parseAsStringLiteral(statusFilter).withDefault("active"),
    sehemu: parseAsStringLiteral(sectionFilter).withDefault("zote"),
  });
  const rows = useQuery(api.memberships.listForHq, {
    councilId,
    status: filters.hali === "zote" ? undefined : filters.hali,
  });
  const areas = useAreas();
  const [open, setOpen] = useState<string | null>(null);
  const shown = rows?.filter((r) => r.status !== "pending" && (filters.sehemu === "zote" || r.sections.includes(filters.sehemu)));

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>Wanachama</h1>
        <div className="filters">
          <div className="field inline">
            <span id="f-hali">Hali</span>
            <Select
              size="sm"
              labelledBy="f-hali"
              label="Hali"
              value={filters.hali}
              onChange={(v) => void setFilters({ hali: v as (typeof statusFilter)[number] })}
              options={[
                { value: "active", label: "Hai" },
                { value: "suspended", label: "Waliositishwa" },
                { value: "rejected", label: "Waliokataliwa" },
                { value: "zote", label: "Wote" },
              ]}
            />
          </div>
          <div className="field inline">
            <span id="f-sehemu">Sehemu</span>
            <Select
              size="sm"
              labelledBy="f-sehemu"
              label="Sehemu"
              value={filters.sehemu}
              onChange={(v) => void setFilters({ sehemu: v as (typeof sectionFilter)[number] })}
              options={[{ value: "zote", label: "Zote" }, ...SECTIONS.map((s) => ({ value: s, label: SECTION_LABELS[s].sw }))]}
            />
          </div>
        </div>
      </header>

      {shown?.length === 0 && <p className="empty">Hakuna mwanachama kwa vichujio hivi.</p>}
      {shown && shown.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Jina</th>
              <th>Cheo</th>
              <th>Sehemu</th>
              <th>Maeneo</th>
              <th>Hali</th>
              <th><span className="visually-hidden">Hatua</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const expanded = open === r._id;
              return (
                <Fragment key={r._id}>
                  <tr className={expanded ? "is-open" : undefined}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.isSelf && <span className="muted"> (wewe)</span>}
                      {r.phone && <div className="muted small">{r.phone}</div>}
                    </td>
                    <td>{ROLE_LABELS[r.role].sw}{r.level ? ` (${r.level.toUpperCase()})` : ""}</td>
                    <td><SectionTags sections={r.sections} primary={r.primarySection} /></td>
                    <td className="small">{areaNames(r.areaIds, areas) || <span className="muted">Hajapangiwa</span>}</td>
                    <td><span className={`status status-${r.status}`}>{STATUS_LABELS[r.status]}</span></td>
                    <td>
                      {!r.isSelf && (
                        <button className="btn btn-quiet btn-small" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r._id)}>
                          {expanded ? "Funga" : "Simamia"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="manage-row">
                      <td colSpan={6}><Manage row={r} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
