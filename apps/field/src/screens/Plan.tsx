/**
 * The production plan for a financial year, set in July: planned area per
 * crop, and yearly targets for each of the officer's sections. Each section's
 * plan goes to that section's lead for approval.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { parseAsString, useQueryState } from "nuqs";
import {
  ALL_CROPS,
  ARABLE_KEY,
  CROPS,
  financialYear,
  metricsFor,
  monthKey,
  planKey,
  SECTION_LABELS,
  yieldKey,
  type ProductionPlan,
  type Section,
} from "@afisa/shared";
import { IconTrash, Select, useLabel, useT } from "@afisa/ui";
import { useWork } from "../lib/session";
import { proposePreset, useCouncilDefaults, usePresetRows, type CouncilDefault } from "../lib/presets";
import type { LocalPreset } from "../lib/db";
import { PresetAsk } from "./PresetAsk";

type Draft = { crops: Record<string, string>; targets: Record<string, string>; note: string };

const toNum = (s: string) => {
  const v = Number(s.replace(",", "."));
  return s.trim() !== "" && Number.isFinite(v) ? v : undefined;
};
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const PLANT_CROPS = [...CROPS, ...ALL_CROPS.filter((c) => !CROPS.some((x) => x.value === c.value) && c.value !== "nyingine")];

function draftFrom(plan: ProductionPlan | undefined): Draft {
  return {
    crops: Object.fromEntries(Object.entries(plan?.crops ?? {}).map(([k, v]) => [k, String(v.area)])),
    targets: Object.fromEntries(Object.entries(plan?.targets ?? {}).map(([k, v]) => [k, String(v)])),
    note: plan?.note ?? "",
  };
}

function planFrom(d: Draft, section: Section): ProductionPlan {
  const plan: ProductionPlan = {};
  if (section === "kilimo") {
    const crops: NonNullable<ProductionPlan["crops"]> = {};
    for (const [c, a] of Object.entries(d.crops)) {
      const area = toNum(a);
      if (area !== undefined && area > 0) crops[c] = { area };
    }
    plan.crops = crops;
  }
  const targets: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.targets)) {
    const n = toNum(v);
    if (n !== undefined && n > 0) targets[k] = n;
  }
  if (Object.keys(targets).length) plan.targets = targets;
  if (d.note.trim()) plan.note = d.note.trim();
  return plan;
}

function PlanStatus({ row }: { row: LocalPreset | undefined }) {
  const t = useT();
  if (!row) return <p className="plan-status">{t("Bado hujaweka mpango wa mwaka huu.", "You have not set a plan for this year yet.")}</p>;
  if (row.syncState === "pending") return <p className="plan-status tone-wait">{t("Umehifadhi; utatumwa ukipata mtandao, kisha mkuu wa sehemu ataidhinisha.", "Saved; it will be sent when you are online, then the section head approves it.")}</p>;
  if (row.syncState === "rejected") return <p className="plan-status tone-danger">{t("Haukupokelewa", "Not accepted")}: {row.error}</p>;
  if (row.status === "approved") {
    const by = row.approvedByName ? t(` na ${row.approvedByName}`, ` by ${row.approvedByName}`) : "";
    return <p className="plan-status tone-ok">{t(`Umeidhinishwa${by}. Unatumika kwenye ripoti.`, `Approved${by}. It is used in the reports.`)}</p>;
  }
  if (row.status === "rejected") return <p className="plan-status tone-danger">{t("Umekataliwa", "Rejected")}{row.note ? `: “${row.note}”` : ""}. {t("Rekebisha kisha tuma tena.", "Fix it, then send again.")}</p>;
  return <p className="plan-status tone-wait">{t("Unasubiri idhini ya mkuu wa sehemu.", "Waiting for the section head's approval.")}{row.approvedValue ? t(" Mpango ulioidhinishwa awali unaendelea kutumika.", " The plan approved before is still in use.") : ""}</p>;
}

function SectionPlan({ fy, section, rows, defaults }: { fy: string; section: Section; rows: LocalPreset[]; defaults: CouncilDefault[] }) {
  const { councilId } = useWork();
  const t = useT();
  const key = planKey(fy, section);
  const row = rows.find((r) => r.key === key);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const source = (row?.value ?? row?.approvedValue) as ProductionPlan | undefined;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(source));
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setDraft(draftFrom(source));
    // Reload only when the stored proposal itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.clientId]);

  const metrics = metricsFor(section);
  const chosen = PLANT_CROPS.filter((c) => c.value in draft.crops);
  const remaining = PLANT_CROPS.filter((c) => !(c.value in draft.crops));
  const plan = planFrom(draft, section);
  const unchanged = JSON.stringify(plan) === JSON.stringify(row?.value ?? {});
  const empty = Object.keys(plan.crops ?? {}).length === 0 && !plan.targets;

  const councilOf = (crop: string) => defaults.find((d) => d.key === yieldKey(crop))?.value;
  const ownOf = (crop: string) => {
    const r = byKey.get(yieldKey(crop));
    return typeof r?.approvedValue === "number" ? r.approvedValue : undefined;
  };
  // The officer's approved yield, else the council's.
  const tijaOf = (crop: string) => ownOf(crop) ?? councilOf(crop);
  const totalArea = Object.values(plan.crops ?? {}).reduce((a, c) => a + c.area, 0);
  const totalTarget = Object.entries(plan.crops ?? {}).reduce((a, [c, v]) => a + v.area * (tijaOf(c) ?? 0), 0);

  const save = async () => {
    await proposePreset(councilId, key, plan);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <section className="plan-section stack">
      <PlanStatus row={row} />

      {section === "kilimo" && (
        <div className="stack">
          <h2 className="section-title">{t("Mazao na eneo litakalopandwa", "Crops and area to plant")}</h2>
          <p className="muted">{t("Lengo la mavuno = eneo × tija. Tija ya kila zao huwekwa mara moja, na hutumika baada ya kuidhinishwa.", "Harvest target = area × yield. Each crop's yield is set once, and is used once approved.")}</p>
          {chosen.map((c) => {
            const area = toNum(draft.crops[c.value] ?? "");
            const tija = tijaOf(c.value);
            return (
              <div key={c.value} className="crop-row plan-crop">
                <div className="crop-row-head">
                  <strong>{c.label}</strong>
                  <button
                    type="button"
                    className="icon-btn is-danger"
                    aria-label={t(`Ondoa ${c.label}`, `Remove ${c.label}`)}
                    title={t("Ondoa", "Remove")}
                    onClick={() => setDraft((d) => {
                      const crops = { ...d.crops };
                      delete crops[c.value];
                      return { ...d, crops };
                    })}
                  >
                    <IconTrash />
                  </button>
                </div>
                <label className="field">
                  <span>{t("Eneo litakalopandwa", "Area to plant")}</span>
                  <span className="with-unit">
                    <input
                      className="input"
                      inputMode="decimal"
                      value={draft.crops[c.value] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, crops: { ...d.crops, [c.value]: e.target.value.replace(/[^0-9.,]/g, "") } }))}
                    />
                    <span className="unit">ha</span>
                  </span>
                </label>
                {tija !== undefined && (
                  <p className="computed">
                    {t(`Tija ${fmt(tija)} tani/ha`, `Yield ${fmt(tija)} t/ha`)}
                    {ownOf(c.value) === undefined ? t(" (ya halmashauri)", " (council's)") : ""}
                    {area ? t(`: lengo la mavuno tani ${fmt(area * tija)}`, `: harvest target ${fmt(area * tija)} t`) : ""}
                  </p>
                )}
                {(ownOf(c.value) === undefined || byKey.get(yieldKey(c.value))?.status !== "approved") && (
                  <PresetAsk
                    councilId={councilId}
                    presetKey={yieldKey(c.value)}
                    row={byKey.get(yieldKey(c.value))}
                    reason={t("Kukokotoa lengo la mavuno", "To work out the harvest target")}
                    councilValue={councilOf(c.value)}
                    compact={councilOf(c.value) !== undefined && !byKey.get(yieldKey(c.value))}
                  />
                )}
              </div>
            );
          })}
          <Select
            value=""
            label={t("Ongeza zao", "Add a crop")}
            placeholder={t("Ongeza zao kwenye mpango…", "Add a crop to the plan…")}
            onChange={(v) => v && setDraft((d) => ({ ...d, crops: { ...d.crops, [v]: "" } }))}
            options={remaining.map((c) => ({ value: c.value, label: c.label }))}
          />
          {totalArea > 0 && (
            <p className="plan-total">
              {t(`Jumla: ha ${fmt(totalArea)}`, `Total: ${fmt(totalArea)} ha`)}
              {totalTarget > 0 ? t(`, lengo la mavuno tani ${fmt(totalTarget)}`, `, harvest target ${fmt(totalTarget)} t`) : ""}
            </p>
          )}
        </div>
      )}

      {metrics.length > 0 && (
        <div className="stack">
          <h2 className="section-title">{section === "kilimo" ? t("Malengo mengine ya mwaka", "Other yearly targets") : t("Malengo ya mwaka", "Yearly targets")}</h2>
          <p className="muted">{t("Jaza yale yanayohusu eneo lako tu. Utekelezaji unahesabiwa kutoka kumbukumbu zako.", "Fill in only those that apply to your area. Progress is counted from your records.")}</p>
          {metrics.map((m) => (
            <label key={m.key} className="field">
              <span>{m.label}</span>
              <span className="with-unit">
                <input
                  className="input"
                  inputMode="decimal"
                  value={draft.targets[m.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, targets: { ...d.targets, [m.key]: e.target.value.replace(/[^0-9.,]/g, "") } }))}
                />
                <span className="unit">{m.unit}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      <label className="field">
        <span>{t("Maelezo (si lazima)", "Notes (optional)")}</span>
        <textarea className="textarea" value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
      </label>

      <div className="form-actions">
        <button className="btn btn-primary btn-block" disabled={unchanged || empty} onClick={() => void save()}>
          {row ? t("Tuma mabadiliko kwa idhini", "Send changes for approval") : t("Tuma mpango kwa idhini", "Send plan for approval")}
        </button>
        {saved && <p className="form-ok" role="status">{t("Umehifadhiwa. Utaonekana makao makuu kwa idhini.", "Saved. HQ will see it for approval.")}</p>}
      </div>

      {section === "kilimo" && (
        <div className="stack">
          <h2 className="section-title">{t("Viwango vingine", "Other figures")}</h2>
          <PresetAsk councilId={councilId} presetKey={ARABLE_KEY} row={byKey.get(ARABLE_KEY)} reason={t("Kuonyesha asilimia ya eneo linalofaa lililolimwa", "To show the share of arable land that was farmed")} />
        </div>
      )}
    </section>
  );
}

export function Plan() {
  const navigate = useNavigate();
  const t = useT();
  const label = useLabel();
  const { councilId, sections, membership } = useWork();
  const rows = usePresetRows(councilId);
  const defaults = useCouncilDefaults(councilId);
  const current = financialYear(monthKey(new Date()));
  const [fyParam, setFy] = useQueryState("mwaka", parseAsString);
  const fy = fyParam && /^\d{4}\/\d{2}$/.test(fyParam) ? fyParam : current;
  const [sectionParam, setSection] = useQueryState("sehemu", parseAsString);
  const section = (sections.find((s) => s === sectionParam) ?? (sections.includes(membership.primarySection) ? membership.primarySection : sections[0]!)) as Section;
  const shiftFy = (d: number) => {
    const start = Number(fy.slice(0, 4)) + d;
    void setFy(`${start}/${String((start + 1) % 100).padStart(2, "0")}`);
  };
  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/ripoti?aina=malengo", { replace: true }));

  return (
    <main className="page narrow stack">
      <button type="button" className="back" onClick={goBack}>{t("Rudi", "Back")}</button>
      <header className="month-head">
        <button className="btn btn-quiet btn-small" onClick={() => shiftFy(-1)} aria-label={t("Mwaka uliopita", "Previous year")}>‹</button>
        <div className="food-title">
          <h1 className="page-title">{t("Mpango wa uzalishaji", "Production plan")}</h1>
          <p className="muted">{t(`Mwaka wa fedha ${fy} (Julai–Juni)`, `Financial year ${fy} (July–June)`)}</p>
        </div>
        <button className="btn btn-quiet btn-small" onClick={() => shiftFy(1)} disabled={fy >= current} aria-label={t("Mwaka unaofuata", "Next year")}>›</button>
      </header>

      {sections.length > 1 && (
        <div className="chips" role="tablist" aria-label={t("Sehemu", "Section")}>
          {sections.map((s) => (
            <button key={s} type="button" role="tab" className={`chip sec sec-${s}`} aria-selected={s === section} aria-pressed={s === section} onClick={() => void setSection(s)}>
              <span className="sec-tag" aria-hidden />
              {label(SECTION_LABELS[s])}
            </button>
          ))}
        </div>
      )}

      {rows && defaults && <SectionPlan key={`${fy}:${section}`} fy={fy} section={section} rows={rows} defaults={defaults} />}
    </main>
  );
}
