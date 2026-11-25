/**
 * Quick food prices: one item and its price per entry, as many as the officer
 * sees on a walk through the market. The app sorts them into the report.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { v7 as uuidv7 } from "uuid";
import { commodityKey, commodityLabel, PAYLOAD_VERSION, PRICE_UNITS, SUGGEST_FOODS, labelOf } from "@afisa/shared";
import { IconTrash, IconUndo, relativeWhen, shortDate, SuggestInput, useT } from "@afisa/ui";
import { db, getMeta, setMeta } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useFoodState, useOpenFoodPeriod, useReopened } from "../lib/food";
import { parseAsString, useQueryState } from "nuqs";

const UNITS = PRICE_UNITS.filter((u) => ["kg", "lita", "kipande", "mfuko", "fungu", "debe"].includes(u.value));
const PLACES = [
  { value: "sokoni", label: ["Sokoni", "Market"] },
  { value: "rejareja", label: ["Dukani", "Shop"] },
] as const;
const tsh = (n: number) => n.toLocaleString("en-US");

export function FoodPrices() {
  const navigate = useNavigate();
  const t = useT();
  const { councilId, sections, membership } = useWork();
  const open = useOpenFoodPeriod();
  const reopened = useReopened();
  // ?kipindi= adds to a report sent back for correction; otherwise prices go to the open report.
  const [asked] = useQueryState("kipindi", parseAsString);
  const correcting = asked && reopened?.some((s) => s.kind === "food_prices" && s.period === asked) ? asked : null;
  const period = correcting ?? open;
  const state = useFoodState(period);
  const [commodity, setCommodity] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("kg");
  const [place, setPlace] = useState<"sokoni" | "rejareja">("sokoni");
  const [notice, setNotice] = useState<{ text: string; undo?: string } | null>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    void getMeta<"sokoni" | "rejareja">("food:lastPlace").then((p) => p && setPlace(p));
  }, []);

  // Each item remembers the unit it was last priced in (sugar per kg, oil per litre).
  useEffect(() => {
    const key = commodityKey(commodity);
    if (!key) return;
    void getMeta<string>(`food:unit:${key}`).then((u) => u && setUnit(u));
  }, [commodity]);

  const amount = Number(price.replace(/[^0-9.]/g, ""));
  const canAdd = commodity.trim().length >= 2 && amount > 0 && Boolean(period);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdd || !period) return;
    const now = Date.now();
    const name = commodity.trim().charAt(0).toUpperCase() + commodity.trim().slice(1);
    await db.records.put({
      clientId: uuidv7(),
      councilId,
      type: "price",
      section: sections.includes(membership.primarySection) ? membership.primarySection : sections[0]!,
      occurredAt: now,
      payload: { commodity: name, unit, price: amount, priceType: place, foodPeriod: period },
      payloadVersion: PAYLOAD_VERSION,
      clientUpdatedAt: now,
      syncState: "pending",
    });
    await setMeta(`food:unit:${commodityKey(name)}`, unit);
    await setMeta("food:lastPlace", place);
    requestSync();
    const per = labelOf(PRICE_UNITS, unit).toLowerCase();
    setNotice({ text: t(`${name}, Tsh ${tsh(amount)} kwa ${per}: imeongezwa.`, `${name}, Tsh ${tsh(amount)} per ${per}: added.`) });
    setCommodity("");
    setPrice("");
    formRef.current?.querySelector<HTMLInputElement>("input[role=combobox]")?.focus();
  };

  const remove = async (r: { clientId: string; payload: Record<string, unknown> }) => {
    await db.records.update(r.clientId, { deletedAt: Date.now(), clientUpdatedAt: Date.now(), syncState: "pending" });
    requestSync();
    setNotice({ text: t(`${commodityLabel(r.payload.commodity)} imefutwa.`, `${commodityLabel(r.payload.commodity)} deleted.`), undo: r.clientId });
  };

  const undo = async (clientId: string) => {
    await db.records.update(clientId, { deletedAt: undefined, clientUpdatedAt: Date.now(), syncState: "pending" });
    requestSync();
    setNotice(null);
  };

  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/", { replace: true }));

  return (
    <main className="page narrow food-entry">
      <button type="button" className="back" onClick={goBack}>{t("Rudi", "Back")}</button>
      <header>
        <h1 className="page-title">{t("Bei za vyakula", "Food prices")}</h1>
        {state && (
          <p className="lead">
            {t(
              `Ripoti ya ${state.cycle.label}: bei za ${shortDate(state.cycle.start)} hadi ${shortDate(state.cycle.end - 1)}.`,
              `${state.cycle.label} report: prices from ${shortDate(state.cycle.start)} to ${shortDate(state.cycle.end - 1)}.`,
            )}
          </p>
        )}
      </header>

      {correcting && state && (
        <Link to={`/ripoti?aina=chakula&kipindi=${correcting}`} className="ready-banner is-correcting">
          <strong>{t(`Unarekebisha ripoti ya ${state.cycle.label}`, `Correcting the ${state.cycle.label} report`)}</strong>
          <span>{t("Ukimaliza, rudi kwenye ripoti uitume tena", "When done, go back to the report and send it again")}</span>
        </Link>
      )}

      {state?.ready && !state.sealed && !correcting && (
        <Link to="/ripoti?aina=chakula" className="ready-banner">
          <strong>{t("Ripoti yako iko tayari", "Your report is ready")}</strong>
          <span>{t(`Kagua bei ${state.entries.length} kisha uitume`, `Check the ${state.entries.length} prices, then send it`)}</span>
        </Link>
      )}

      <form ref={formRef} className="quick-price" onSubmit={add}>
        <div className="field">
          <span className="field-label" id="qp-item">{t("Bidhaa", "Item")}</span>
          <SuggestInput labelledBy="qp-item" value={commodity} onChange={setCommodity} suggestions={SUGGEST_FOODS} />
        </div>
        <div className="qp-row">
          <div className="field qp-price">
            <label className="field-label" htmlFor="qp-price">{t("Bei", "Price")}</label>
            <div className="affix">
              <span className="affix-text" aria-hidden>Tsh</span>
              <input
                id="qp-price"
                ref={priceRef}
                className="input"
                inputMode="numeric"
                placeholder="0"
                aria-label={t("Bei kwa shilingi", "Price in shillings")}
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
              />
            </div>
          </div>
          <div className="field qp-place">
            <span className="field-label" id="qp-place">{t("Wapi", "Where")}</span>
            <div className="toggle-2" role="group" aria-labelledby="qp-place">
              {PLACES.map((p) => (
                <button key={p.value} type="button" aria-pressed={place === p.value} onClick={() => setPlace(p.value)}>{t(p.label[0], p.label[1])}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="field">
          <span className="field-label" id="qp-unit">{t("Kwa kila", "Per")}</span>
          <div className="unit-grid" role="group" aria-labelledby="qp-unit">
            {UNITS.map((u) => (
              <button key={u.value} type="button" aria-pressed={unit === u.value} onClick={() => setUnit(u.value)}>
                {u.label}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-block" disabled={!canAdd}>
          {canAdd
            ? t(`Ongeza: Tsh ${tsh(amount)} kwa ${labelOf(PRICE_UNITS, unit).toLowerCase()}`, `Add: Tsh ${tsh(amount)} per ${labelOf(PRICE_UNITS, unit).toLowerCase()}`)
            : t("Ongeza", "Add")}
        </button>
        <div aria-live="polite">
          {notice && (
            <p className={`added${notice.undo ? " is-removed" : ""}`} role="status">
              {notice.text}
              {notice.undo && (
                <button type="button" className="undo-btn" onClick={() => void undo(notice.undo!)}>
                  <IconUndo size={18} /> {t("Rudisha", "Undo")}
                </button>
              )}
            </p>
          )}
        </div>
      </form>

      <section aria-labelledby="zilizoandikwa">
        <h2 id="zilizoandikwa" className="section-title">
          {t("Bei zilizoandikwa", "Prices recorded")} {state && state.entries.length > 0 ? <span className="count">{state.entries.length}</span> : null}
        </h2>
        {state && state.entries.length === 0 && <p className="empty">{t("Bado hakuna bei katika ripoti hii. Kila bei unayoongeza inaonekana hapa.", "No prices in this report yet. Each price you add shows here.")}</p>}
        {state && state.entries.length > 0 && <ul className="price-entries">
          {state?.entries.map((r) => (
            <li key={r.clientId}>
              <span className="pe-name">
                <strong>{commodityLabel(r.payload.commodity)}</strong>
                <small>
                  <span className={`pe-place${r.payload.priceType === "rejareja" ? " is-shop" : ""}`}>{r.payload.priceType === "rejareja" ? t("Dukani", "Shop") : t("Sokoni", "Market")}</span>
                  {relativeWhen(r.occurredAt)}
                </small>
              </span>
              <span className="pe-price">
                {tsh(Number(r.payload.price))}
                <small>/{labelOf(PRICE_UNITS, r.payload.unit).toLowerCase()}</small>
              </span>
              {!state.sealed && (
                <button type="button" className="icon-btn is-danger" onClick={() => void remove(r)} aria-label={t(`Futa ${commodityLabel(r.payload.commodity)}`, `Delete ${commodityLabel(r.payload.commodity)}`)}>
                  <IconTrash />
                </button>
              )}
            </li>
          ))}
        </ul>}
      </section>
    </main>
  );
}
