import { Fragment, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import {
  assignableRoles,
  canAssignRole,
  designationLabel,
  LEVEL_LABELS,
  canGrantSection,
  canManageMember,
  canRevokeSection,
  ROLE_LABELS,
  SECTION_LABELS,
  SECTIONS,
  type Role,
} from "@afisa/shared";
import { errorMessage, Select, useConfirm, useLabel, useT, type T } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { AreaPicker, areaNames, SectionTags, toTarget, useAreas, type MemberRow } from "./common";

const statusLabel = (t: T, s: MemberRow["status"]) =>
  ({ active: t("Hai", "Active"), pending: t("Linasubiri", "Waiting"), suspended: t("Limesitishwa", "Suspended"), rejected: t("Limekataliwa", "Declined") })[s];
const statusFilter = ["active", "suspended", "rejected", "zote"] as const;
const sectionFilter = [...SECTIONS, "zote"] as const;

function Manage({ row }: { row: MemberRow }) {
  const t = useT();
  const label = useLabel();
  const confirm = useConfirm();
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
          <span className="field-label" id={`role-${row._id}`}>{t("Cheo", "Position")}</span>
          <Select
            labelledBy={`role-${row._id}`}
            label={t("Badili cheo", "Change position")}
            value=""
            disabled={busy}
            placeholder={t(`${label(ROLE_LABELS[row.role])} (sasa). Badili kuwa…`, `${label(ROLE_LABELS[row.role])} (now). Change to…`)}
            onChange={(v) => v && void run(() => assignRole({ ...base, role: v as Role }))}
            options={roles.map((r) => ({
              value: r,
              label: `${label(ROLE_LABELS[r])}${r === "section_head" || r === "section_vice" ? t(` wa ${label(SECTION_LABELS[row.primarySection])}`, `, ${label(SECTION_LABELS[row.primarySection])}`) : ""}`,
            }))}
          />
        </div>
      )}

      <div className="field">
        <span>{t("Sehemu", "Sections")}</span>
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
                title={s === row.primarySection ? t("Sehemu kuu haiwezi kuondolewa", "The main section cannot be removed") : undefined}
                onClick={() => void run(() => (has ? revoke({ ...base, section: s }) : grant({ ...base, section: s })))}
              >
                <span className="sec-tag" aria-hidden />
                {label(SECTION_LABELS[s])}
              </button>
            );
          })}
        </div>
        <small>{t("Sehemu ya ziada huongezwa na mkuu wa sehemu hiyo pekee.", "An extra section is added only by that section's head.")}</small>
      </div>

      {manage && (
        <div className="field">
          <span>{t("Maeneo ya kazi", "Work areas")}</span>
          <AreaPicker value={areas} onChange={setAreas} />
          {areasChanged && (
            <button className="btn btn-primary btn-small" disabled={busy} onClick={() => void run(() => assignAreas({ ...base, areaIds: areas }))}>
              {t("Hifadhi maeneo", "Save areas")}
            </button>
          )}
        </div>
      )}

      {manage && (row.status === "active" || row.status === "suspended") && (
        <div className="row-actions">
          {row.status === "active" ? (
            <button
              className="btn btn-danger btn-small"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: t(`Sitisha akaunti ya ${row.name}?`, `Suspend ${row.name}'s account?`),
                  body: t(
                    "Hataweza kuingia wala kutuma kumbukumbu hadi akaunti irejeshwe. Kumbukumbu zake hazifutwi.",
                    "They cannot sign in or send records until the account is restored. Their records are not deleted.",
                  ),
                  confirmLabel: t("Sitisha", "Suspend"),
                  tone: "danger",
                });
                if (ok) void run(() => setActive({ ...base, active: false }));
              }}
            >
              {t("Sitisha akaunti", "Suspend account")}
            </button>
          ) : (
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => void run(() => setActive({ ...base, active: true }))}>
              {t("Rejesha akaunti", "Restore account")}
            </button>
          )}
        </div>
      )}
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
    </div>
  );
}

export function Members() {
  const t = useT();
  const label = useLabel();
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
        <h1>{t("Wanachama", "Members")}</h1>
        <div className="filters">
          <div className="field inline">
            <span id="f-hali">{t("Hali", "Status")}</span>
            <Select
              size="sm"
              labelledBy="f-hali"
              label={t("Hali", "Status")}
              value={filters.hali}
              onChange={(v) => void setFilters({ hali: v as (typeof statusFilter)[number] })}
              options={[
                { value: "active", label: t("Hai", "Active") },
                { value: "suspended", label: t("Waliositishwa", "Suspended") },
                { value: "rejected", label: t("Waliokataliwa", "Declined") },
                { value: "zote", label: t("Wote", "Everyone") },
              ]}
            />
          </div>
          <div className="field inline">
            <span id="f-sehemu">{t("Sehemu", "Section")}</span>
            <Select
              size="sm"
              labelledBy="f-sehemu"
              label={t("Sehemu", "Section")}
              value={filters.sehemu}
              onChange={(v) => void setFilters({ sehemu: v as (typeof sectionFilter)[number] })}
              options={[{ value: "zote", label: t("Zote", "All") }, ...SECTIONS.map((s) => ({ value: s, label: label(SECTION_LABELS[s]) }))]}
            />
          </div>
        </div>
      </header>

      {shown?.length === 0 && <p className="empty">{t("Hakuna mwanachama kwa vichujio hivi.", "No members match these filters.")}</p>}
      {shown && shown.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t("Jina", "Name")}</th>
              <th>{t("Cheo", "Position")}</th>
              <th>{t("Sehemu", "Sections")}</th>
              <th>{t("Maeneo", "Areas")}</th>
              <th>{t("Hali", "Status")}</th>
              <th><span className="visually-hidden">{t("Hatua", "Actions")}</span></th>
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
                      {r.isSelf && <span className="muted">{t(" (wewe)", " (you)")}</span>}
                      <div className="muted small">{[r.checkNumber && t(`Namba ${r.checkNumber}`, `Check no. ${r.checkNumber}`), r.phone].filter(Boolean).join(", ")}</div>
                    </td>
                    <td>{r.role === "officer" && r.level ? `${label(designationLabel(r.primarySection))}, ${label(LEVEL_LABELS[r.level]).toLowerCase()}` : label(ROLE_LABELS[r.role])}</td>
                    <td><SectionTags sections={r.sections} primary={r.primarySection} /></td>
                    <td className="small">{areaNames(r.areaIds, areas) || <span className="muted">{t("Hajapangiwa", "Not assigned")}</span>}</td>
                    <td><span className={`status status-${r.status}`}>{statusLabel(t, r.status)}</span></td>
                    <td>
                      {!r.isSelf && (
                        <button className="btn btn-quiet btn-small" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r._id)}>
                          {expanded ? t("Funga", "Close") : t("Simamia", "Manage")}
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
