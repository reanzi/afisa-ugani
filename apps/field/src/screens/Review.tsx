import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  CROPS,
  PAYLOAD_VERSION,
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
  type TextBlock,
} from "@afisa/shared";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { reviewClientId, useMonthlyReport, useMonthRecords } from "../lib/report";
import { useMonthParam } from "./Report";

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
}: {
  title: string;
  hint: string;
  value: Table;
  onChange: (t: Table) => void;
  columns: { key: string; label: string; unit?: string; text?: boolean }[];
  computed?: (row: Row) => string | null;
}) {
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
        const extra = computed?.(row);
        return (
          <div key={c.value} className="crop-row">
            <div className="crop-row-head">
              <strong>{c.label}</strong>
              <button type="button" className="link" onClick={() => remove(c.value)}>Ondoa</button>
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
                      onChange={(e) => setCell(c.value, col.key, col.text ? e.target.value : e.target.value.replace(/[^0-9.,]/g, ""))}
                    />
                    {col.unit && <span className="unit">{col.unit}</span>}
                  </span>
                </label>
              ))}
            </div>
            {extra && <p className="computed">{extra}</p>}
          </div>
        );
      })}
      {remaining.length > 0 && (
        <select
          className="select"
          value=""
          aria-label={`Ongeza zao kwenye ${title}`}
          onChange={(e) => e.target.value && onChange({ ...value, [e.target.value]: {} })}
        >
          <option value="">Ongeza zao…</option>
          {remaining.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      )}
    </section>
  );
}

export function Review() {
  const navigate = useNavigate();
  const { month } = useMonthParam();
  const { me, councilId, sections, membership } = useWork();
  const { report, review } = useMonthlyReport(month);
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

  const live = useMemo(() => (records ?? []).filter((r) => !r.deletedAt && r.type !== "monthly_review"), [records]);
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

  if (!loaded) return <main className="page narrow"><p className="muted">Inafungua…</p></main>;

  return (
    <main className="page narrow">
      <Link to={`/ripoti?mwezi=${month}`} className="back">Rudi kwenye ripoti</Link>
      <h1 className="page-title">Mwisho wa {monthLabel(month)}</h1>
      <p className="lead">Majibu haya yanajaza sehemu za ripoti ambazo kumbukumbu za kila siku haziwezi kujaza.</p>

      <section className="stack review-block">
        <fieldset className="field plain">
          <legend>Mvua ya mwezi huu ilikuwaje?</legend>
          <div className="chips">
            {RAIN_LEVELS.map((o) => (
              <button key={o.value} type="button" className="chip" aria-pressed={rainLevel === o.value} onClick={() => setRainLevel(rainLevel === o.value ? "" : o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          <small>
            Umeandika siku {rainDays} za mvua. Pendekezo: {labelOf(RAIN_LEVELS, suggestion).toLowerCase()}. Usipochagua, pendekezo litatumika.
          </small>
        </fieldset>
        <label className="field">
          <span>Matukio muhimu</span>
          <textarea className="textarea" value={events} onChange={(e) => setEvents(e.target.value)} placeholder="Ukame, mafuriko, njaa, migogoro, milipuko ya magonjwa…" />
        </label>
        <label className="field">
          <span>Kazi zilizofanyika</span>
          <textarea className="textarea tall" value={work} onChange={(e) => setWork(e.target.value)} />
          <small>Imetungwa kutoka kumbukumbu zako za mwezi. Ongeza au rekebisha.</small>
        </label>
        <label className="field">
          <span>Mafanikio</span>
          <textarea className="textarea" value={achievements} onChange={(e) => setAchievements(e.target.value)} />
        </label>
        <label className="field">
          <span>Changamoto na matatizo</span>
          <textarea className="textarea" value={challenges} onChange={(e) => setChallenges(e.target.value)} />
        </label>
      </section>

      {crops && isJuly && (
        <CropTable
          title="Malengo ya mwaka (Julai tu)"
          hint="Eneo litakalopandwa na tija inayotarajiwa kwa mwaka mzima."
          value={targets}
          onChange={setTargets}
          columns={[
            { key: "area", label: "Eneo", unit: "ha" },
            { key: "yield", label: "Tija", unit: "t/ha" },
          ]}
          computed={(r) => {
            const a = toNum(r.area), y = toNum(r.yield);
            return a !== undefined && y !== undefined ? `Matarajio ya mavuno: tani ${Math.round(a * y * 100) / 100}` : null;
          }}
        />
      )}

      {crops && (
        <CropTable
          title="Utekelezaji wa msimu"
          hint="Makadirio yako ya mazao yaliyopandwa na kuvunwa. Bei ya soko inachukuliwa kutoka bei ulizoandika."
          value={estimates}
          onChange={setEstimates}
          columns={[
            { key: "planted", label: "Lililopandwa", unit: "ha" },
            { key: "harvested", label: "Lililovunwa", unit: "ha" },
            { key: "yield", label: "Tija", unit: "t/ha" },
            { key: "remarks", label: "Maelezo", text: true },
          ]}
          computed={(r) => {
            const h = toNum(r.harvested), y = toNum(r.yield);
            return h !== undefined && y !== undefined ? `Mavuno: tani ${Math.round(h * y * 100) / 100}` : null;
          }}
        />
      )}

      {crops && (
        <CropTable
          title="Utabiri wa usalama wa chakula"
          hint="Eneo na mavuno yanayotarajiwa msimu huu."
          value={forecast}
          onChange={setForecast}
          columns={[
            { key: "area", label: "Eneo", unit: "ha" },
            { key: "harvest", label: "Mavuno", unit: "tani" },
          ]}
        />
      )}

      <div className="form-actions">
        <button className="btn btn-primary btn-block" disabled={saving} onClick={() => void save()}>
          {saving ? "Inahifadhi…" : "Hifadhi majibu"}
        </button>
      </div>
    </main>
  );
}
