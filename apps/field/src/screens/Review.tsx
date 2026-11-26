import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import {
  CROPS,
  financialYear,
  PAYLOAD_VERSION,
  presetDef,
  yieldKey,
  RAIN_LEVELS,
  daysInMonth,
  describeWork,
  monthLabel,
  monthRange,
  parseMonth,
  suggestRainLevel,
  validatePayload,
  labelOf,
  type MonthlyReview,
  isReviewType,
  type TextBlock,
} from "@afisa/shared";
import { Select, IconTrash, useT } from "@afisa/ui";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { reviewClientId, useMonthlyReport, useMonthRecords } from "../lib/report";
import { approvedFrom, useCouncilDefaults, usePresetRows } from "../lib/presets";
import { PresetAsk } from "./PresetAsk";
import { useMonthParam } from "./Report";
import { useSealed } from "../lib/food";

type Row = Record<string, string>;
type Table = Record<string, Row>;

const toNum = (s: string | undefined) => {
  if (!s || !s.trim()) return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const toDraft = (t: Record<string, Record<string, unknown>> | undefined): Table =>
  Object.fromEntries(
    Object.entries(t ?? {}).map(([crop, row]) => [crop, Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)]))]),
  );
const fromDraft = (t: Table, textKeys: string[] = []) =>
  Object.fromEntries(
    Object.entries(t).map(([crop, row]) => [
      crop,
      Object.fromEntries(
        Object.entries(row)
          .map(([k, v]) => [k, textKeys.includes(k) ? v.trim().slice(0, 50) : toNum(v)] as const)
          .filter(([, v]) => v !== undefined && v !== ""),
      ),
    ]),
  );

function CropTable({
  title,
  hint,
  value,
  onChange,
  columns,
  computed,
  placeholder,
  after,
}: {
  title: string;
  hint: string;
  value: Table;
  onChange: (t: Table) => void;
  columns: { key: string; label: string; unit?: string; text?: boolean }[];
  computed?: (row: Row, crop: string) => string | null;
  /** Shown in an empty cell, e.g. the approved yield that will be used. */
  placeholder?: (crop: string, col: string) => string | undefined;
  /** Extra content under a crop, e.g. asking for a missing yield. */
  after?: (crop: string, row: Row) => ReactNode;
}) {
  const t = useT();
  const crops = CROPS.filter((c) => value[c.value]);
  const remaining = CROPS.filter((c) => !value[c.value]);
  const setCell = (crop: string, key: string, v: string) => onChange({ ...value, [crop]: { ...value[crop], [key]: v } });
  const remove = (crop: string) => {
    const next = { ...value };
    delete next[crop];
    onChange(next);
  };
  return (
    <section className="stack review-block">
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="muted">{hint}</p>
      </div>
      {crops.map((c) => {
        const row = value[c.value] ?? {};
        const extra = computed?.(row, c.value);
        return (
          <div key={c.value} className="crop-row">
            <div className="crop-row-head">
              <strong>{c.label}</strong>
              <button type="button" className="icon-btn is-danger" onClick={() => remove(c.value)} aria-label={t(`Ondoa ${c.label}`, `Remove ${c.label}`)} title={t("Ondoa", "Remove")}>
                <IconTrash />
              </button>
            </div>
            <div className="crop-cells">
              {columns.map((col) => (
                <label key={col.key} className="field">
                  <span>{col.label}</span>
                  <span className="with-unit">
                    <input
                      className="input"
                      inputMode={col.text ? "text" : "decimal"}
                      maxLength={col.text ? 50 : undefined}
                      value={row[col.key] ?? ""}
                      placeholder={placeholder?.(c.value, col.key)}
                      onChange={(e) => setCell(c.value, col.key, col.text ? e.target.value : e.target.value.replace(/[^0-9.,]/g, ""))}
                    />
                    {col.unit && <span className="unit">{col.unit}</span>}
                  </span>
                </label>
              ))}
            </div>
            {extra && <p className="computed">{extra}</p>}
            {after?.(c.value, row)}
          </div>
        );
      })}
      {remaining.length > 0 && (
        <Select
          value=""
          label={t(`Ongeza zao: ${title}`, `Add a crop: ${title}`)}
          placeholder={t("Ongeza zao…", "Add a crop…")}
          onChange={(v) => v && onChange({ ...value, [v]: {} })}
          options={remaining.map((c) => ({ value: c.value, label: c.label }))}
        />
      )}
    </section>
  );
}

export function Review() {
  const navigate = useNavigate();
  const { month } = useMonthParam();
  const { me, councilId, sections, membership } = useWork();
  const { report, review } = useMonthlyReport(month);
  const presetRows = usePresetRows(councilId);
  const defaults = useCouncilDefaults(councilId);
  const approved = useMemo(() => (presetRows && defaults ? approvedFrom(presetRows, defaults) : undefined), [presetRows, defaults]);
  const sealed = useSealed("monthly")?.get(month);
  const records = useMonthRecords(month);
  const isJuly = parseMonth(month).month === 7;
  const crops = sections.includes("kilimo");

  const [loaded, setLoaded] = useState(false);
  const [rainLevel, setRainLevel] = useState("");
  const [events, setEvents] = useState("");
  const [work, setWork] = useState("");
  const [achievements, setAchievements] = useState("");
  const [challenges, setChallenges] = useState("");
  const [estimates, setEstimates] = useState<Table>({});
  const [forecast, setForecast] = useState<Table>({});
  const [targets, setTargets] = useState<Table>({});
  const [saving, setSaving] = useState(false);
  const t = useT();

  const live = useMemo(() => (records ?? []).filter((r) => !r.deletedAt && !isReviewType(r.type)), [records]);
  const rainDays = useMemo(() => new Set(live.filter((r) => r.type === "rainfall").map((r) => new Date(r.occurredAt).toDateString())).size, [live]);
  const suggestion = suggestRainLevel(rainDays, daysInMonth(month));

  // Fill the form once: from the saved review, or with drafts made from the month's records.
  useEffect(() => {
    if (loaded || !report || records === undefined) return;
    const textOf = (id: string) => (report.parts.flatMap((p) => p.blocks).find((b) => b.id === id) as TextBlock | undefined)?.text ?? "";
    setRainLevel(review?.rainLevel ?? "");
    setEvents(review?.events ?? textOf("1.1b"));
    setWork(review?.work ?? describeWork(live));
    setAchievements(review?.achievements ?? "");
    setChallenges(review?.challenges ?? "");
    setEstimates(toDraft(review?.crops as Record<string, Record<string, unknown>> | undefined));
    setForecast(toDraft(review?.forecast as Record<string, Record<string, unknown>> | undefined));
    setTargets(toDraft(review?.targets as Record<string, Record<string, unknown>> | undefined));
    setLoaded(true);
  }, [loaded, report, records, review, live]);

  const save = async () => {
    setSaving(true);
    const payload: MonthlyReview = {
      month,
      rainLevel: rainLevel || undefined,
      events: events.trim(),
      work: work.trim(),
      achievements: achievements.trim(),
      challenges: challenges.trim(),
      ...(crops ? { crops: fromDraft(estimates, ["remarks"]), forecast: fromDraft(forecast) } : {}),
      ...(crops && isJuly ? { targets: fromDraft(targets) } : {}),
      // Additions are edited on their own screen; keep them.
      ...(review?.additions ? { additions: review.additions } : {}),
    };
    const clean = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    if (validatePayload("monthly_review", clean)) {
      setSaving(false);
      return;
    }
    const now = Date.now();
    const { start, end } = monthRange(month);
    await db.records.put({
      clientId: reviewClientId(me.userId, councilId, month),
      councilId,
      type: "monthly_review",
      section: sections.includes(membership.primarySection) ? membership.primarySection : sections[0]!,
      occurredAt: Math.max(start, Math.min(now, end - 1)),
      payload: clean,
      payloadVersion: PAYLOAD_VERSION,
      clientUpdatedAt: now,
      syncState: "pending",
    });
    requestSync();
    navigate(`/ripoti?mwezi=${month}`, { replace: true });
  };

  if (!loaded) return <main className="page narrow"><p className="muted">{t("Inafungua…", "Opening…")}</p></main>;

  return (
    <main className="page narrow">
      <Link to={`/ripoti?mwezi=${month}`} className="back">{t("Rudi kwenye ripoti", "Back to the report")}</Link>
      <h1 className="page-title">{t(`Mwisho wa ${monthLabel(month)}`, `End of ${monthLabel(month)}`)}</h1>
      <p className="lead">{t("Majibu haya yanajaza sehemu za ripoti ambazo kumbukumbu za kila siku haziwezi kujaza.", "These answers fill the parts of the report that daily records cannot.")}</p>
      {sealed && (
        <div className="seal" role="status">
          <strong>{t(`Ripoti ya ${monthLabel(month)} imeshatumwa`, `The ${monthLabel(month)} report has been sent`)}</strong>
          <span>{t("Majibu haya yamefungwa pamoja nayo. Unaweza kuyasoma tu.", "These answers were locked with it. You can only read them.")}</span>
        </div>
      )}
      <fieldset className="plain review-lock" disabled={Boolean(sealed)}>

      <section className="stack review-block">
        <fieldset className="field plain">
          <legend>{t("Mvua ya mwezi huu ilikuwaje?", "How was the rainfall this month?")}</legend>
          <div className="chips">
            {RAIN_LEVELS.map((o) => (
              <button key={o.value} type="button" className="chip" aria-pressed={rainLevel === o.value} onClick={() => setRainLevel(rainLevel === o.value ? "" : o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          <small>
            {t(
              `Umeandika siku ${rainDays} za mvua. Pendekezo: ${labelOf(RAIN_LEVELS, suggestion).toLowerCase()}. Usipochagua, pendekezo litatumika.`,
              `You recorded ${rainDays} rain days. Suggestion: ${labelOf(RAIN_LEVELS, suggestion).toLowerCase()}. If you don't choose, the suggestion is used.`,
            )}
          </small>
        </fieldset>
        <label className="field">
          <span>{t("Matukio muhimu", "Key events")}</span>
          <textarea className="textarea" value={events} onChange={(e) => setEvents(e.target.value)} placeholder={t("Ukame, mafuriko, njaa, migogoro, milipuko ya magonjwa…", "Drought, floods, hunger, conflicts, disease outbreaks…")} />
        </label>
        <label className="field">
          <span>{t("Kazi zilizofanyika", "Work done")}</span>
          <textarea className="textarea tall" value={work} onChange={(e) => setWork(e.target.value)} />
          <small>{t("Imetungwa kutoka kumbukumbu zako za mwezi. Ongeza au rekebisha.", "Drafted from your records this month. Add to it or correct it.")}</small>
        </label>
        <label className="field">
          <span>{t("Mafanikio", "Achievements")}</span>
          <textarea className="textarea" value={achievements} onChange={(e) => setAchievements(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("Changamoto na matatizo", "Challenges and problems")}</span>
          <textarea className="textarea" value={challenges} onChange={(e) => setChallenges(e.target.value)} />
        </label>
      </section>

      {crops && isJuly && (
        <section className="stack review-block">
          <h2 className="section-title">{t("Malengo ya mwaka", "Yearly targets")}</h2>
          <p className="muted">
            {t(
              `Malengo ya mwaka ${financialYear(month)} (jedwali 2.1a) yanatoka kwenye mpango wako wa uzalishaji ulioidhinishwa: eneo la kila zao × tija.`,
              `The ${financialYear(month)} targets (table 2.1a) come from your approved production plan: area of each crop × yield.`,
            )}
          </p>
          <Link to={`/malengo?mwaka=${financialYear(month)}`} className="btn btn-quiet btn-block">{t("Fungua mpango wa uzalishaji", "Open the production plan")}</Link>
        </section>
      )}

      {crops && (
        <CropTable
          title={t("Utekelezaji wa msimu", "Season progress")}
          hint={t("Makadirio yako ya mazao yaliyopandwa na kuvunwa. Bei ya soko inachukuliwa kutoka bei ulizoandika.", "Your estimates of crops planted and harvested. Market prices come from the prices you recorded.")}
          value={estimates}
          onChange={setEstimates}
          columns={[
            { key: "planted", label: t("Lililopandwa", "Planted"), unit: "ha" },
            { key: "harvested", label: t("Lililovunwa", "Harvested"), unit: "ha" },
            { key: "yield", label: t("Tija", "Yield"), unit: "t/ha" },
            { key: "remarks", label: t("Maelezo", "Remarks"), text: true },
          ]}
          placeholder={(crop, col) => (col === "yield" && approved?.yields[crop] !== undefined ? String(approved.yields[crop]) : undefined)}
          computed={(r, crop) => {
            const h = toNum(r.harvested), y = toNum(r.yield) ?? approved?.yields[crop];
            if (h === undefined || y === undefined) return null;
            const tons = Math.round(h * y * 100) / 100;
            return t(`Mavuno: tani ${tons}`, `Harvest: ${tons} t`) + (toNum(r.yield) === undefined ? t(" (kwa tija iliyoidhinishwa)", " (at the approved yield)") : "");
          }}
          after={(crop, r) =>
            toNum(r.harvested) !== undefined && toNum(r.yield) === undefined && approved?.yields[crop] === undefined && presetDef(yieldKey(crop)) ? (
              <PresetAsk councilId={councilId} presetKey={yieldKey(crop)} row={presetRows?.find((p) => p.key === yieldKey(crop))} reason={t("Kukokotoa mavuno ya zao hili", "To work out this crop's harvest")} />
            ) : null
          }
        />
      )}

      {crops && (
        <CropTable
          title={t("Utabiri wa usalama wa chakula", "Food security forecast")}
          hint={t("Eneo na mavuno yanayotarajiwa msimu huu.", "Area and harvest expected this season.")}
          value={forecast}
          onChange={setForecast}
          columns={[
            { key: "area", label: t("Eneo", "Area"), unit: "ha" },
            { key: "harvest", label: t("Mavuno", "Harvest"), unit: t("tani", "t") },
          ]}
          computed={(r, crop) => {
            const a = toNum(r.area), y = approved?.yields[crop];
            return toNum(r.harvest) === undefined && a !== undefined && y !== undefined ? t(`Mavuno yanayotarajiwa: tani ${Math.round(a * y * 100) / 100} (eneo × tija)`, `Expected harvest: ${Math.round(a * y * 100) / 100} t (area × yield)`) : null;
          }}
        />
      )}

      </fieldset>

      {!sealed && (
        <div className="form-actions">
          <button className="btn btn-primary btn-block" disabled={saving} onClick={() => void save()}>
            {saving ? t("Inahifadhi…", "Saving…") : t("Hifadhi majibu", "Save answers")}
          </button>
        </div>
      )}
    </main>
  );
}
