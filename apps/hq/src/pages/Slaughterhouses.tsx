/**
 * The council's slaughterhouses. Officers pick from these when recording
 * slaughter; places they record that are not registered show up here for
 * the Head of Department, the vice or the livestock head to register.
 */
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { labelOf, SLAUGHTERHOUSE_KINDS } from "@afisa/shared";
import { Dialog, errorMessage, IconEdit, Select, shortDate, useConfirm, useT, type SelectOption } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { AreaPicker, useAreas } from "./common";

type House = FunctionReturnType<typeof api.slaughterhouses.listForHq>["houses"][number];
type Place = FunctionReturnType<typeof api.slaughterhouses.places>[number];
type Kind = House["kind"];

type FormState = {
  name: string;
  kind: Kind;
  areaId: string;
  servesAreaIds: Id<"areas">[];
  servesAll: boolean;
  lat: string;
  lng: string;
  licence: string;
  status: "active" | "closed";
};

const mapLink = (g: { lat: number; lng: number }) => `https://www.google.com/maps?q=${g.lat},${g.lng}`;

function HouseForm({
  initial,
  editing,
  placeId,
  onClose,
}: {
  initial: FormState;
  editing?: Id<"slaughterhouses">;
  placeId?: Id<"slaughterPlaces">;
  onClose: () => void;
}) {
  const t = useT();
  const { councilId } = useHq();
  const areas = useAreas();
  const create = useMutation(api.slaughterhouses.create);
  const update = useMutation(api.slaughterhouses.update);
  const register = useMutation(api.slaughterhouses.registerPlace);
  const [f, setF] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const areaOptions = useMemo<SelectOption[]>(() => {
    const list = areas ?? [];
    const wards = list.filter((a) => a.kind === "ward");
    const out: SelectOption[] = [];
    for (const w of wards) {
      const group = t(`Kata ya ${w.name}`, `${w.name} ward`);
      out.push({ value: w._id, label: t(`Kata ya ${w.name}`, `${w.name} ward`), group });
      for (const v of list.filter((a) => a.parentId === w._id)) out.push({ value: v._id, label: v.name, group });
    }
    return out;
  }, [areas, t]);

  const useHere = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setF((s) => ({ ...s, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })),
      () => setError(t("Mahali hapakupatikana. Andika namba za GPS.", "Location not found. Type the GPS numbers.")),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!f.areaId) return setError(t("Chagua kata au kijiji yalipo machinjio.", "Choose the ward or village where it is."));
    const lat = Number(f.lat);
    const lng = Number(f.lng);
    const geo = f.lat.trim() && f.lng.trim() && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
    const details = {
      councilId,
      client: hqClient,
      name: f.name,
      kind: f.kind,
      areaId: f.areaId as Id<"areas">,
      servesAreaIds: f.servesAll ? [] : f.servesAreaIds,
      servesAll: f.servesAll,
      geo,
      licence: f.licence.trim() || undefined,
    };
    setBusy(true);
    try {
      if (editing) await update({ ...details, slaughterhouseId: editing, status: f.status });
      else if (placeId) {
        const res = await register({ ...details, placeId });
        if (res.linked > 0) {
          setNotice(t(`Imesajiliwa. Kumbukumbu ${res.linked} za maafisa zimeunganishwa nayo.`, `Registered. ${res.linked} officer records are now linked to it.`));
          setBusy(false);
          return;
        }
      } else await create(details);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      wide
      busy={busy}
      onClose={onClose}
      title={editing ? t("Badili machinjio", "Edit slaughterhouse") : placeId ? t("Sajili mahali hapa", "Register this place") : t("Sajili machinjio", "Register a slaughterhouse")}
      actions={
        notice ? (
          <button type="button" className="btn btn-primary" onClick={onClose}>{t("Sawa", "OK")}</button>
        ) : (
          <>
            <button type="button" className="btn btn-quiet" onClick={onClose}>{t("Ghairi", "Cancel")}</button>
            <button type="button" className="btn btn-primary" disabled={busy || f.name.trim().length < 2} onClick={() => void submit()}>
              {busy ? t("Inahifadhi…", "Saving…") : t("Hifadhi", "Save")}
            </button>
          </>
        )
      }
    >
      {notice ? (
        <p className="form-ok" role="status">{notice}</p>
      ) : (
        <form className="stack sh-form" onSubmit={(e) => void submit(e)}>
          <label className="field">
            <span>{t("Jina", "Name")}</span>
            <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} autoFocus />
          </label>
          <div className="field">
            <span id="sh-kind">{t("Aina", "Type")}</span>
            <div className="chips" role="group" aria-labelledby="sh-kind">
              {SLAUGHTERHOUSE_KINDS.map((k) => (
                <button key={k.value} type="button" className="chip" aria-pressed={f.kind === k.value} onClick={() => set("kind", k.value as Kind)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span id="sh-area">{t("Yalipo (kata au kijiji)", "Where it is (ward or village)")}</span>
            <Select labelledBy="sh-area" label={t("Yalipo", "Where it is")} value={f.areaId} onChange={(v) => set("areaId", v)} options={areaOptions} placeholder={t("Chagua eneo", "Choose an area")} />
          </div>
          <fieldset className="field plain">
            <legend>{t("Maeneo mengine yanayohudumiwa", "Other areas it serves")}</legend>
            <label className="check">
              <input type="checkbox" checked={f.servesAll} onChange={(e) => set("servesAll", e.target.checked)} />
              <span>{t("Halmashauri yote: maafisa wote wanaweza kuyachagua", "The whole council: every officer can pick it")}</span>
            </label>
            {!f.servesAll && <AreaPicker value={f.servesAreaIds} onChange={(v) => set("servesAreaIds", v)} />}
            <small className="muted">{t("Maafisa wa eneo yalipo wanayaona tayari.", "Officers of the area where it is already see it.")}</small>
          </fieldset>
          <div className="field">
            <span>{t("Mahali (GPS)", "Location (GPS)")}</span>
            <div className="sh-geo">
              <input className="input" inputMode="decimal" placeholder={t("Latitudo, mfano -6.82", "Latitude, e.g. -6.82")} aria-label={t("Latitudo", "Latitude")} value={f.lat} onChange={(e) => set("lat", e.target.value)} />
              <input className="input" inputMode="decimal" placeholder={t("Longitudo, mfano 37.66", "Longitude, e.g. 37.66")} aria-label={t("Longitudo", "Longitude")} value={f.lng} onChange={(e) => set("lng", e.target.value)} />
              <button type="button" className="btn btn-quiet btn-small" onClick={useHere}>{t("Mahali nilipo", "Where I am")}</button>
            </div>
          </div>
          <label className="field">
            <span>{t("Namba ya leseni / usajili (si lazima)", "Licence / registration number (optional)")}</span>
            <input className="input" value={f.licence} onChange={(e) => set("licence", e.target.value)} maxLength={60} />
          </label>
          {editing && (
            <div className="field">
              <span id="sh-status">{t("Hali", "Status")}</span>
              <div className="chips" role="group" aria-labelledby="sh-status">
                <button type="button" className="chip" aria-pressed={f.status === "active"} onClick={() => set("status", "active")}>{t("Yanafanya kazi", "Active")}</button>
                <button type="button" className="chip" aria-pressed={f.status === "closed"} onClick={() => set("status", "closed")}>{t("Yamefungwa", "Closed")}</button>
              </div>
              <small className="muted">{t("Yaliyofungwa hayaonekani kwa kumbukumbu mpya; za zamani zinabaki.", "Closed ones are not offered for new records; old records keep them.")}</small>
            </div>
          )}
          {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
        </form>
      )}
    </Dialog>
  );
}

const EMPTY: FormState = { name: "", kind: "machinjio", areaId: "", servesAreaIds: [], servesAll: false, lat: "", lng: "", licence: "", status: "active" };

export function Slaughterhouses() {
  const t = useT();
  const confirm = useConfirm();
  const { councilId } = useHq();
  const data = useQuery(api.slaughterhouses.listForHq, { councilId });
  const places = useQuery(api.slaughterhouses.places, { councilId });
  const dismiss = useMutation(api.slaughterhouses.dismissPlace);
  const areas = useAreas();
  const [form, setForm] = useState<{ initial: FormState; editing?: Id<"slaughterhouses">; placeId?: Id<"slaughterPlaces"> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canEdit = data?.canEdit ?? false;

  const areaName = (id: string | null) => {
    const a = id ? areas?.find((x) => x._id === id) : undefined;
    return a ? (a.kind === "ward" ? t(`Kata ya ${a.name}`, `${a.name} ward`) : a.name) : "—";
  };

  const edit = (h: House) =>
    setForm({
      editing: h._id,
      initial: {
        name: h.name,
        kind: h.kind,
        areaId: h.areaId,
        servesAreaIds: h.servesAreaIds,
        servesAll: h.servesAll,
        lat: h.geo ? String(h.geo.lat) : "",
        lng: h.geo ? String(h.geo.lng) : "",
        licence: h.licence ?? "",
        status: h.status,
      },
    });

  const registerPlace = (p: Place) =>
    setForm({
      placeId: p._id,
      initial: { ...EMPTY, name: p.name, kind: "slab", areaId: p.areaId ?? "", lat: p.geo ? p.geo.lat.toFixed(6) : "", lng: p.geo ? p.geo.lng.toFixed(6) : "" },
    });

  const doDismiss = async (p: Place) => {
    const ok = await confirm({
      title: t(`Ondoa "${p.name}" kwenye orodha?`, `Remove "${p.name}" from the list?`),
      body: t("Kumbukumbu za maafisa hazibadiliki. Tumia hii kwa makosa ya maandishi au mahali pa mara moja.", "Officers' records stay as they are. Use this for typos or one-off places."),
      confirmLabel: t("Ondoa", "Remove"),
      cancelLabel: t("Hapana", "No"),
    });
    if (!ok) return;
    setError(null);
    try {
      await dismiss({ councilId, placeId: p._id, client: hqClient });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const houses = data?.houses ?? [];
  const active = houses.filter((h) => h.status === "active").length;

  return (
    <section className="hq-page">
      <header className="page-head-row">
        <div>
          <h1>{t("Machinjio", "Slaughterhouses")}</h1>
          <p className="muted">
            {t(
              "Maafisa huchagua machinjio haya wanapoandika uchinjaji; mahali yalipo hujazwa yenyewe. Mahali pasipo kusajiliwa wanapoandika huonekana hapa ili pasajiliwe.",
              "Officers pick from these when recording slaughter, and the location fills itself in. Places they record that are not registered show up here to be registered.",
            )}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setForm({ initial: EMPTY })}>+ {t("Sajili machinjio", "Register a slaughterhouse")}</button>
        )}
      </header>

      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}

      {places && places.length > 0 && (
        <section className="card sh-places" aria-labelledby="sh-places-h">
          <h2 id="sh-places-h" className="food-h2">
            {t("Mahali pasipo kusajiliwa", "Places not registered")} <span className="badge inline">{places.length}</span>
          </h2>
          <ul className="sh-place-list">
            {places.map((p) => (
              <li key={p._id}>
                <div>
                  <strong>{p.name}</strong>
                  <span className="muted small">
                    {areaName(p.areaId)} · {t(`mara ${p.uses}`, `${p.uses} times`)} · {p.reportedBy} · {shortDate(p.lastSeenAt)}
                  </span>
                  {p.geo && (
                    <a className="link small" href={mapLink(p.geo)} target="_blank" rel="noreferrer">
                      {t(`Ramani (±${Math.round(p.geo.accuracy)} m)`, `Map (±${Math.round(p.geo.accuracy)} m)`)}
                    </a>
                  )}
                </div>
                {canEdit && (
                  <div className="row-actions">
                    <button type="button" className="btn btn-primary btn-small" onClick={() => registerPlace(p)}>{t("Sajili", "Register")}</button>
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => void doDismiss(p)}>{t("Ondoa", "Remove")}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {data && houses.length === 0 && (
        <div className="empty-card">
          <h2>{t("Bado hakuna machinjio yaliyosajiliwa", "No slaughterhouses registered yet")}</h2>
          <p className="muted">{t("Hadi yasajiliwe, maafisa wanaandika mahali pasipo kusajiliwa.", "Until some are registered, officers record places that are not registered.")}</p>
        </div>
      )}

      {houses.length > 0 && (
        <>
          <dl className="kpi-row kpi-compact">
            <div><dt>{t("Yanayofanya kazi", "Active")}</dt><dd>{active}</dd></div>
            <div><dt>{t("Yaliyofungwa", "Closed")}</dt><dd>{houses.length - active}</dd></div>
          </dl>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Jina", "Name")}</th>
                  <th>{t("Aina", "Type")}</th>
                  <th>{t("Yalipo", "Where")}</th>
                  <th>{t("Inahudumia", "Serves")}</th>
                  <th>{t("Leseni", "Licence")}</th>
                  <th>{t("Hali", "Status")}</th>
                  {canEdit && <th aria-label={t("Vitendo", "Actions")} />}
                </tr>
              </thead>
              <tbody>
                {houses.map((h) => (
                  <tr key={h._id} className={h.status === "closed" ? "is-muted" : undefined}>
                    <td>
                      <strong>{h.name}</strong>
                      {h.geo && (
                        <>
                          {" "}
                          <a className="link small" href={mapLink(h.geo)} target="_blank" rel="noreferrer">{t("Ramani", "Map")}</a>
                        </>
                      )}
                    </td>
                    <td>{labelOf(SLAUGHTERHOUSE_KINDS, h.kind)}</td>
                    <td>{areaName(h.areaId)}</td>
                    <td>
                      {h.servesAll
                        ? t("Halmashauri yote", "Whole council")
                        : h.servesAreaIds.length
                          ? h.servesAreaIds.map(areaName).join(", ")
                          : t("Eneo lake tu", "Its own area")}
                    </td>
                    <td>{h.licence ?? "—"}</td>
                    <td>
                      <span className={`pill ${h.status === "active" ? "pill-ok" : "pill-muted"}`}>
                        {h.status === "active" ? t("Linafanya kazi", "Active") : t("Limefungwa", "Closed")}
                      </span>
                    </td>
                    {canEdit && (
                      <td>
                        <button type="button" className="icon-btn" aria-label={t(`Badili ${h.name}`, `Edit ${h.name}`)} title={t("Badili", "Edit")} onClick={() => edit(h)}>
                          <IconEdit size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!canEdit && data && <p className="muted">{t("Mkuu wa Idara, Naibu wake au mkuu wa sehemu ya mifugo ndio wanaosajili machinjio.", "The Head of Department, the vice or the livestock section head register slaughterhouses.")}</p>}
      {form && <HouseForm key={form.editing ?? form.placeId ?? "new"} initial={form.initial} editing={form.editing} placeId={form.placeId} onClose={() => setForm(null)} />}
    </section>
  );
}
