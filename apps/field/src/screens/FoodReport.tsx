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
  catalogText,
  currentFoodReport,
  PAYLOAD_VERSION,
  shiftMonth,
  type FoodReportPayload,
} from "@afisa/shared";
import { ConfirmDialog, dateTime, shortDate, useT } from "@afisa/ui";
import { db, getMeta, setMeta, type LocalSubmission } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useAreaLabel } from "../lib/report";
import { useFoodState, useOpenFoodPeriod } from "../lib/food";

const tsh = (n: number) => n.toLocaleString("en-US");
const DAY = 86_400_000;
type Row = FoodReportPayload["rows"][number];

const SHORT_AVAIL: Record<string, [string, string]> = { wingi: ["Wingi", "Plenty"], wastani: ["Wastani", "Average"], haba: ["Haba", "Scarce"], haipatikani: ["Hakuna", "None"] };

function SentStatus({ s }: { s: LocalSubmission }) {
  const t = useT();
  if (s.syncState === "pending") {
    return (
      <div className="seal seal-wait" role="status">
        <strong>{t("Imefungwa, inasubiri mtandao", "Locked, waiting for network")}</strong>
        <span>{t("Itafika makao makuu simu ikipata mtandao. Huwezi kuibadilisha tena.", "It will reach HQ when the phone is online. You can no longer change it.")}</span>
      </div>
    );
  }
  const at = s.submittedAt ?? s.clientSubmittedAt;
  return (
    <div className="seal" role="status">
      <strong>{s.auto ? t("Ilitumwa yenyewe", "Sent automatically") : t("Imetumwa", "Sent")} {dateTime(at)}</strong>
      <span>{s.late ? t("Ilifika baada ya tarehe 22. ", "Arrived after the 22nd. ") : ""}{t("Ripoti hii imefungwa. Unaweza kuisoma tu.", "This report is locked. You can only read it.")}</span>
    </div>
  );
}

function RowsList({ rows, edit }: { rows: Row[]; edit?: { value: (i: number) => string | null; set: (i: number, v: string) => void } }) {
  const t = useT();
  return (
    <ol className="food-list">
      {rows.map((r, i) => {
        const avail = edit ? edit.value(i) : r.availability;
        return (
          <li key={`${r.commodity}:${r.unit}`} className="food-item">
            <div className="food-line">
              <span className="food-name">
                <strong>{catalogText(r.commodity)}</strong>
                <small>
                  {t("kwa", "per")} {catalogText(r.unit).toLowerCase()}
                  {r.count > 1 ? t(`, bei ${r.count}`, `, ${r.count} prices`) : ""}
                </small>
              </span>
              <span className="food-price">
                <strong>Tsh {tsh(r.average)}</strong>
                {r.min !== r.max && <small>{tsh(r.min)} {t("hadi", "to")} {tsh(r.max)}</small>}
              </span>
            </div>
            {edit ? (
              <div className="avail-pick" role="radiogroup" aria-label={t(`Upatikanaji wa ${r.commodity}`, `Availability of ${catalogText(r.commodity)}`)}>
                {AVAILABILITY.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={avail === a.value}
                    className={`avail-opt avail-${a.value}`}
                    onClick={() => edit.set(i, a.value)}
                  >
                    {t(...(SHORT_AVAIL[a.value] ?? [a.label, a.label]))}
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
    const timer = window.setTimeout(() => void setMeta(`food:note:${period}`, note), 400);
    return () => window.clearTimeout(timer);
  }, [note, period]);

  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = useT();

  if (!state) return <div className="food" aria-busy="true" />;
  const { cycle, rows, sealed, reopened } = state;
  const ready = state.ready || Boolean(reopened);
  const sentBefore = reopened ? (reopened.payload as unknown as FoodReportPayload).rows : [];
  const sealedPayload = sealed ? (sealed.payload as unknown as FoodReportPayload) : null;
  const shownRows: Row[] = sealedPayload
    ? sealedPayload.rows
    : rows.map(({ commodity, unit, average, min, max, count, availability }) => ({ commodity, unit, average, min, max, count, availability }));
  const keyOf = (i: number) => rows[i]!.key;
  // Chosen now, else what was sent before (when correcting), else the most common one recorded.
  const availOf = (i: number) =>
    avail[keyOf(i)] ??
    sentBefore.find((r) => r.commodity === rows[i]!.commodity && r.unit === rows[i]!.unit)?.availability ??
    rows[i]!.availability ??
    null;
  const missingAvail = sealed ? 0 : rows.filter((_, i) => !availOf(i)).length;
  const isOpen = period === openPeriod || Boolean(reopened);
  const addLink = reopened ? `/bei?kipindi=${period}` : "/bei";
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
        <button className="btn btn-quiet btn-small" onClick={() => void setPeriod(shiftMonth(period, -1))} aria-label={t("Ripoti iliyopita", "Previous report")}>‹</button>
        <div className="food-title">
          <h2 className="page-title">{t("Chakula", "Food")}: {cycle.label}</h2>
          <p className="muted">{t(`Bei za ${shortDate(cycle.start)} hadi ${shortDate(cycle.end - 1)}`, `Prices from ${shortDate(cycle.start)} to ${shortDate(cycle.end - 1)}`)}</p>
        </div>
        <button className="btn btn-quiet btn-small" onClick={() => void setPeriod(shiftMonth(period, 1))} disabled={period >= latest} aria-label={t("Ripoti inayofuata", "Next report")}>›</button>
      </header>

      {sealed && <SentStatus s={sealed} />}

      {reopened?.reopened && (
        <div className="seal seal-reopened" role="status">
          <strong>{t("Imerudishwa kwa marekebisho", "Returned for corrections")}</strong>
          <span>
            {reopened.reopened.byName || t("Makao makuu", "HQ")}: “{reopened.reopened.note}”
          </span>
          <span>{t("Rekebisha bei au upatikanaji, kisha uitume tena.", "Fix the prices or availability, then send it again.")}</span>
        </div>
      )}

      {!sealed && rejected && (
        <div className="notice notice-danger" role="alert">
          <p>{t("Makao makuu hawakuipokea", "HQ did not accept it")}: {rejected.error ?? t("jaribu tena", "try again")}.</p>
        </div>
      )}

      {!sealed && (
        <p className="privacy-note">{t("Bei hizi ni zako. Makao makuu wataona ripoti hii tu, baada ya kuituma.", "These prices are yours. HQ sees only this report, after you send it.")}</p>
      )}

      {!sealed && shownRows.length === 0 && (
        <div className="empty">
          <p>{t("Hakuna bei katika ripoti hii.", "No prices in this report.")}</p>
          {isOpen && <Link to={addLink} className="btn btn-primary">{t("Andika bei", "Record prices")}</Link>}
          {isOpen && autoOn && <p className="muted">{t("Usipoandika bei, hakuna ripoti itakayotumwa tarehe 22.", "If you record no prices, no report will be sent on the 22nd.")}</p>}
        </div>
      )}

      {shownRows.length > 0 && (
        <>
          {!sealed && !ready && (
            <p className="due-line">{t("Ripoti itakuwa tayari kutumwa tarehe 20. Endelea kuandika bei.", "The report can be sent from the 20th. Keep recording prices.")}</p>
          )}
          {!sealed && ready && (
            <p className="due-line">
              {missingAvail > 0 ? t(`Chagua upatikanaji wa kila bidhaa (zimebaki ${missingAvail}), kisha tuma.`, `Choose the availability of each item (${missingAvail} left), then send.`) : t("Kagua orodha, kisha tuma.", "Check the list, then send.")}
            </p>
          )}

          <RowsList rows={shownRows} edit={sealed ? undefined : { value: availOf, set: (i, v) => setAvail((a) => ({ ...a, [keyOf(i)]: v })) }} />

          {!sealed && isOpen && (
            <Link to={addLink} className="btn btn-quiet btn-block add-more">{t("Ongeza bei", "Add prices")}</Link>
          )}

          {sealed ? (
            sealedPayload?.note && (
              <div className="sealed-note">
                <h3>{t("Maelezo", "Notes")}</h3>
                <p>{sealedPayload.note}</p>
              </div>
            )
          ) : (
            <label className="field">
              <span>{t("Maelezo kuhusu hali ya chakula (si lazima)", "Notes on the food situation (optional)")}</span>
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("mfano: Sukari ni haba madukani; bei ya mahindi imeshuka baada ya mavuno.", "e.g. Sugar is scarce in shops; maize prices dropped after the harvest.")} />
            </label>
          )}

          <button className="btn btn-quiet" onClick={() => void copyList()}>
            {copied ? t("Imenakiliwa", "Copied") : t("Nakili orodha", "Copy list")}
          </button>

          {!sealed && (
            <div className="submit-bar">
              {!reopened && autoOn && daysLeft >= 0 && (
                <p>{t("Usipoituma, itatumwa yenyewe tarehe 22 saa 5:30 usiku na bei zilizopo.", "If you don't send it, it will be sent automatically on the 22nd at 11:30 pm with the prices recorded.")}</p>
              )}
              {!reopened && !autoOn && daysLeft >= 0 && ready && <p>{t("Inatakiwa tarehe 22", "Due on the 22nd")}{daysLeft <= 2 ? `: ${daysLeft === 0 ? t("leo", "today") : t(`zimebaki siku ${daysLeft}`, `${daysLeft} days left`)}` : ""}.</p>}
              {!reopened && daysLeft < 0 && <p>{t("Tarehe 22 imepita. Ukiituma sasa itaonekana imechelewa.", "The 22nd has passed. If you send it now it will show as late.")}</p>}
              <button className="btn btn-primary btn-block" disabled={!ready} onClick={() => setConfirm(true)}>
                {reopened ? t("Tuma tena", "Send again") : t("Tuma ripoti", "Send report")}
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm}
        title={reopened ? t("Tuma ripoti iliyorekebishwa?", "Send the corrected report?") : t("Tuma ripoti ya chakula?", "Send the food report?")}
        confirmLabel={t("Ndiyo, tuma", "Yes, send")}
        onConfirm={() => void send()}
        onCancel={() => setConfirm(false)}
      >
        <p>
          {t(
            `Bidhaa ${shownRows.length} za ${cycle.label} zitatumwa makao makuu. Baada ya kutuma, ripoti hii itafungwa na huwezi kuibadilisha.`,
            `${shownRows.length} items for ${cycle.label} will be sent to HQ. After sending, this report is locked and cannot be changed.`,
          )}
        </p>
        {!reopened && <p>{t(`Bei utakazoandika baadaye zitaingia ripoti ya ${nextLabel}.`, `Prices you record later will go into the ${nextLabel} report.`)}</p>}
      </ConfirmDialog>
    </div>
  );
}
