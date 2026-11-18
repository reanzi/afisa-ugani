import { useMemo, useState } from "react";
import { parseAsIsoDate, useQueryStates } from "nuqs";
import { useLiveQuery } from "dexie-react-hooks";
import { SECTION_LABELS } from "@afisa/shared";
import { clock, dayTitle } from "@afisa/ui";
import { db, type LocalRecord } from "../lib/db";
import { useWork } from "../lib/session";
import { useMyAreas } from "../lib/areas";
import { EntryRow, entryText } from "./EntryRow";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

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

export function History() {
  const { councilId } = useWork();
  const { byId } = useMyAreas();
  const today = startOfDay(new Date());
  const [range, setRange] = useQueryStates({
    kuanzia: parseAsIsoDate.withDefault(new Date(today.getTime() - 6 * DAY)),
    hadi: parseAsIsoDate.withDefault(today),
  });
  const [copied, setCopied] = useState<string | null>(null);

  const from = startOfDay(range.kuanzia).getTime();
  const to = startOfDay(range.hadi).getTime() + DAY;

  const rows = useLiveQuery(
    () =>
      db.records
        .where("[councilId+occurredAt]")
        .between([councilId, from], [councilId, to], true, false)
        .filter((r) => !r.deletedAt && r.type !== "monthly_review")
        .reverse()
        .toArray(),
    [councilId, from, to],
  );

  const days = useMemo(() => {
    const map = new Map<number, LocalRecord[]>();
    for (const r of rows ?? []) {
      const key = startOfDay(new Date(r.occurredAt)).getTime();
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);

  const areaName = (r: LocalRecord) => (r.areaId ? byId.get(r.areaId)?.name : undefined);

  const doCopy = async (key: string, text: string) => {
    if (await copy(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    }
  };

  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <main className="page">
      <h1 className="page-title">Shughuli</h1>
      <p className="lead">Kazi ulizoandika, kwa siku. Nakili kwenda PEPMIS.</p>

      <div className="range">
        <label className="field">
          <span>Kuanzia</span>
          <input className="input" type="date" value={iso(range.kuanzia)} max={iso(range.hadi)}
            onChange={(e) => e.target.value && void setRange({ kuanzia: new Date(`${e.target.value}T00:00`) })} />
        </label>
        <label className="field">
          <span>Hadi</span>
          <input className="input" type="date" value={iso(range.hadi)} min={iso(range.kuanzia)} max={iso(today)}
            onChange={(e) => e.target.value && void setRange({ hadi: new Date(`${e.target.value}T00:00`) })} />
        </label>
      </div>

      {rows && rows.length === 0 && <p className="empty">Hakuna kumbukumbu katika kipindi hiki. Badili tarehe hapo juu.</p>}

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
                    <button className="btn btn-quiet btn-small copy-one" onClick={() => void doCopy(r.clientId, pepmisLine(r, areaName(r)))}>
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
