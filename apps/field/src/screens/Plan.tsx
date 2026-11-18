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
import { IconTrash, Select } from "@afisa/ui";
import { useWork } from "../lib/session";
import { proposePreset, usePresetRows } from "../lib/presets";
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
  if (!row) return <p className="plan-status">Bado hujaweka mpango wa mwaka huu.</p>;
  if (row.syncState === "pending") return <p className="plan-status tone-wait">Umehifadhi; utatumwa ukipata mtandao, kisha mkuu wa sehemu ataidhinisha.</p>;
  if (row.syncState === "rejected") return <p className="plan-status tone-danger">Haukupokelewa: {row.error}</p>;
  if (row.status === "approved") return <p className="plan-status tone-ok">Umeidhinishwa{row.approvedByName ? ` na ${row.approvedByName}` : ""}. Unatumika kwenye ripoti.</p>;
  if (row.status === "rejected") return <p className="plan-status tone-danger">Umekataliwa{row.note ? `: “${row.note}”` : ""}. Rekebisha kisha tuma tena.</p>;
  return <p className="plan-status tone-wait">Unasubiri idhini ya mkuu wa sehemu.{row.approvedValue ? " Mpango ulioidhinishwa awali unaendelea kutumika." : ""}</p>;
}

function SectionPlan({ fy, section, rows }: { fy: string; section: Section; rows: LocalPreset[] }) {
  const { councilId } = useWork();
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

  const tijaOf = (crop: string) => {
    const r = byKey.get(yieldKey(crop));
    return typeof r?.approvedValue === "number" ? r.approvedValue : undefined;
  };
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
          <h2 className="section-title">Mazao na eneo litakalopandwa</h2>
          <p className="muted">Lengo la mavuno = eneo × tija. Tija ya kila zao huwekwa mara moja, na hutumika baada ya kuidhinishwa.</p>
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
                    aria-label={`Ondoa ${c.label}`}
                    title="Ondoa"
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
                  <span>Eneo litakalopandwa</span>
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
                {tija !== undefined ? (
                  <p className="computed">
                    Tija {fmt(tija)} tani/ha{area ? `: lengo la mavuno tani ${fmt(area * tija)}` : ""}
                  </p>
                ) : (
                  <PresetAsk councilId={councilId} presetKey={yieldKey(c.value)} row={byKey.get(yieldKey(c.value))} reason="Kukokotoa lengo la mavuno" />
                )}
              </div>
            );
          })}
          <Select
            value=""
            label="Ongeza zao"
            placeholder="Ongeza zao kwenye mpango…"
            onChange={(v) => v && setDraft((d) => ({ ...d, crops: { ...d.crops, [v]: "" } }))}
            options={remaining.map((c) => ({ value: c.value, label: c.label }))}
          />
          {totalArea > 0 && (
            <p className="plan-total">
              Jumla: ha {fmt(totalArea)}
              {totalTarget > 0 ? `, lengo la mavuno tani ${fmt(totalTarget)}` : ""}
            </p>
          )}
        </div>
      )}

      {metrics.length > 0 && (
        <div className="stack">
          <h2 className="section-title">{section === "kilimo" ? "Malengo mengine ya mwaka" : "Malengo ya mwaka"}</h2>
          <p className="muted">Jaza yale yanayohusu eneo lako tu. Utekelezaji unahesabiwa kutoka kumbukumbu zako.</p>
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
        <span>Maelezo (si lazima)</span>
        <textarea className="textarea" value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
      </label>

      <div className="form-actions">
        <button className="btn btn-primary btn-block" disabled={unchanged || empty} onClick={() => void save()}>
          {row ? "Tuma mabadiliko kwa idhini" : "Tuma mpango kwa idhini"}
        </button>
        {saved && <p className="form-ok" role="status">Umehifadhiwa. Utaonekana makao makuu kwa idhini.</p>}
      </div>

      {section === "kilimo" && (
        <div className="stack">
          <h2 className="section-title">Viwango vingine</h2>
          <PresetAsk councilId={councilId} presetKey={ARABLE_KEY} row={byKey.get(ARABLE_KEY)} reason="Kuonyesha asilimia ya eneo linalofaa lililolimwa" />
        </div>
      )}
    </section>
  );
}

export function Plan() {
  const navigate = useNavigate();
  const { councilId, sections, membership } = useWork();
  const rows = usePresetRows(councilId);
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
      <button type="button" className="back" onClick={goBack}>Rudi</button>
      <header className="month-head">
        <button className="btn btn-quiet btn-small" onClick={() => shiftFy(-1)} aria-label="Mwaka uliopita">‹</button>
        <div className="food-title">
          <h1 className="page-title">Mpango wa uzalishaji</h1>
          <p className="muted">Mwaka wa fedha {fy} (Julai–Juni)</p>
        </div>
        <button className="btn btn-quiet btn-small" onClick={() => shiftFy(1)} disabled={fy >= current} aria-label="Mwaka unaofuata">›</button>
      </header>

      {sections.length > 1 && (
        <div className="chips" role="tablist" aria-label="Sehemu">
          {sections.map((s) => (
            <button key={s} type="button" role="tab" className={`chip sec sec-${s}`} aria-selected={s === section} aria-pressed={s === section} onClick={() => void setSection(s)}>
              <span className="sec-tag" aria-hidden />
              {SECTION_LABELS[s].sw}
            </button>
          ))}
        </div>
      )}

      {rows && <SectionPlan key={`${fy}:${section}`} fy={fy} section={section} rows={rows} />}
    </main>
  );
}
