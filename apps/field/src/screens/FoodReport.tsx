/**
 * Food availability report: prices averaged per item. From the 20th the
 * officer reviews it, sets how available each item is, and sends it. Once
 * sent it is sealed: read-only, kept on the phone for reference.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useLiveQuery } from "dexie-react-hooks";
import { v7 as uuidv7 } from "uuid";
import {
  AVAILABILITY,
  availabilityLabel,
  currentFoodReport,
  PAYLOAD_VERSION,
  shiftMonth,
  type FoodReportPayload,
} from "@afisa/shared";
import { shortDate } from "@afisa/ui";
import { db, getMeta, setMeta, type LocalSubmission } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useAreaLabel } from "../lib/report";
import { useFoodState, useOpenFoodPeriod } from "../lib/food";
import { ConfirmSheet } from "./ConfirmSheet";

const tsh = (n: number) => n.toLocaleString("en-US");
const DAY = 86_400_000;
type Row = FoodReportPayload["rows"][number];

const SHORT_AVAIL: Record<string, string> = { wingi: "Wingi", wastani: "Wastani", haba: "Haba", haipatikani: "Hakuna" };

function when(ms: number): string {
  const d = new Date(ms);
  return `${shortDate(ms)}, saa ${d.toLocaleTimeString("sw-TZ", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

function SentStatus({ s }: { s: LocalSubmission }) {
  if (s.syncState === "pending") {
    return (
      <div className="seal seal-wait" role="status">
        <strong>Imefungwa, inasubiri mtandao</strong>
        <span>Itafika makao makuu simu ikipata mtandao. Huwezi kuibadilisha tena.</span>
      </div>
    );
  }
  const at = s.submittedAt ?? s.clientSubmittedAt;
  return (
    <div className="seal" role="status">
      <strong>{s.auto ? "Ilitumwa yenyewe" : "Imetumwa"} {when(at)}</strong>
      <span>{s.late ? "Ilifika baada ya tarehe 22. " : ""}Ripoti hii imefungwa. Unaweza kuisoma tu.</span>
    </div>
  );
}

function RowsList({ rows, edit }: { rows: Row[]; edit?: { value: (i: number) => string | null; set: (i: number, v: string) => void } }) {
  return (
    <ol className="food-list">
      {rows.map((r, i) => {
        const avail = edit ? edit.value(i) : r.availability;
        return (
          <li key={`${r.commodity}:${r.unit}`} className="food-item">
            <div className="food-line">
              <span className="food-name">
                <strong>{r.commodity}</strong>
                <small>
                  kwa {r.unit.toLowerCase()}
                  {r.count > 1 ? `, bei ${r.count}` : ""}
                </small>
              </span>
              <span className="food-price">
                <strong>Tsh {tsh(r.average)}</strong>
                {r.min !== r.max && <small>{tsh(r.min)} hadi {tsh(r.max)}</small>}
              </span>
            </div>
            {edit ? (
              <div className="avail-pick" role="radiogroup" aria-label={`Upatikanaji wa ${r.commodity}`}>
                {AVAILABILITY.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={avail === a.value}
                    className={`avail-opt avail-${a.value}`}
                    onClick={() => edit.set(i, a.value)}
                  >
                    {SHORT_AVAIL[a.value]}
                  </button>
                ))}
              </div>
            ) : (
              avail && <span className={`avail avail-${avail}`}>{availabilityLabel(avail)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function FoodReport() {
  const { councilId, membership } = useWork();
  const areaLabel = useAreaLabel();
  const openPeriod = useOpenFoodPeriod();
  const current = currentFoodReport(Date.now()).period;
  const [raw, setPeriod] = useQueryState("kipindi", parseAsString.withDefault(""));
  const latest = openPeriod && openPeriod > current ? openPeriod : current;
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw <= latest ? raw : current;
  const state = useFoodState(period);

  const rejected = useLiveQuery(
    () =>
      db.submissions
        .where("[councilId+kind+period]")
        .equals([councilId, "food_prices", period])
        .filter((s) => s.syncState === "rejected")
        .last(),
    [councilId, period],
  );

  // Availability choices and the note are kept on the phone while the report is open.
  const [avail, setAvail] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    loaded.current = null;
    void Promise.all([getMeta<Record<string, string>>(`food:avail:${period}`), getMeta<string>(`food:note:${period}`)]).then(([a, n]) => {
      setAvail(a ?? {});
      setNote(n ?? "");
      loaded.current = period;
    });
  }, [period]);
  useEffect(() => {
    if (loaded.current === period) void setMeta(`food:avail:${period}`, avail);
  }, [avail, period]);
  useEffect(() => {
    if (loaded.current !== period) return;
    const t = window.setTimeout(() => void setMeta(`food:note:${period}`, note), 400);
    return () => window.clearTimeout(t);
  }, [note, period]);

  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!state) return <div className="food" aria-busy="true" />;
  const { cycle, rows, sealed, ready } = state;
  const sealedPayload = sealed ? (sealed.payload as unknown as FoodReportPayload) : null;
  const shownRows: Row[] = sealedPayload
    ? sealedPayload.rows
    : rows.map(({ commodity, unit, average, min, max, count, availability }) => ({ commodity, unit, average, min, max, count, availability }));
  const keyOf = (i: number) => rows[i]!.key;
  const availOf = (i: number) => avail[keyOf(i)] ?? rows[i]!.availability ?? null;
  const missingAvail = sealed ? 0 : rows.filter((_, i) => !availOf(i)).length;
  const isOpen = period === openPeriod;
  const daysLeft = Math.ceil((cycle.due - Date.now()) / DAY);
  const autoOn = membership.autoSend?.food ?? false;
  const nextLabel = currentFoodReport(cycle.due + 2 * DAY).label;

  const payload = (): FoodReportPayload => ({
    rows: shownRows.map((r, i) => ({ ...r, availability: availOf(i) })),
    ...(note.trim() ? { note: note.trim() } : {}),
  });

  const send = async () => {
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
    setConfirm(false);
  };

  const copyList = async () => {
    const list = sealedPayload ?? payload();
    const lines = [
      `UPATIKANAJI WA CHAKULA NA BEI: ${areaLabel.toUpperCase()}, ${cycle.label}`,
      `(${shortDate(cycle.start)} hadi ${shortDate(cycle.end - 1)})`,
      ...list.rows.map((r) => `- ${r.commodity} (${r.unit}): Tsh ${tsh(r.average)}${r.min !== r.max ? ` (${tsh(r.min)}–${tsh(r.max)})` : ""}${r.availability ? `, ${availabilityLabel(r.availability).toLowerCase()}` : ""}`),
      ...(list.note ? ["", list.note] : []),
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
        <button className="btn btn-quiet btn-small" onClick={() => void setPeriod(shiftMonth(period, -1))} aria-label="Ripoti iliyopita">‹</button>
        <div className="food-title">
          <h2 className="page-title">Chakula: {cycle.label}</h2>
          <p className="muted">Bei za {shortDate(cycle.start)} hadi {shortDate(cycle.end - 1)}</p>
        </div>
        <button className="btn btn-quiet btn-small" onClick={() => void setPeriod(shiftMonth(period, 1))} disabled={period >= latest} aria-label="Ripoti inayofuata">›</button>
      </header>

      {sealed && <SentStatus s={sealed} />}

      {!sealed && rejected && (
        <div className="notice notice-danger" role="alert">
          <p>Makao makuu hawakuipokea: {rejected.error ?? "jaribu tena"}.</p>
        </div>
      )}

      {!sealed && (
        <p className="privacy-note">Bei hizi ni zako. Makao makuu wataona ripoti hii tu, baada ya kuituma.</p>
      )}

      {!sealed && shownRows.length === 0 && (
        <div className="empty">
          <p>Hakuna bei katika ripoti hii.</p>
          {isOpen && <Link to="/bei" className="btn btn-primary">Andika bei</Link>}
          {isOpen && autoOn && <p className="muted">Usipoandika bei, hakuna ripoti itakayotumwa tarehe 22.</p>}
        </div>
      )}

      {shownRows.length > 0 && (
        <>
          {!sealed && !ready && (
            <p className="due-line">Ripoti itakuwa tayari kutumwa tarehe 20. Endelea kuandika bei.</p>
          )}
          {!sealed && ready && (
            <p className="due-line">
              {missingAvail > 0 ? `Chagua upatikanaji wa kila bidhaa (zimebaki ${missingAvail}), kisha tuma.` : "Kagua orodha, kisha tuma."}
            </p>
          )}

          <RowsList rows={shownRows} edit={sealed ? undefined : { value: availOf, set: (i, v) => setAvail((a) => ({ ...a, [keyOf(i)]: v })) }} />

          {!sealed && isOpen && (
            <Link to="/bei" className="btn btn-quiet btn-block add-more">Ongeza bei</Link>
          )}

          {sealed ? (
            sealedPayload?.note && (
              <div className="sealed-note">
                <h3>Maelezo</h3>
                <p>{sealedPayload.note}</p>
              </div>
            )
          ) : (
            <label className="field">
              <span>Maelezo kuhusu hali ya chakula (si lazima)</span>
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mfano: Sukari ni haba madukani; bei ya mahindi imeshuka baada ya mavuno." />
            </label>
          )}

          <button className="btn btn-quiet" onClick={() => void copyList()}>
            {copied ? "Imenakiliwa" : "Nakili orodha"}
          </button>

          {!sealed && (
            <div className="submit-bar">
              {autoOn && daysLeft >= 0 && (
                <p>Usipoituma, itatumwa yenyewe tarehe 22 saa 5:30 usiku na bei zilizopo.</p>
              )}
              {!autoOn && daysLeft >= 0 && ready && <p>Inatakiwa tarehe 22{daysLeft <= 2 ? `: ${daysLeft === 0 ? "leo" : `zimebaki siku ${daysLeft}`}` : ""}.</p>}
              {daysLeft < 0 && <p>Tarehe 22 imepita. Ukiituma sasa itaonekana imechelewa.</p>}
              <button className="btn btn-primary btn-block" disabled={!ready} onClick={() => setConfirm(true)}>
                Tuma ripoti
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmSheet
        open={confirm}
        title="Tuma ripoti ya chakula?"
        confirmLabel="Ndiyo, tuma"
        onConfirm={() => void send()}
        onCancel={() => setConfirm(false)}
      >
        <p>
          Bidhaa {shownRows.length} za {cycle.label} zitatumwa makao makuu. Baada ya kutuma, ripoti hii itafungwa na huwezi kuibadilisha.
        </p>
        <p>Bei utakazoandika baadaye zitaingia ripoti ya {nextLabel}.</p>
      </ConfirmSheet>
    </div>
  );
}
