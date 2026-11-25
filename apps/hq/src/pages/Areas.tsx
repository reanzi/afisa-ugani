import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { canManageAreas } from "@afisa/shared";
import { errorMessage, IconEdit, usePrompt, useT } from "@afisa/ui";
import { hqClient, useHq } from "../context";
import { useAreas } from "./common";
import { UploadForCouncil } from "./Councils";

/** Root: load or refresh this council's NaPA address report. */
function NapaPanel() {
  const t = useT();
  const { councilId } = useHq();
  const councils = useQuery(api.councils.listAll, {});
  const [open, setOpen] = useState(false);
  const info = councils?.find((c) => c._id === councilId);
  const last = info?.addressImport;
  return (
    <div className="napa-panel">
      <p className="small">
        {last
          ? t(
              `Anwani za NaPA: kata ${last.wards}, vijiji/mitaa ${last.villages}, barabara ${last.streets}${last.reportDate ? `, ripoti ya ${last.reportDate}` : ""}.`,
              `NaPA addresses: ${last.wards} wards, ${last.villages} villages/streets, ${last.streets} roads${last.reportDate ? `, report of ${last.reportDate}` : ""}.`,
            )
          : t("Bado hakuna ripoti ya anwani ya NaPA. Usajili wa halmashauri hii unafunguka baada ya kuweka kata na vijiji.", "No NaPA address report yet. This council's sign-up opens once wards and villages are in.")}
      </p>
      {open ? (
        <UploadForCouncil councilId={councilId} onClose={() => setOpen(false)} />
      ) : (
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setOpen(true)}>
          {last ? t("Pakia ripoti mpya ya anwani", "Load a newer address report") : t("Pakia anwani (NaPA)", "Load addresses (NaPA)")}
        </button>
      )}
    </div>
  );
}

function AddForm({ kind, parentId, placeholder, onDone }: { kind: "ward" | "village"; parentId?: Id<"areas">; placeholder: string; onDone?: () => void }) {
  const t = useT();
  const { councilId } = useHq();
  const create = useMutation(api.areas.create);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({ councilId, kind, name, parentId, client: hqClient });
      setName("");
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="area-add" onSubmit={submit}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button className="btn btn-primary btn-small" disabled={busy || name.trim().length < 2}>{t("Ongeza", "Add")}</button>
      {error && <p className="tone-danger small" role="alert">{error}</p>}
    </form>
  );
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function Areas() {
  const t = useT();
  const ask = usePrompt();
  const { actor, councilId } = useHq();
  const areas = useAreas();
  const rename = useMutation(api.areas.rename);
  const canEdit = canManageAreas(actor);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [addingWard, setAddingWard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wards = useMemo(() => (areas ?? []).filter((a) => a.kind === "ward"), [areas]);
  const villagesOf = useMemo(() => {
    const m = new Map<string, { _id: Id<"areas">; name: string }[]>();
    for (const a of areas ?? []) if (a.kind === "village" && a.parentId) m.set(a.parentId, [...(m.get(a.parentId) ?? []), a]);
    return m;
  }, [areas]);
  const villageCount = (areas ?? []).filter((a) => a.kind === "village").length;

  const q = fold(search.trim());
  const shown = wards.filter((w) => !q || fold(w.name).includes(q) || (villagesOf.get(w._id) ?? []).some((v) => fold(v.name).includes(q)));
  const current = shown.find((w) => w._id === selected) ?? shown[0] ?? null;
  const currentVillages = current ? (villagesOf.get(current._id) ?? []) : [];

  const doRename = async (id: Id<"areas">, kind: "ward" | "village", name: string) => {
    const next = await ask({
      title: kind === "ward" ? t("Badili jina la kata", "Rename ward") : t("Badili jina la kijiji", "Rename village"),
      label: t("Jina", "Name"),
      initial: name,
    });
    if (next === null || next.trim() === name) return;
    setError(null);
    try {
      await rename({ councilId, areaId: id, name: next, client: hqClient });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="hq-page areas-page">
      <header className="page-head-row">
        <div>
          <h1>{t("Maeneo", "Areas")}</h1>
          <p className="muted">{t("Kata na vijiji au mitaa ya halmashauri. Maafisa hupangiwa maeneo haya wanapoidhinishwa.", "The council's wards and villages or streets. Officers are assigned to these when approved.")}</p>
        </div>
        {canEdit && !addingWard && (
          <button type="button" className="btn btn-primary" onClick={() => setAddingWard(true)}>+ {t("Ongeza kata", "Add ward")}</button>
        )}
      </header>

      <div className="areas-wrap">
      <div className="areas-side">
      {actor.isRoot && <NapaPanel />}
      {canEdit && addingWard && (
        <div className="card area-new-ward">
          <div className="card-head">
            <h2>{t("Kata mpya", "New ward")}</h2>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setAddingWard(false)}>{t("Funga", "Close")}</button>
          </div>
          <AddForm kind="ward" placeholder={t("Jina la kata", "Ward name")} onDone={() => setAddingWard(false)} />
        </div>
      )}

      {wards.length > 0 && (
        <dl className="kpi-row kpi-compact">
          <div><dt>{t("Kata", "Wards")}</dt><dd>{wards.length.toLocaleString("en-US")}</dd></div>
          <div><dt>{t("Vijiji / mitaa", "Villages / streets")}</dt><dd>{villageCount.toLocaleString("en-US")}</dd></div>
          <div><dt>{t("Wastani kwa kata", "Average per ward")}</dt><dd>{(villageCount / wards.length).toFixed(1)}</dd></div>
        </dl>
      )}
      </div>

      <div className="areas-main">
      {areas === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {areas && wards.length === 0 && (
        <div className="empty-card">
          <h2>{t("Bado hakuna kata", "No wards yet")}</h2>
          <p className="muted">{canEdit ? t("Ongeza kata ya kwanza, au pakia ripoti ya anwani ya NaPA.", "Add the first ward, or load the NaPA address report.") : t("Mkuu wa Idara ataziongeza.", "The Head of Department will add them.")}</p>
        </div>
      )}

      {wards.length > 0 && (
        <>
          {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}

          <div className="areas-layout">
            <aside className="card areas-wards" aria-label={t("Kata", "Wards")}>
              <input
                className="input input-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Tafuta kata au kijiji", "Search wards or villages")}
                aria-label={t("Tafuta kata au kijiji", "Search wards or villages")}
              />
              <ul className="ward-list">
                {shown.map((w) => {
                  const vs = villagesOf.get(w._id) ?? [];
                  const hits = q ? vs.filter((v) => fold(v.name).includes(q)).length : 0;
                  return (
                    <li key={w._id}>
                      <button type="button" aria-current={current?._id === w._id ? "true" : undefined} onClick={() => setSelected(w._id)}>
                        <span className="ward-name">{w.name}</span>
                        <span className="ward-count">{hits ? t(`${hits} zinalingana`, `${hits} match`) : vs.length}</span>
                      </button>
                    </li>
                  );
                })}
                {shown.length === 0 && <li className="muted small ward-none">{t("Hakuna kinacholingana.", "Nothing matches.")}</li>}
              </ul>
            </aside>

            {current && (
              <article className="card areas-detail">
                <div className="card-head">
                  <div>
                    <span className="eyebrow">{t("Kata", "Ward")}</span>
                    <h2 className="areas-title">{current.name}</h2>
                    <p className="muted small">{currentVillages.length === 1 ? t("Kijiji / mtaa 1", "1 village / street") : t(`Vijiji / mitaa ${currentVillages.length}`, `${currentVillages.length} villages / streets`)}</p>
                  </div>
                  {canEdit && (
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => void doRename(current._id, "ward", current.name)}>{t("Badili jina", "Rename")}</button>
                  )}
                </div>
                {currentVillages.length === 0 ? (
                  <p className="muted">{t("Kata hii bado haina vijiji.", "This ward has no villages yet.")}</p>
                ) : (
                  <ul className="village-grid">
                    {currentVillages.map((v) => (
                      <li key={v._id} className={q && fold(v.name).includes(q) ? "is-hit" : undefined}>
                        <span>{v.name}</span>
                        {canEdit && (
                          <button type="button" className="icon-btn" aria-label={t(`Badili jina la ${v.name}`, `Rename ${v.name}`)} title={t("Badili jina", "Rename")} onClick={() => void doRename(v._id, "village", v.name)}>
                            <IconEdit size={15} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && <AddForm kind="village" parentId={current._id} placeholder={t(`Ongeza kijiji kwenye kata ya ${current.name}`, `Add a village to ${current.name}`)} />}
              </article>
            )}
          </div>
        </>
      )}
      </div>
      </div>
    </section>
  );
}
