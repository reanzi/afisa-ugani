/**
 * Food availability and prices: the cycle's prices averaged per item, ready to
 * send to HQ by the 22nd. Nothing leaves the phone until the officer sends it.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useLiveQuery } from "dexie-react-hooks";
import { v7 as uuidv7 } from "uuid";
import {
  availabilityLabel,
  compileFoodPrices,
  currentFoodReport,
  foodCycle,
  PAYLOAD_VERSION,
  shiftMonth,
  type FoodReportPayload,
} from "@afisa/shared";
import { relativeWhen, shortDate } from "@afisa/ui";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useAreaLabel } from "../lib/report";

const tsh = (n: number) => n.toLocaleString("en-US");
const DAY = 86_400_000;

export function FoodReport() {
  const { councilId } = useWork();
  const areaLabel = useAreaLabel();
  const current = currentFoodReport(Date.now());
  const [raw, setPeriod] = useQueryState("kipindi", parseAsString.withDefault(current.period));
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= current.period ? raw : current.period;
  const cycle = foodCycle(period);

  const records = useLiveQuery(
    () => db.records.where("[councilId+occurredAt]").between([councilId, cycle.start], [councilId, cycle.end], true, false).toArray(),
    [councilId, cycle.start, cycle.end],
  );
  const sends = useLiveQuery(
    () => db.submissions.where("[councilId+kind+period]").equals([councilId, "food_prices", period]).sortBy("clientSubmittedAt"),
    [councilId, period],
  );
  const rows = useMemo(() => (records ? compileFoodPrices(records, cycle) : []), [records, cycle]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const chosen = rows.filter((r) => !excluded.has(r.key));
  const last = sends?.[sends.length - 1];
  const daysLeft = Math.ceil((cycle.due - Date.now()) / DAY);
  const open = Date.now() < cycle.end;

  const toggle = (key: string) =>
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const payload = (): FoodReportPayload => ({
    rows: chosen.map(({ commodity, unit, average, min, max, count, availability }) => ({ commodity, unit, average, min, max, count, availability })),
    ...(note.trim() ? { note: note.trim() } : {}),
  });

  const send = async () => {
    setSending(true);
    await db.submissions.put({
      clientId: uuidv7(),
      councilId,
      kind: "food_prices",
      period,
      areaLabel,
      payload: payload() as unknown as Record<string, unknown>,
      payloadVersion: PAYLOAD_VERSION,
      clientSubmittedAt: Date.now(),
      syncState: "pending",
    });
    requestSync();
    setSending(false);
  };

  const copyList = async () => {
    const lines = [
      `UPATIKANAJI WA CHAKULA NA BEI: ${areaLabel.toUpperCase()}, ${cycle.label}`,
      `(${shortDate(cycle.start)} hadi ${shortDate(cycle.end - 1)})`,
      ...chosen.map((r) => `- ${r.commodity} (${r.unit}): wastani Tsh ${tsh(r.average)} (${tsh(r.min)}–${tsh(r.max)})${r.availability ? `, ${availabilityLabel(r.availability).toLowerCase()}` : ""}`),
      ...(note.trim() ? ["", note.trim()] : []),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="food">
      <header className="month-head">
        <button className="btn btn-quiet btn-small" onClick={() => void setPeriod(shiftMonth(period, -1))} aria-label="Kipindi kilichopita">‹</button>
        <div className="food-title">
          <h2 className="page-title">Chakula na bei: {cycle.label}</h2>
          <p className="muted">{shortDate(cycle.start)} hadi {shortDate(cycle.end - 1)}</p>
        </div>
        <button className="btn btn-quiet btn-small" onClick={() => void setPeriod(shiftMonth(period, 1))} disabled={period >= current.period} aria-label="Kipindi kinachofuata">›</button>
      </header>

      <p className="privacy-note">
        Bei ulizoandika ni zako. Makao makuu wataona ripoti hii tu, na pale utakapoituma.
      </p>

      {last && (
        <div className={`notice ${last.syncState === "synced" ? "notice-ok" : last.syncState === "rejected" ? "notice-danger" : "notice-wait"}`} role="status">
          <p>
            {last.syncState === "synced" && `Imetumwa makao makuu ${relativeWhen(last.submittedAt ?? last.clientSubmittedAt)}${(last.revision ?? 1) > 1 ? ` (toleo la ${last.revision})` : ""}.`}
            {last.syncState === "pending" && "Ripoti iko tayari kutumwa. Itatumwa ukipata mtandao."}
            {last.syncState === "rejected" && `Haikukubaliwa: ${last.error ?? ""}`}
          </p>
        </div>
      )}

      {!last && open && daysLeft >= 0 && (
        <p className="due-line">
          Inatakiwa tarehe {new Date(cycle.due).getDate()}{daysLeft <= 4 ? `: zimebaki siku ${daysLeft}` : ""}. Bei zinazoandikwa hadi tarehe 20 zinaingia kwenye ripoti hii.
        </p>
      )}

      {records && rows.length === 0 && (
        <div className="empty">
          <p>Hakuna bei zilizoandikwa katika kipindi hiki.</p>
          <Link to="/andika/price" className="btn btn-primary btn-small">Andika bei</Link>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <ul className="food-list">
            {rows.map((r) => {
              const on = !excluded.has(r.key);
              return (
                <li key={r.key} className={on ? undefined : "is-off"}>
                  <label className="food-row">
                    <input type="checkbox" checked={on} onChange={() => toggle(r.key)} aria-label={`Weka ${r.commodity} kwenye ripoti`} />
                    <span className="food-name">
                      <strong>{r.commodity}</strong>
                      <small>
                        kwa {r.unit}, bei {r.count} {r.sources ? `(${r.sources.toLowerCase()})` : ""}
                      </small>
                    </span>
                    <span className="food-price">
                      <strong>{tsh(r.average)}</strong>
                      <small>{r.min === r.max ? "Tsh" : `${tsh(r.min)}–${tsh(r.max)}`}</small>
                    </span>
                    {r.availability && <span className={`avail avail-${r.availability}`}>{availabilityLabel(r.availability)}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="muted small">Wastani wa bei zote ulizoandika kwa kila bidhaa na kipimo. Ondoa alama kwenye bidhaa usiyotaka kutuma.</p>

          <label className="field">
            <span>Maelezo kuhusu hali ya chakula (si lazima)</span>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mfano: Sukari ni haba madukani; bei ya mahindi imeshuka baada ya mavuno." />
          </label>

          <div className="export-row">
            <button className="btn btn-primary" disabled={sending || chosen.length === 0} onClick={() => void send()}>
              {last ? "Tuma tena (toleo jipya)" : "Tuma kwa makao makuu"}
            </button>
            <button className="btn btn-quiet" disabled={chosen.length === 0} onClick={() => void copyList()}>
              {copied ? "Imenakiliwa" : "Nakili orodha"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
