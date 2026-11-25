import { useMemo, useState } from "react";
import { parseAsIsoDate, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useLiveQuery } from "dexie-react-hooks";
import { actionsFor, inSwahili, periodSummary, SECTION_LABELS, SECTIONS, specFor } from "@afisa/shared";
import { clock, dayTitle, Select, DatePicker, useLabel, useT } from "@afisa/ui";
import { db, type LocalRecord } from "../lib/db";
import { useWork } from "../lib/session";
import { useMyAreas } from "../lib/areas";
import { EntryRow, entryText } from "./EntryRow";
import { usePhotoCounts } from "../lib/photos";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const STATES = ["zote", "zinazosubiri", "zilizokataliwa"] as const;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** One line, ready to paste into PEPMIS. Always Swahili, like the official forms. */
function pepmisLine(r: LocalRecord, areaName?: string): string {
  return inSwahili(() => pepmisLineSw(r, areaName));
}

function pepmisLineSw(r: LocalRecord, areaName?: string): string {
  const d = new Date(r.occurredAt);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const where = areaName ? `, ${areaName}` : "";
  return `${date} ${clock(r.occurredAt)}${where} (${SECTION_LABELS[r.section].sw}): ${entryText(r)}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function History() {
  const { councilId, sections } = useWork();
  const { byId } = useMyAreas();
  const photoCounts = usePhotoCounts();
  const today = startOfDay(new Date());
  const [f, setF] = useQueryStates({
    kuanzia: parseAsIsoDate.withDefault(new Date(today.getTime() - 6 * DAY)),
    hadi: parseAsIsoDate.withDefault(today),
    sehemu: parseAsStringLiteral([...SECTIONS, "zote"] as const).withDefault("zote"),
    aina: parseAsString.withDefault(""),
    hali: parseAsStringLiteral(STATES).withDefault("zote"),
  });
  const t = useT();
  const label = useLabel();
  const [copied, setCopied] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const from = startOfDay(f.kuanzia).getTime();
  const to = startOfDay(f.hadi).getTime() + DAY;

  const rows = useLiveQuery(
    () =>
      db.records
        .where("[councilId+occurredAt]")
        .between([councilId, from], [councilId, to], true, false)
        .filter(
          (r) =>
            !r.deletedAt &&
            r.type !== "monthly_review" &&
            (f.sehemu === "zote" || r.section === f.sehemu) &&
            (!f.aina || r.type === f.aina) &&
            (f.hali === "zote" || (f.hali === "zinazosubiri" ? r.syncState === "pending" : r.syncState === "rejected")),
        )
        .reverse()
        .toArray(),
    [councilId, from, to, f.sehemu, f.aina, f.hali],
  );

  const days = useMemo(() => {
    const map = new Map<number, LocalRecord[]>();
    for (const r of rows ?? []) {
      const key = startOfDay(new Date(r.occurredAt)).getTime();
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);
  const summary = useMemo(() => periodSummary(rows ?? []), [rows]);

  const areaName = (r: LocalRecord) => (r.areaId ? byId.get(r.areaId)?.name : undefined);
  const doCopy = async (key: string, text: string) => {
    if (await copy(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    }
  };

  const presets = [
    { id: "leo", label: t("Leo", "Today"), from: today, to: today },
    { id: "wiki", label: t("Wiki hii", "This week"), from: new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY), to: today },
    { id: "mwezi", label: t("Mwezi huu", "This month"), from: new Date(today.getFullYear(), today.getMonth(), 1), to: today },
    {
      id: "uliopita",
      label: t("Mwezi uliopita", "Last month"),
      from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      to: new Date(today.getFullYear(), today.getMonth(), 0),
    },
  ];
  const activePreset = presets.find((p) => iso(p.from) === iso(f.kuanzia) && iso(p.to) === iso(f.hadi))?.id;
  const typeOptions = [
    { value: "", label: t("Aina zote", "All types") },
    ...actionsFor(f.sehemu === "zote" ? sections : [f.sehemu]).filter((a) => a.ready).map((a) => ({ value: a.type, label: a.label })),
  ];

  return (
    <main className="page">
      <h1 className="page-title">{t("Shughuli", "Activities")}</h1>

      <div className="filters-panel">
        <div className="chips presets" role="group" aria-label={t("Kipindi", "Period")}>
          {presets.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={activePreset === p.id} onClick={() => void setF({ kuanzia: p.from, hadi: p.to })}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="range">
          <div className="field">
            <span className="field-label" id="h-from">{t("Kuanzia", "From")}</span>
            <DatePicker labelledBy="h-from" label={t("Kuanzia", "From")} value={iso(f.kuanzia)} max={iso(f.hadi)}
              onChange={(v) => v && void setF({ kuanzia: new Date(`${v}T00:00`) })} />
          </div>
          <div className="field">
            <span className="field-label" id="h-to">{t("Hadi", "To")}</span>
            <DatePicker labelledBy="h-to" label={t("Hadi", "To")} value={iso(f.hadi)} min={iso(f.kuanzia)} max={iso(today)}
              onChange={(v) => v && void setF({ hadi: new Date(`${v}T00:00`) })} />
          </div>
        </div>
        <div className="filter-row">
          {sections.length > 1 && (
            <Select
              size="sm"
              label={t("Sehemu", "Section")}
              value={f.sehemu}
              onChange={(v) => void setF({ sehemu: v as typeof f.sehemu, aina: "" })}
              options={[{ value: "zote", label: t("Sehemu zote", "All sections") }, ...sections.map((s) => ({ value: s, label: label(SECTION_LABELS[s]) }))]}
            />
          )}
          <Select size="sm" label={t("Aina ya kazi", "Work type")} value={f.aina} onChange={(v) => void setF({ aina: v })} options={typeOptions} />
          <Select
            size="sm"
            label={t("Hali", "Status")}
            value={f.hali}
            onChange={(v) => void setF({ hali: v as typeof f.hali })}
            options={[
              { value: "zote", label: t("Zote", "All") },
              { value: "zinazosubiri", label: t("Zinazosubiri kutumwa", "Waiting to send") },
              { value: "zilizokataliwa", label: t("Zilizokataliwa", "Rejected") },
            ]}
          />
        </div>
      </div>

      {rows && rows.length > 0 && (
        <section className="summary">
          <button type="button" className="summary-toggle" aria-expanded={showSummary} onClick={() => setShowSummary((s) => !s)}>
            <span>
              <strong>{t(`Kumbukumbu ${summary.total}`, `${summary.total} records`)}</strong>
              <small>{summary.byType.slice(0, 3).map((b) => `${b.label} ${b.count}`).join(", ")}</small>
            </span>
            <span className="summary-more">{showSummary ? t("Ficha muhtasari", "Hide summary") : t("Muhtasari", "Summary")}</span>
          </button>
          {showSummary && (
            <div className="summary-body">
              <dl className="stats">
                {summary.trained.men + summary.trained.women > 0 && (
                  <div className="stat"><dt>{t(`Waliopata mafunzo (wanawake ${fmt(summary.trained.women)})`, `People trained (${fmt(summary.trained.women)} women)`)}</dt><dd>{fmt(summary.trained.men + summary.trained.women)}</dd></div>
                )}
                {summary.areaAffectedHa > 0 && <div className="stat sec sec-kilimo"><dt>{t("Hekta zilizoshambuliwa", "Hectares attacked")}</dt><dd>{fmt(summary.areaAffectedHa)}</dd></div>}
                {summary.areaSavedHa > 0 && <div className="stat sec sec-kilimo"><dt>{t("Hekta zilizookolewa", "Hectares saved")}</dt><dd>{fmt(summary.areaSavedHa)}</dd></div>}
                {summary.treated > 0 && <div className="stat sec sec-mifugo"><dt>{t("Mifugo iliyotibiwa", "Animals treated")}</dt><dd>{fmt(summary.treated)}</dd></div>}
                {summary.vaccinated > 0 && <div className="stat sec sec-mifugo"><dt>{t("Chanjo na uogeshaji", "Vaccinated and dipped")}</dt><dd>{fmt(summary.vaccinated)}</dd></div>}
              </dl>
              {summary.pesticides.length > 0 && (
                <div>
                  <h3 className="summary-title">{t("Viuatilifu vilivyotumika", "Pesticides used")}</h3>
                  <ul className="usage">
                    {summary.pesticides.map((p) => (
                      <li key={`${p.name}|${p.unit}`}>
                        <span>{p.name}</span>
                        <strong>{fmt(p.quantity)} {p.unit}</strong>
                        <small>{t(`mara ${p.uses}`, `${p.uses} times`)}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.drugs.length > 0 && (
                <div>
                  <h3 className="summary-title">{t("Dawa na chanjo za mifugo", "Livestock drugs and vaccines")}</h3>
                  <ul className="usage">
                    {summary.drugs.map((d) => (
                      <li key={d.name}>
                        <span>{d.name}</span>
                        <strong>{t(`mifugo ${fmt(d.animals)}`, `${fmt(d.animals)} animals`)}</strong>
                        <small>{t(`mara ${d.uses}`, `${d.uses} times`)}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                type="button"
                className="btn btn-quiet btn-small"
                onClick={() => void doCopy("all", [...(rows ?? [])].reverse().map((r) => pepmisLine(r, areaName(r))).join("\n"))}
              >
                {copied === "all" ? t("Imenakiliwa", "Copied") : t("Nakili zote kwa PEPMIS", "Copy all for PEPMIS")}
              </button>
            </div>
          )}
        </section>
      )}

      {rows && rows.length === 0 && <p className="empty">{t("Hakuna kumbukumbu kwa vichujio hivi. Badili kipindi au aina hapo juu.", "No records match these filters. Change the period or type above.")}</p>}

      {days.map(([day, list]) => {
        const key = `day-${day}`;
        return (
          <section key={day} className="day-group" aria-label={dayTitle(new Date(day))}>
            <div className="day-group-head">
              <h2 className="section-title">{dayTitle(new Date(day))}</h2>
              <button
                className="btn btn-quiet btn-small"
                onClick={() => void doCopy(key, [...list].reverse().map((r) => pepmisLine(r, areaName(r))).join("\n"))}
              >
                {copied === key ? t("Imenakiliwa", "Copied") : t("Nakili siku", "Copy day")}
              </button>
            </div>
            <ul className="entry-list">
              {list.map((r) => (
                <EntryRow
                  key={r.clientId}
                  record={r}
                  areaName={areaName(r)}
                  photos={photoCounts?.get(r.clientId)}
                  trailing={
                    <button className="btn btn-quiet btn-small copy-one" onClick={() => void doCopy(r.clientId, pepmisLine(r, areaName(r)))} aria-label={`${t("Nakili", "Copy")}: ${specFor(r.type)?.label ?? ""}`}>
                      {copied === r.clientId ? t("Imenakiliwa", "Copied") : t("Nakili", "Copy")}
                    </button>
                  }
                />
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
