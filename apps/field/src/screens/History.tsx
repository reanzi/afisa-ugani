import { useMemo, useState } from "react";
import { parseAsIsoDate, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useLiveQuery } from "dexie-react-hooks";
import { actionsFor, periodSummary, SECTION_LABELS, SECTIONS, specFor } from "@afisa/shared";
import { clock, dayTitle, Select } from "@afisa/ui";
import { db, type LocalRecord } from "../lib/db";
import { useWork } from "../lib/session";
import { useMyAreas } from "../lib/areas";
import { EntryRow, entryText } from "./EntryRow";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const STATES = ["zote", "zinazosubiri", "zilizokataliwa"] as const;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** One line, ready to paste into PEPMIS. */
function pepmisLine(r: LocalRecord, areaName?: string): string {
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
  const today = startOfDay(new Date());
  const [f, setF] = useQueryStates({
    kuanzia: parseAsIsoDate.withDefault(new Date(today.getTime() - 6 * DAY)),
    hadi: parseAsIsoDate.withDefault(today),
    sehemu: parseAsStringLiteral([...SECTIONS, "zote"] as const).withDefault("zote"),
    aina: parseAsString.withDefault(""),
    hali: parseAsStringLiteral(STATES).withDefault("zote"),
  });
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
    { id: "leo", label: "Leo", from: today, to: today },
    { id: "wiki", label: "Wiki hii", from: new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY), to: today },
    { id: "mwezi", label: "Mwezi huu", from: new Date(today.getFullYear(), today.getMonth(), 1), to: today },
    {
      id: "uliopita",
      label: "Mwezi uliopita",
      from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      to: new Date(today.getFullYear(), today.getMonth(), 0),
    },
  ];
  const activePreset = presets.find((p) => iso(p.from) === iso(f.kuanzia) && iso(p.to) === iso(f.hadi))?.id;
  const typeOptions = [
    { value: "", label: "Aina zote" },
    ...actionsFor(f.sehemu === "zote" ? sections : [f.sehemu]).filter((a) => a.ready).map((a) => ({ value: a.type, label: a.label })),
  ];

  return (
    <main className="page">
      <h1 className="page-title">Shughuli</h1>

      <div className="filters-panel">
        <div className="chips presets" role="group" aria-label="Kipindi">
          {presets.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={activePreset === p.id} onClick={() => void setF({ kuanzia: p.from, hadi: p.to })}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="range">
          <label className="field">
            <span>Kuanzia</span>
            <input className="input" type="date" value={iso(f.kuanzia)} max={iso(f.hadi)}
              onChange={(e) => e.target.value && void setF({ kuanzia: new Date(`${e.target.value}T00:00`) })} />
          </label>
          <label className="field">
            <span>Hadi</span>
            <input className="input" type="date" value={iso(f.hadi)} min={iso(f.kuanzia)} max={iso(today)}
              onChange={(e) => e.target.value && void setF({ hadi: new Date(`${e.target.value}T00:00`) })} />
          </label>
        </div>
        <div className="filter-row">
          {sections.length > 1 && (
            <Select
              size="sm"
              label="Sehemu"
              value={f.sehemu}
              onChange={(v) => void setF({ sehemu: v as typeof f.sehemu, aina: "" })}
              options={[{ value: "zote", label: "Sehemu zote" }, ...sections.map((s) => ({ value: s, label: SECTION_LABELS[s].sw }))]}
            />
          )}
          <Select size="sm" label="Aina ya kazi" value={f.aina} onChange={(v) => void setF({ aina: v })} options={typeOptions} />
          <Select
            size="sm"
            label="Hali"
            value={f.hali}
            onChange={(v) => void setF({ hali: v as typeof f.hali })}
            options={[
              { value: "zote", label: "Zote" },
              { value: "zinazosubiri", label: "Zinazosubiri kutumwa" },
              { value: "zilizokataliwa", label: "Zilizokataliwa" },
            ]}
          />
        </div>
      </div>

      {rows && rows.length > 0 && (
        <section className="summary">
          <button type="button" className="summary-toggle" aria-expanded={showSummary} onClick={() => setShowSummary((s) => !s)}>
            <span>
              <strong>Kumbukumbu {summary.total}</strong>
              <small>{summary.byType.slice(0, 3).map((t) => `${t.label} ${t.count}`).join(", ")}</small>
            </span>
            <span className="summary-more">{showSummary ? "Ficha muhtasari" : "Muhtasari"}</span>
          </button>
          {showSummary && (
            <div className="summary-body">
              <dl className="stats">
                {summary.trained.men + summary.trained.women > 0 && (
                  <div className="stat"><dt>Waliopata mafunzo (wanawake {fmt(summary.trained.women)})</dt><dd>{fmt(summary.trained.men + summary.trained.women)}</dd></div>
                )}
                {summary.areaAffectedHa > 0 && <div className="stat sec sec-kilimo"><dt>Hekta zilizoshambuliwa</dt><dd>{fmt(summary.areaAffectedHa)}</dd></div>}
                {summary.areaSavedHa > 0 && <div className="stat sec sec-kilimo"><dt>Hekta zilizookolewa</dt><dd>{fmt(summary.areaSavedHa)}</dd></div>}
                {summary.treated > 0 && <div className="stat sec sec-mifugo"><dt>Mifugo iliyotibiwa</dt><dd>{fmt(summary.treated)}</dd></div>}
                {summary.vaccinated > 0 && <div className="stat sec sec-mifugo"><dt>Chanjo na uogeshaji</dt><dd>{fmt(summary.vaccinated)}</dd></div>}
              </dl>
              {summary.pesticides.length > 0 && (
                <div>
                  <h3 className="summary-title">Viuatilifu vilivyotumika</h3>
                  <ul className="usage">
                    {summary.pesticides.map((p) => (
                      <li key={`${p.name}|${p.unit}`}>
                        <span>{p.name}</span>
                        <strong>{fmt(p.quantity)} {p.unit}</strong>
                        <small>mara {p.uses}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.drugs.length > 0 && (
                <div>
                  <h3 className="summary-title">Dawa na chanjo za mifugo</h3>
                  <ul className="usage">
                    {summary.drugs.map((d) => (
                      <li key={d.name}>
                        <span>{d.name}</span>
                        <strong>mifugo {fmt(d.animals)}</strong>
                        <small>mara {d.uses}</small>
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
                {copied === "all" ? "Imenakiliwa" : "Nakili zote kwa PEPMIS"}
              </button>
            </div>
          )}
        </section>
      )}

      {rows && rows.length === 0 && <p className="empty">Hakuna kumbukumbu kwa vichujio hivi. Badili kipindi au aina hapo juu.</p>}

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
                {copied === key ? "Imenakiliwa" : "Nakili siku"}
              </button>
            </div>
            <ul className="entry-list">
              {list.map((r) => (
                <EntryRow
                  key={r.clientId}
                  record={r}
                  areaName={areaName(r)}
                  trailing={
                    <button className="btn btn-quiet btn-small copy-one" onClick={() => void doCopy(r.clientId, pepmisLine(r, areaName(r)))} aria-label={`Nakili: ${specFor(r.type)?.label ?? ""}`}>
                      {copied === r.clientId ? "Imenakiliwa" : "Nakili"}
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
