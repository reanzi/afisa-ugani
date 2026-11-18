import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { v7 as uuidv7 } from "uuid";
import { fieldVisible, PAYLOAD_VERSION, SECTION_LABELS, specFor, validatePayload, type RecordSpec, type Section } from "@afisa/shared";
import { db, getMeta, setMeta, type Geo, type LocalRecord } from "../lib/db";
import { captureLocation, type GeoStatus } from "../lib/geo";
import { useWork } from "../lib/session";
import { useMyAreas } from "../lib/areas";
import { requestSync } from "../lib/sync";
import { draftToPayload, FieldInput, payloadToDraft, type Draft } from "./fields";
import { Select, type SelectOption } from "@afisa/ui";

/** "2026-11-17T14:05" in local time, for <input type="datetime-local">. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

function GeoLine({ status, onRetry }: { status: GeoStatus; onRetry: () => void }) {
  switch (status.state) {
    case "searching":
      return (
        <p className="geo geo-wait" aria-live="polite">
          Inatafuta mahali ulipo{status.best ? ` (sasa ±${status.best.accuracy} m)` : ""}…
        </p>
      );
    case "found":
      return <p className="geo geo-ok">Mahali pamepatikana, usahihi ±{status.geo.accuracy} m.</p>;
    case "weak":
      return (
        <p className="geo geo-wait">
          Mahali pamepatikana kwa usahihi mdogo (±{status.geo.accuracy} m).{" "}
          <button type="button" className="link" onClick={onRetry}>Jaribu tena</button>
        </p>
      );
    case "denied":
      return <p className="geo geo-off">Ruhusa ya mahali imezimwa. Iwashe kwenye mipangilio ya kivinjari ili kumbukumbu iwe na mahali.</p>;
    case "unavailable":
      return (
        <p className="geo geo-off">
          Mahali hapakupatikana. Kumbukumbu itahifadhiwa bila mahali.{" "}
          <button type="button" className="link" onClick={onRetry}>Jaribu tena</button>
        </p>
      );
  }
}

function ComingSoon({ label }: { label: string }) {
  return (
    <main className="page narrow">
      <Link to="/" className="back">Rudi</Link>
      <h1 className="page-title">{label}</h1>
      <p className="lead">
        Picha zinakuja katika hatua inayofuata, pamoja na maelezo ya kila picha. Kwa sasa tumia{" "}
        <Link to="/andika/activity">Shughuli nyingine</Link> kuandika ulichoona.
      </p>
    </main>
  );
}

export function LogEntry() {
  const { type = "activity", clientId } = useParams();
  const spec = specFor(type);
  if (!spec || !spec.ready || type === "monthly_review") return <ComingSoon label={spec?.label ?? "Fomu"} />;
  return <SpecForm key={`${type}:${clientId ?? "new"}`} spec={spec} clientId={clientId} />;
}

const VALIDATION_TEXT: Record<string, string> = {
  MISSING: "Jaza sehemu hii",
  BAD_NUMBER: "Andika namba sahihi",
  BAD_OPTION: "Chagua mojawapo",
  BAD_TEXT: "Maandishi ni marefu mno",
};

function SpecForm({ spec, clientId }: { spec: RecordSpec; clientId?: string }) {
  const navigate = useNavigate();
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
  const [geo, setGeo] = useState<GeoStatus>({ state: "searching" });
  const [attempt, setAttempt] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [problem, setProblem] = useState<{ key: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

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
  const areaOptions = useMemo<SelectOption[]>(() => {
    const out: SelectOption[] = [{ value: "", label: "Sijachagua" }];
    for (const w of wards) {
      const group = `Kata ya ${w.name}`;
      out.push({ value: w._id, label: `Kata ya ${w.name} (yote)`, group });
      for (const v of villages.filter((x) => x.parentId === w._id)) out.push({ value: v._id, label: v.name, group });
    }
    for (const v of villages.filter((x) => !wards.some((w) => w._id === x.parentId))) out.push({ value: v._id, label: v.name, group: "Vijiji" });
    return out;
  }, [wards, villages]);
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
      setProblem({ key, text: VALIDATION_TEXT[code ?? ""] ?? "Angalia taarifa ulizojaza" });
      if (spec.fields.find((f) => f.key === key)?.more) setShowMore(true);
      document.getElementById(`f-${key}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
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
      payload,
      payloadVersion: PAYLOAD_VERSION,
      geo: existing?.geo ?? geoValue,
      clientUpdatedAt: now,
      syncState: "pending",
    };
    await db.records.put(record);
    if (areaId) await setMeta(`lastArea:${councilId}`, areaId);
    const remembered: Draft = {};
    for (const f of spec.fields) if ((f.kind === "select" || f.kind === "choice") && draft[f.key]) remembered[f.key] = draft[f.key]!;
    await setMeta(`last:${spec.type}`, remembered);
    requestSync();
    goBack();
  };

  const remove = async () => {
    if (!existing) return;
    if (!window.confirm("Futa kumbukumbu hii? Itaondolewa kwenye ripoti.")) return;
    await db.records.update(existing.clientId, { deletedAt: Date.now(), clientUpdatedAt: Date.now(), syncState: "pending" });
    requestSync();
    goBack();
  };

  const fieldBlock = (f: (typeof visible)[number]) => (
    <div key={f.key} id={`f-${f.key}`}>
      <FieldInput field={f} value={draft[f.key] ?? ""} onChange={(v) => set(f.key, v)} payload={payload} error={problem?.key === f.key} />
      {problem?.key === f.key && <p className="field-error" role="alert">{problem.text}</p>}
    </div>
  );

  return (
    <main className="page narrow">
      <button type="button" className="back" onClick={goBack}>Rudi</button>
      <h1 className="page-title">{editing ? `Badili: ${spec.label}` : spec.label}</h1>

      <form className="stack" onSubmit={submit} noValidate>
        {allowed.length > 1 && (
          <fieldset className="field plain">
            <legend>Ni kazi ya sehemu gani?</legend>
            <div className="chips">
              {allowed.map((s) => (
                <button type="button" key={s} className={`chip sec sec-${s}`} aria-pressed={section === s} onClick={() => setSection(s)}>
                  <span className="sec-tag" aria-hidden />
                  {SECTION_LABELS[s].sw}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {main.map(fieldBlock)}

        <div className="field">
          <span className="field-label" id="where-label">Wapi?</span>
          <Select labelledBy="where-label" label="Wapi?" value={areaId} onChange={setAreaId} options={areaOptions} placeholder="Sijachagua" />
        </div>

        {more.length > 0 && (
          <div className="more">
            <button type="button" className="more-toggle" aria-expanded={showMore} onClick={() => setShowMore((s) => !s)}>
              {showMore ? "Ficha taarifa za ziada" : `Taarifa za ziada (${more.length})`}
            </button>
            {showMore && <div className="stack">{more.map(fieldBlock)}</div>}
          </div>
        )}

        <label className="field">
          <span>Lini?</span>
          <input className="input" type="datetime-local" value={when} max={toLocalInput(Date.now())} onChange={(e) => setWhen(e.target.value)} />
        </label>

        <GeoLine status={geo} onRetry={() => setAttempt((n) => n + 1)} />

        <div className="form-actions">
          <button className="btn btn-primary btn-block" disabled={saving}>
            {saving ? "Inahifadhi…" : "Hifadhi"}
          </button>
          {editing && existing && !existing.deletedAt && (
            <button type="button" className="btn btn-danger btn-block" onClick={remove}>Futa</button>
          )}
        </div>
      </form>
    </main>
  );
}
