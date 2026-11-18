/**
 * Quick food prices: one item and its price per entry, as many as the officer
 * sees on a walk through the market. The app sorts them into the report.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { v7 as uuidv7 } from "uuid";
import { commodityKey, commodityLabel, PAYLOAD_VERSION, PRICE_UNITS, SUGGEST_FOODS, labelOf } from "@afisa/shared";
import { IconTrash, IconUndo, relativeWhen, shortDate, SuggestInput } from "@afisa/ui";
import { db, getMeta, setMeta } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useFoodState, useOpenFoodPeriod, useReopened } from "../lib/food";
import { parseAsString, useQueryState } from "nuqs";

const UNITS = PRICE_UNITS.filter((u) => ["kg", "lita", "kipande", "mfuko", "fungu", "debe"].includes(u.value));
const PLACES = [
  { value: "sokoni", label: "Sokoni" },
  { value: "rejareja", label: "Dukani" },
] as const;
const tsh = (n: number) => n.toLocaleString("en-US");

export function FoodPrices() {
  const navigate = useNavigate();
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
    setNotice({ text: `${name}, Tsh ${tsh(amount)} kwa ${labelOf(PRICE_UNITS, unit).toLowerCase()}: imeongezwa.` });
    setCommodity("");
    setPrice("");
    formRef.current?.querySelector<HTMLInputElement>("input[role=combobox]")?.focus();
  };

  const remove = async (r: { clientId: string; payload: Record<string, unknown> }) => {
    await db.records.update(r.clientId, { deletedAt: Date.now(), clientUpdatedAt: Date.now(), syncState: "pending" });
    requestSync();
    setNotice({ text: `${commodityLabel(r.payload.commodity)} imefutwa.`, undo: r.clientId });
  };

  const undo = async (clientId: string) => {
    await db.records.update(clientId, { deletedAt: undefined, clientUpdatedAt: Date.now(), syncState: "pending" });
    requestSync();
    setNotice(null);
  };

  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/", { replace: true }));

  return (
    <main className="page narrow food-entry">
      <button type="button" className="back" onClick={goBack}>Rudi</button>
      <header>
        <h1 className="page-title">Bei za vyakula</h1>
        {state && (
          <p className="lead">
            Ripoti ya {state.cycle.label}: bei za {shortDate(state.cycle.start)} hadi {shortDate(state.cycle.end - 1)}.
          </p>
        )}
      </header>

      {correcting && state && (
        <Link to={`/ripoti?aina=chakula&kipindi=${correcting}`} className="ready-banner is-correcting">
          <strong>Unarekebisha ripoti ya {state.cycle.label}</strong>
          <span>Ukimaliza, rudi kwenye ripoti uitume tena</span>
        </Link>
      )}

      {state?.ready && !state.sealed && !correcting && (
        <Link to="/ripoti?aina=chakula" className="ready-banner">
          <strong>Ripoti yako iko tayari</strong>
          <span>Kagua bei {state.entries.length} kisha uitume</span>
        </Link>
      )}

      <form ref={formRef} className="quick-price" onSubmit={add}>
        <div className="field">
          <span className="field-label" id="qp-item">Bidhaa</span>
          <SuggestInput labelledBy="qp-item" value={commodity} onChange={setCommodity} suggestions={SUGGEST_FOODS} />
        </div>
        <div className="qp-row">
          <label className="field qp-price">
            <span>Bei (Tsh)</span>
            <input
              ref={priceRef}
              className="input"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
            />
          </label>
          <fieldset className="field plain qp-place">
            <legend>Wapi</legend>
            <div className="toggle-2">
              {PLACES.map((p) => (
                <button key={p.value} type="button" aria-pressed={place === p.value} onClick={() => setPlace(p.value)}>{p.label}</button>
              ))}
            </div>
          </fieldset>
        </div>
        <fieldset className="field plain">
          <legend>Kwa kila</legend>
          <div className="chips unit-chips">
            {UNITS.map((u) => (
              <button key={u.value} type="button" className="chip" aria-pressed={unit === u.value} onClick={() => setUnit(u.value)}>
                {u.label}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-primary btn-block" disabled={!canAdd}>Ongeza</button>
        <div aria-live="polite">
          {notice && (
            <p className={`added${notice.undo ? " is-removed" : ""}`} role="status">
              {notice.text}
              {notice.undo && (
                <button type="button" className="undo-btn" onClick={() => void undo(notice.undo!)}>
                  <IconUndo size={18} /> Rudisha
                </button>
              )}
            </p>
          )}
        </div>
      </form>

      <section aria-labelledby="zilizoandikwa">
        <h2 id="zilizoandikwa" className="section-title">
          Bei zilizoandikwa {state && state.entries.length > 0 ? <span className="count">{state.entries.length}</span> : null}
        </h2>
        {state && state.entries.length === 0 && <p className="empty">Bado hakuna bei katika ripoti hii.</p>}
        <ul className="price-entries">
          {state?.entries.map((r) => (
            <li key={r.clientId}>
              <span className="pe-name">
                <strong>{commodityLabel(r.payload.commodity)}</strong>
                <small>{relativeWhen(r.occurredAt)}, {r.payload.priceType === "rejareja" ? "dukani" : String(r.payload.priceType ?? "")}</small>
              </span>
              <span className="pe-price">
                {tsh(Number(r.payload.price))}
                <small>/{labelOf(PRICE_UNITS, r.payload.unit).toLowerCase()}</small>
              </span>
              {!state.sealed && (
                <button type="button" className="icon-btn is-danger" onClick={() => void remove(r)} aria-label={`Futa ${commodityLabel(r.payload.commodity)}`}>
                  <IconTrash />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
