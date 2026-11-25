import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { v7 as uuidv7 } from "uuid";
import { fieldVisible, PAYLOAD_VERSION, SECTION_LABELS, specFor, validatePayload, type RecordSpec, type Section } from "@afisa/shared";
import { db, getMeta, setMeta, type Geo, type LocalMedia, type LocalRecord } from "../lib/db";
import { captureLocation, type GeoStatus } from "../lib/geo";
import { useWork } from "../lib/session";
import { useMyAreas } from "../lib/areas";
import { requestSync } from "../lib/sync";
import { useOpenFoodPeriod } from "../lib/food";
import { draftToPayload, FieldInput, payloadToDraft, type Draft } from "./fields";
import { useRecordPhotos, type PhotoDraft } from "../lib/photos";
import { PhotoField } from "./PhotoField";
import { IconTrash, Select, useConfirm, useT, type SelectOption, DatePicker, TimeField } from "@afisa/ui";

/** "2026-11-17T14:05" in local time: the date and time fields of "Lini?". */
export function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

function GeoLine({ status, onRetry }: { status: GeoStatus; onRetry: () => void }) {
  const t = useT();
  switch (status.state) {
    case "searching":
      return (
        <p className="geo geo-wait" aria-live="polite">
          {t("Inatafuta mahali ulipo", "Finding your location")}{status.best ? t(` (sasa ±${status.best.accuracy} m)`, ` (now ±${status.best.accuracy} m)`) : ""}…
        </p>
      );
    case "found":
      return <p className="geo geo-ok">{t(`Mahali pamepatikana, usahihi ±${status.geo.accuracy} m.`, `Location found, accuracy ±${status.geo.accuracy} m.`)}</p>;
    case "weak":
      return (
        <p className="geo geo-wait">
          {t(`Mahali pamepatikana kwa usahihi mdogo (±${status.geo.accuracy} m).`, `Location found with low accuracy (±${status.geo.accuracy} m).`)}{" "}
          <button type="button" className="link" onClick={onRetry}>{t("Jaribu tena", "Try again")}</button>
        </p>
      );
    case "denied":
      return <p className="geo geo-off">{t("Ruhusa ya mahali imezimwa. Iwashe kwenye mipangilio ya kivinjari ili kumbukumbu iwe na mahali.", "Location permission is off. Turn it on in the browser settings so records include a location.")}</p>;
    case "unavailable":
      return (
        <p className="geo geo-off">
          {t("Mahali hapakupatikana. Kumbukumbu itahifadhiwa bila mahali.", "No location found. The record will be saved without one.")}{" "}
          <button type="button" className="link" onClick={onRetry}>{t("Jaribu tena", "Try again")}</button>
        </p>
      );
  }
}

function ComingSoon({ label }: { label: string }) {
  const t = useT();
  return (
    <main className="page narrow">
      <Link to="/" className="back">{t("Rudi", "Back")}</Link>
      <h1 className="page-title">{label}</h1>
      <p className="lead">
        {t("Fomu hii bado haijakamilika. Kwa sasa tumia", "This form is not ready yet. For now use")} <Link to="/andika/activity">{t("Shughuli nyingine", "Other activity")}</Link> {t("kuandika ulichofanya.", "to record what you did.")}
      </p>
    </main>
  );
}

export function LogEntry() {
  const { type = "activity", clientId } = useParams();
  const spec = specFor(type);
  const t = useT();
  if (!spec || !spec.ready || type === "monthly_review") return <ComingSoon label={spec?.label ?? t("Fomu", "Form")} />;
  return <SpecForm key={`${type}:${clientId ?? "new"}`} spec={spec} clientId={clientId} />;
}

const VALIDATION_TEXT: Record<string, [string, string]> = {
  MISSING: ["Jaza sehemu hii", "Fill in this field"],
  BAD_NUMBER: ["Andika namba sahihi", "Enter a valid number"],
  BAD_OPTION: ["Chagua mojawapo", "Choose one"],
  BAD_TEXT: ["Maandishi ni marefu mno", "The text is too long"],
};

function SpecForm({ spec, clientId }: { spec: RecordSpec; clientId?: string }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const t = useT();
  // Back to where the officer came from (home section, history), or home if the form was opened directly.
  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/", { replace: true }));
  const { councilId, sections, membership } = useWork();
  const { wards, villages } = useMyAreas();
  const existing = useLiveQuery(() => (clientId ? db.records.get(clientId) : undefined), [clientId]);
  const editing = Boolean(clientId);

  const [params] = useSearchParams();
  const preset = params.get("sehemu");
  const allowed = sections.filter((s) => spec.sections.includes(s));
  const [section, setSection] = useState<Section>(
    allowed.find((s) => s === preset) ?? (allowed.includes(membership.primarySection) ? membership.primarySection : (allowed[0] ?? sections[0]!)),
  );
  const [draft, setDraft] = useState<Draft>({});
  const [areaId, setAreaId] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(Date.now()));
  const nowLocal = toLocalInput(Date.now());
  const [geo, setGeo] = useState<GeoStatus>({ state: "searching" });
  const [attempt, setAttempt] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [problem, setProblem] = useState<{ key: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Photos: new ones are held in memory until the record is saved.
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [photosRemoved, setPhotosRemoved] = useState<string[]>([]);
  const savedPhotos = (useRecordPhotos(clientId) ?? []).filter((m) => !photosRemoved.includes(m.clientId));
  const photosRequired = spec.type === "photo";

  useEffect(() => {
    if (editing) {
      if (!existing) return;
      setSection(existing.section);
      setDraft(payloadToDraft(existing.payload));
      setAreaId(existing.areaId ?? "");
      setWhen(toLocalInput(existing.occurredAt));
      setGeo(existing.geo ? { state: "found", geo: existing.geo } : { state: "unavailable" });
      if (spec.fields.some((f) => f.more && existing.payload[f.key] !== undefined)) setShowMore(true);
    } else {
      void getMeta<string>(`lastArea:${councilId}`).then((a) => a && setAreaId(a));
      // Remember choices like the animal or crop from the last entry of this kind.
      void getMeta<Draft>(`last:${spec.type}`).then((last) => last && setDraft((d) => ({ ...last, ...d })));
    }
  }, [editing, existing, councilId, spec]);

  useEffect(() => {
    if (editing) return;
    return captureLocation(setGeo);
  }, [editing, attempt]);

  const payload = useMemo(() => draftToPayload(spec.fields, draft), [spec, draft]);
  // Prices go into the food report that is open now (the next one once this one is sent).
  const foodPeriod = useOpenFoodPeriod();
  const areaOptions = useMemo<SelectOption[]>(() => {
    const out: SelectOption[] = [{ value: "", label: t("Sijachagua", "Not chosen") }];
    for (const w of wards) {
      const group = t(`Kata ya ${w.name}`, `${w.name} ward`);
      out.push({ value: w._id, label: t(`Kata ya ${w.name} (yote)`, `${w.name} ward (all)`), group });
      for (const v of villages.filter((x) => x.parentId === w._id)) out.push({ value: v._id, label: v.name, group });
    }
    for (const v of villages.filter((x) => !wards.some((w) => w._id === x.parentId))) out.push({ value: v._id, label: v.name, group: t("Vijiji", "Villages") });
    return out;
  }, [wards, villages, t]);
  const visible = spec.fields.filter((f) => fieldVisible(f, payload));
  const main = visible.filter((f) => !f.more);
  const more = visible.filter((f) => f.more);

  const geoValue: Geo | undefined =
    geo.state === "found" || geo.state === "weak" ? geo.geo : geo.state === "searching" ? geo.best : undefined;

  const set = (key: string, v: string) => {
    setDraft((d) => ({ ...d, [key]: v }));
    if (problem?.key === key) setProblem(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validatePayload(spec.type, payload);
    if (invalid) {
      const [code, key = ""] = invalid.split(":");
      const msg = VALIDATION_TEXT[code ?? ""];
      setProblem({ key, text: msg ? t(...msg) : t("Angalia taarifa ulizojaza", "Check what you filled in") });
      if (spec.fields.find((f) => f.key === key)?.more) setShowMore(true);
      document.getElementById(`f-${key}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (photosRequired && savedPhotos.length + photoDrafts.length === 0) {
      setProblem({ key: "photos", text: t("Piga angalau picha moja.", "Take at least one photo.") });
      document.getElementById("f-photos")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setSaving(true);
    const now = Date.now();
    const occurredAt = Math.min(new Date(when).getTime() || now, now);
    const record: LocalRecord = {
      clientId: existing?.clientId ?? uuidv7(),
      councilId,
      type: spec.type,
      section,
      areaId: areaId || undefined,
      occurredAt,
      payload: spec.type === "price" ? { ...payload, foodPeriod: existing?.payload.foodPeriod ?? foodPeriod } : payload,
      payloadVersion: PAYLOAD_VERSION,
      geo: existing?.geo ?? geoValue,
      clientUpdatedAt: now,
      syncState: "pending",
    };
    await db.transaction("rw", db.records, db.media, async () => {
      await db.records.put(record);
      for (const d of photoDrafts) {
        const m: LocalMedia = {
          clientId: d.clientId,
          councilId,
          recordClientId: record.clientId,
          section,
          shot: d.shot,
          caption: d.caption?.trim() || undefined,
          width: d.width,
          height: d.height,
          bytes: d.blob.size,
          takenAt: d.takenAt,
          blob: d.blob,
          thumb: d.thumb,
          syncState: "pending",
        };
        await db.media.put(m);
      }
      for (const id of photosRemoved) {
        const m = await db.media.get(id);
        if (!m) continue;
        // Never uploaded: just forget it. Uploaded: queue the server delete.
        if (!m.storageId && !m.uploadedAt) await db.media.delete(id);
        else await db.media.update(id, { deletedAt: now, syncState: "pending", blob: undefined });
      }
    });
    if (areaId) await setMeta(`lastArea:${councilId}`, areaId);
    const remembered: Draft = {};
    for (const f of spec.fields) if ((f.kind === "select" || f.kind === "choice") && draft[f.key]) remembered[f.key] = draft[f.key]!;
    await setMeta(`last:${spec.type}`, remembered);
    requestSync();
    goBack();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: t("Futa kumbukumbu hii?", "Delete this record?"),
      body: t("Itaondolewa kwenye historia na kwenye ripoti, pamoja na picha zake.", "It will be removed from the history and the report, with its photos."),
      confirmLabel: t("Futa", "Delete"),
      cancelLabel: t("Hapana", "No"),
      tone: "danger",
    });
    if (!ok) return;
    const at = Date.now();
    await db.transaction("rw", db.records, db.media, async () => {
      await db.records.update(existing.clientId, { deletedAt: at, clientUpdatedAt: at, syncState: "pending" });
      // The server deletes uploaded photos with the record; the phone drops its copies.
      await db.media.where("recordClientId").equals(existing.clientId).delete();
    });
    requestSync();
    goBack();
  };

  const fieldBlock = (f: (typeof visible)[number]) => (
    <div key={f.key} id={`f-${f.key}`}>
      <FieldInput field={f} value={draft[f.key] ?? ""} onChange={(v) => set(f.key, v)} payload={payload} error={problem?.key === f.key} />
      {problem?.key === f.key && <p className="field-error" role="alert">{problem.text}</p>}
    </div>
  );


  const photoBlock = (
    <PhotoField
      saved={savedPhotos}
      drafts={photoDrafts}
      onDrafts={(next) => {
        setPhotoDrafts(next);
        if (problem?.key === "photos") setProblem(null);
      }}
      onRemoveSaved={(id) => setPhotosRemoved((r) => [...r, id])}
      required={photosRequired}
      error={problem?.key === "photos" ? problem.text : null}
    />
  );

  return (
    <main className="page narrow">
      <div className="page-bar">
        <button type="button" className="back" onClick={goBack}>{t("Rudi", "Back")}</button>
        {editing && existing && !existing.deletedAt && (
          <button type="button" className="icon-btn is-danger" onClick={() => void remove()} aria-label={t("Futa kumbukumbu hii", "Delete this record")} title={t("Futa", "Delete")}>
            <IconTrash />
          </button>
        )}
      </div>
      <h1 className="page-title">{editing ? `${t("Badili", "Edit")}: ${spec.label}` : spec.label}</h1>

      <form className="stack" onSubmit={submit} noValidate>
        {allowed.length > 1 && (
          <fieldset className="field plain">
            <legend>{t("Ni kazi ya sehemu gani?", "Which section is this work for?")}</legend>
            <div className="chips">
              {allowed.map((s) => (
                <button type="button" key={s} className={`chip sec sec-${s}`} aria-pressed={section === s} onClick={() => setSection(s)}>
                  <span className="sec-tag" aria-hidden />
                  {t(SECTION_LABELS[s].sw, SECTION_LABELS[s].en)}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {photosRequired && photoBlock}

        {main.map(fieldBlock)}

        {!photosRequired && photoBlock}

        <div className="field">
          <span className="field-label" id="where-label">{t("Wapi?", "Where?")}</span>
          <Select labelledBy="where-label" label={t("Wapi?", "Where?")} value={areaId} onChange={setAreaId} options={areaOptions} placeholder={t("Sijachagua", "Not chosen")} />
        </div>

        {more.length > 0 && (
          <div className="more">
            <button type="button" className="more-toggle" aria-expanded={showMore} onClick={() => setShowMore((s) => !s)}>
              {showMore ? t("Ficha taarifa za ziada", "Hide extra details") : t(`Taarifa za ziada (${more.length})`, `Extra details (${more.length})`)}
            </button>
            {showMore && <div className="stack">{more.map(fieldBlock)}</div>}
          </div>
        )}

        <div className="field">
          <span className="field-label" id="le-when">{t("Lini?", "When?")}</span>
          <div className="when-row">
            <DatePicker
              labelledBy="le-when"
              label={t("Tarehe", "Date")}
              value={when.slice(0, 10)}
              max={nowLocal.slice(0, 10)}
              onChange={(d) => {
                if (!d) return;
                // Today cannot have a time later than now.
                const time = d === nowLocal.slice(0, 10) && when.slice(11, 16) > nowLocal.slice(11, 16) ? nowLocal.slice(11, 16) : when.slice(11, 16);
                setWhen(`${d}T${time}`);
              }}
            />
            <TimeField
              labelledBy="le-when"
              value={when.slice(11, 16)}
              maxForToday={when.slice(0, 10) === nowLocal.slice(0, 10) ? nowLocal.slice(11, 16) : undefined}
              onChange={(tm) => setWhen(`${when.slice(0, 10)}T${tm}`)}
            />
          </div>
        </div>

        <GeoLine status={geo} onRetry={() => setAttempt((n) => n + 1)} />

        <div className="form-actions">
          <button className="btn btn-primary btn-block" disabled={saving}>
            {saving ? t("Inahifadhi…", "Saving…") : t("Hifadhi", "Save")}
          </button>
        </div>
      </form>
    </main>
  );
}
