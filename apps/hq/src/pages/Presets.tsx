/**
 * Officers' presets (crop yields, arable area) and yearly production plans,
 * waiting for approval by the section lead. Approved values are what the
 * officer's reports use; a refused one goes back with the reason.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import {
  ALL_CROPS,
  CROPS,
  labelOf,
  metricsFor,
  parsePlanKey,
  presetDef,
  presetLabel,
  titleCaseName,
  yieldKey,
  type ProductionPlan,
} from "@afisa/shared";
import { Dialog, errorMessage, useT, Glide } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { SectionTags, when } from "./common";

const FILTERS = ["zinasubiri", "zote", "halmashauri"] as const;
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

function PlanDetails({ plan, yields, section }: { plan: ProductionPlan; yields: Record<string, number> | null; section: "kilimo" | "mifugo" | "uvuvi" }) {
  const t = useT();
  const crops = Object.entries(plan.crops ?? {});
  const metrics = metricsFor(section).filter((m) => plan.targets?.[m.key] !== undefined);
  let totalArea = 0;
  let totalTarget = 0;
  let known = true;
  return (
    <div className="plan-details">
      {crops.length > 0 && (
        <table className="plan-table">
          <thead>
            <tr>
              <th scope="col">{t("Zao", "Crop")}</th>
              <th scope="col" className="num">{t("Eneo (ha)", "Area (ha)")}</th>
              <th scope="col" className="num">{t("Tija iliyoidhinishwa (t/ha)", "Approved yield (t/ha)")}</th>
              <th scope="col" className="num">{t("Lengo la mavuno (tani)", "Target harvest (t)")}</th>
            </tr>
          </thead>
          <tbody>
            {crops.map(([crop, v]) => {
              const y = yields?.[crop];
              totalArea += v.area;
              if (y === undefined) known = false;
              else totalTarget += v.area * y;
              return (
                <tr key={crop}>
                  <th scope="row">{labelOf(ALL_CROPS, crop)}</th>
                  <td className="num">{fmt(v.area)}</td>
                  <td className="num">{y === undefined ? <span className="muted">{t("haijaidhinishwa", "not approved")}</span> : fmt(y)}</td>
                  <td className="num">{y === undefined ? "—" : fmt(v.area * y)}</td>
                </tr>
              );
            })}
            <tr className="total">
              <th scope="row">{t("Jumla", "Total")}</th>
              <td className="num">{fmt(totalArea)}</td>
              <td />
              <td className="num">{known ? fmt(totalTarget) : "—"}</td>
            </tr>
          </tbody>
        </table>
      )}
      {metrics.length > 0 && (
        <dl className="plan-targets">
          {metrics.map((m) => (
            <div key={m.key}>
              <dt>{m.label}</dt>
              <dd>
                {fmt(plan.targets![m.key]!)} {m.unit}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {plan.note && <p className="plan-note">{plan.note}</p>}
    </div>
  );
}

const DEFAULT_CROPS = [...CROPS, ...ALL_CROPS.filter((c) => !CROPS.some((x) => x.value === c.value) && c.value !== "nyingine")];

/**
 * Yields for the whole council. Officers use these unless they set their own
 * (which then needs approval), so most officers never have to enter one.
 */
function CouncilDefaults() {
  const t = useT();
  const { councilId } = useHq();
  const data = useQuery(api.presets.councilDefaultsForHq, { councilId });
  const set = useMutation(api.presets.setCouncilDefault);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!data) return <p className="muted">{t("Inapakia…", "Loading…")}</p>;
  const byKey = new Map(data.values.map((v) => [v.key, v]));

  const save = async (crop: string) => {
    const key = yieldKey(crop);
    const raw = (draft[crop] ?? "").trim();
    const value = raw === "" ? null : Number(raw.replace(",", "."));
    if (value !== null && !Number.isFinite(value)) return setError(t("Andika namba.", "Write a number."));
    setBusy(crop);
    setError(null);
    try {
      await set({ councilId, key, value, client: hqClient });
      setDraft((d) => {
        const next = { ...d };
        delete next[crop];
        return next;
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="council-defaults">
      <p className="muted">
        {t(
          "Tija (tani kwa hekta) ya kawaida katika halmashauri. Maafisa wanaitumia moja kwa moja; afisa mwenye tija tofauti katika eneo lake anaweka yake, na wewe unaidhinisha.",
          "Typical yield (tonnes per hectare) in the council. Officers use it directly; an officer whose area differs sets their own, which you approve.",
        )}
      </p>
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      <table className="plan-table defaults-table">
        <thead>
          <tr>
            <th scope="col">{t("Zao", "Crop")}</th>
            <th scope="col">{t("Tija (tani/ha)", "Yield (t/ha)")}</th>
            <th scope="col">{t("Imewekwa na", "Set by")}</th>
            <th scope="col"><span className="sr-only">{t("Hifadhi", "Save")}</span></th>
          </tr>
        </thead>
        <tbody>
          {DEFAULT_CROPS.map((c) => {
            const cur = byKey.get(yieldKey(c.value));
            const value = draft[c.value] ?? (cur ? String(cur.value) : "");
            const changed = c.value in draft && draft[c.value] !== (cur ? String(cur.value) : "");
            return (
              <tr key={c.value}>
                <th scope="row">{c.label}</th>
                <td>
                  <input
                    className="input input-sm"
                    inputMode="decimal"
                    aria-label={t(`Tija ya ${c.label}`, `${c.label} yield`)}
                    value={value}
                    disabled={!data.canEdit}
                    onChange={(e) => setDraft((d) => ({ ...d, [c.value]: e.target.value.replace(/[^0-9.,]/g, "") }))}
                  />
                </td>
                <td className="muted small">{cur ? `${cur.setByName || "—"}, ${when(cur.updatedAt)}` : t("Haijawekwa", "Not set")}</td>
                <td>
                  {data.canEdit && changed && (
                    <button className="btn btn-primary btn-small" disabled={busy !== null} onClick={() => void save(c.value)}>
                      {busy === c.value ? t("Inahifadhi…", "Saving…") : value.trim() === "" ? t("Ondoa", "Remove") : t("Hifadhi", "Save")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!data.canEdit && <p className="muted">{t("Viongozi wa sehemu ya kilimo na Mkuu wa Idara ndio wanaoweka viwango hivi.", "Crop section leads and the Head of Department set these.")}</p>}
    </div>
  );
}

export function Presets() {
  const t = useT();
  const { councilId } = useHq();
  const [filter, setFilter] = useQueryState("hali", parseAsStringLiteral(FILTERS).withDefault("zinasubiri"));
  const rows = useQuery(api.presets.forHq, filter === "halmashauri" ? "skip" : { councilId, status: filter === "zinasubiri" ? "pending" : undefined });
  const decide = useMutation(api.presets.decide);
  const [refusing, setRefusing] = useState<{ id: Id<"presets">; label: string; officer: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingCount = useMemo(() => rows?.filter((r) => r.status === "pending").length ?? 0, [rows]);

  const approve = async (id: Id<"presets">) => {
    setBusy(id);
    setError(null);
    try {
      await decide({ councilId, presetId: id, approve: true, client: hqClient });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const refuse = async () => {
    if (!refusing) return;
    setBusy(refusing.id);
    setError(null);
    try {
      await decide({ councilId, presetId: refusing.id, approve: false, note: note.trim(), client: hqClient });
      setRefusing(null);
      setNote("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>{t("Viwango na mipango", "Presets and plans")}</h1>
        <p className="muted">
          {t(
            "Maafisa huweka tija ya mazao, eneo linalofaa kwa kilimo na mpango wa uzalishaji wa mwaka. Vinatumika kwenye ripoti zao baada ya wewe kuidhinisha.",
            "Officers set crop yields, arable area and the year's production plan. Their reports use them once you approve.",
          )}
        </p>
        <div className="segmented report-kinds" role="tablist" aria-label={t("Hali", "Status")}>
          <button role="tab" aria-selected={filter === "zinasubiri"} onClick={() => void setFilter("zinasubiri")}>
            {t("Zinasubiri", "Waiting")}
            {filter === "zinasubiri" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
          <button role="tab" aria-selected={filter === "zote"} onClick={() => void setFilter("zote")}>{t("Za maafisa wote", "All officers'")}</button>
          <button role="tab" aria-selected={filter === "halmashauri"} onClick={() => void setFilter("halmashauri")}>{t("Za halmashauri", "Council-wide")}</button>
          <Glide />
        </div>
      </header>

      {filter === "halmashauri" && <CouncilDefaults />}

      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      {filter !== "halmashauri" && rows === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {rows?.length === 0 && (
        <p className="empty">{filter === "zinasubiri" ? t("Hakuna kinachosubiri idhini.", "Nothing is waiting for approval.") : t("Bado hakuna viwango.", "No presets yet.")}</p>
      )}

      <ul className="preset-list">
        {rows?.map((r) => {
          const def = presetDef(r.key);
          const plan = parsePlanKey(r.key);
          const label = presetLabel(r.key);
          const value = typeof r.value === "number" ? r.value : null;
          const approvedNum = typeof r.approvedValue === "number" ? r.approvedValue : null;
          const avg = r.councilAverage;
          const off = value !== null && avg ? Math.round(((value - avg) / avg) * 100) : null;
          return (
            <li key={r._id} className={`preset-card status-${r.status}`}>
              <div className="preset-main">
                <div className="preset-who">
                  <strong>{titleCaseName(r.officerName)}</strong>
                  <span className="muted">{r.areaLabel || t("Eneo halijapangwa", "No area yet")}</span>
                </div>
                <SectionTags sections={[r.section]} />
              </div>

              <div className="preset-body">
                <h2>{label}</h2>
                {def && value !== null && (
                  <p className="preset-value">
                    <strong>
                      {fmt(value)} {def.unit}
                    </strong>
                    {approvedNum !== null && r.status === "pending" && (
                      <span className="muted">
                        {" "}
                        {t("(inayotumika sasa", "(in use now")} {fmt(approvedNum)})
                      </span>
                    )}
                  </p>
                )}
                {def && avg !== null && (
                  <p className={`preset-compare${off !== null && Math.abs(off) >= 50 ? " is-far" : ""}`}>
                    {t("Wastani wa halmashauri", "Council average")}: {fmt(avg)} {def.unit}
                    {off !== null && off !== 0 ? ` (${off > 0 ? "+" : ""}${off}%)` : ""}
                  </p>
                )}
                {plan && <PlanDetails plan={(r.value ?? {}) as ProductionPlan} yields={r.yields} section={plan.section} />}
                <p className="muted small">
                  {r.status === "pending"
                    ? `${t("Iliwekwa", "Set")} ${when(r.proposedAt)}`
                    : r.status === "approved"
                      ? `${t("Imeidhinishwa", "Approved")}${r.approvedAt ? ` ${when(r.approvedAt)}` : ""}${r.approvedByName ? `, ${r.approvedByName}` : ""}`
                      : `${t("Imekataliwa", "Refused")}: “${r.note ?? ""}”`}
                </p>
              </div>

              {r.status === "pending" && r.canDecide && (
                <div className="preset-actions">
                  <button className="btn btn-primary" disabled={busy !== null} onClick={() => void approve(r._id)}>
                    {busy === r._id ? t("Inahifadhi…", "Saving…") : t("Idhinisha", "Approve")}
                  </button>
                  <button className="btn btn-quiet" disabled={busy !== null} onClick={() => setRefusing({ id: r._id, label, officer: titleCaseName(r.officerName) })}>
                    {t("Kataa", "Refuse")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={refusing !== null}
        onClose={() => setRefusing(null)}
        busy={busy !== null}
        title={t("Kataa na eleza sababu", "Refuse and give the reason")}
        actions={
          <>
            <button className="btn btn-primary btn-block" disabled={busy !== null || note.trim().length < 5} onClick={() => void refuse()}>
              {t("Kataa", "Refuse")}
            </button>
            <button className="btn btn-quiet btn-block" disabled={busy !== null} onClick={() => setRefusing(null)}>
              {t("Hapana", "Cancel")}
            </button>
          </>
        }
      >
        <p>
          {refusing?.officer}: {refusing?.label}.{" "}
          {t("Afisa ataona sababu kwenye simu na kuweka thamani nyingine.", "The officer sees the reason on the phone and sets another value.")}
        </p>
        <label className="field">
          <span>{t("Sababu", "Reason")}</span>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("mfano: Tija ya mahindi eneo hili ni karibu tani 2 kwa ha; hakiki tena.", "e.g. Maize yield here is about 2 t/ha; check again.")}
          />
        </label>
      </Dialog>
    </section>
  );
}
