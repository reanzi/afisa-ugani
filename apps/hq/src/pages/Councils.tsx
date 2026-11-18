/** Root only: create councils (with their NaPA address list), manage codes, open or close sign-ups. */
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { formatCouncilCode, type NapaImport } from "@afisa/shared";
import { CouncilCodeText, errorMessage } from "@afisa/ui";
import { hqClient } from "../context";
import { napaErrorText, readNapaFile, useNapaImport, type ImportProgress } from "../napa";

const n = (v: number) => v.toLocaleString("en-US");

function FilePicker({ onParsed, disabled }: { onParsed: (data: NapaImport | null, name: string | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError(null);
    setName(file.name);
    try {
      onParsed(await readNapaFile(file), file.name);
    } catch (e) {
      setError(napaErrorText(e));
      onParsed(null, null);
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="file-pick">
      <input
        ref={input}
        type="file"
        accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="visually-hidden"
        id="napa-file"
        onChange={(e) => void pick(e.target.files?.[0])}
        disabled={disabled}
      />
      <label htmlFor="napa-file" className={`btn btn-quiet ${disabled ? "is-disabled" : ""}`}>
        {reading ? "Inasoma faili…" : name ? "Chagua faili jingine" : "Chagua faili la anwani (.xls, .xlsx)"}
      </label>
      {name && !error && !reading && <span className="muted small">{name}</span>}
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
    </div>
  );
}

function Preview({ data }: { data: NapaImport }) {
  return (
    <div className="napa-preview">
      <p>
        <strong>{data.councilTitle ?? "Ripoti ya anwani"}</strong>
        {data.reportDate ? `, ripoti ya tarehe ${data.reportDate}` : ""}
      </p>
      <dl className="napa-totals">
        <div><dt>Kata</dt><dd>{n(data.totals.wards)}</dd></div>
        <div><dt>Vijiji / mitaa</dt><dd>{n(data.totals.villages)}</dd></div>
        <div><dt>Barabara na vitongoji</dt><dd>{n(data.totals.streets)}</dd></div>
        <div><dt>Anwani</dt><dd>{n(data.totals.addresses)}</dd></div>
      </dl>
      <p className="muted small">{data.wards.map((w) => w.name).join(", ")}</p>
      {data.skipped > 0 && <p className="tone-danger small">Mistari {data.skipped} haikuwa na kata au kijiji, haitaingizwa.</p>}
    </div>
  );
}

function ProgressLine({ progress }: { progress: ImportProgress }) {
  if (progress.state === "running") {
    return (
      <div className="import-progress" role="status" aria-live="polite">
        <div className="bar"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
        <p>Inapakia kata {progress.done + 1} kati ya {progress.total}: {progress.ward}</p>
      </div>
    );
  }
  if (progress.state === "error") return <div className="notice notice-danger" role="alert"><p>{progress.message}</p></div>;
  if (progress.state === "done") {
    return (
      <div className="notice notice-ok" role="status">
        <p>
          Anwani zimeingizwa: kata {n(progress.added.wards)}, vijiji/mitaa {n(progress.added.villages)}, barabara na vitongoji {n(progress.added.streets)} vipya
          {progress.updated ? `; ${n(progress.updated)} vimesasishwa` : ""}.
        </p>
      </div>
    );
  }
  return null;
}

function CreateCouncil() {
  const create = useMutation(api.councils.create);
  const { progress, run, reset } = useNapaImport();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [data, setData] = useState<NapaImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ councilId: Id<"councils">; code: string; name: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await create({ name, region, registrationOpen: true, client: hqClient });
      setCreated({ ...res, name: name.trim() });
      if (data) await run(res.councilId, data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setCreated(null);
    setName("");
    setRegion("");
    setData(null);
    reset();
  };

  if (created) {
    return (
      <section className="create-council done">
        <h2>{created.name}</h2>
        <p>Mpe Mkuu wa Idara msimbo huu. Ataufungua akaunti kwenye makao makuu na kuuandika ili kuomba kujiunga.</p>
        <div className="code-show">
          <CouncilCodeText code={created.code} large />
          <button type="button" className="btn btn-quiet btn-small" onClick={() => void navigator.clipboard?.writeText(formatCouncilCode(created.code))}>
            Nakili msimbo
          </button>
        </div>
        <ProgressLine progress={progress} />
        {progress.state === "error" && data && (
          <button type="button" className="btn btn-primary" onClick={() => void run(created.councilId, data)}>Pakia tena</button>
        )}
        {progress.state !== "running" && (
          <button type="button" className="btn btn-quiet" onClick={startOver}>Ongeza halmashauri nyingine</button>
        )}
      </section>
    );
  }

  return (
    <form className="create-council" onSubmit={submit}>
      <h2>Ongeza halmashauri</h2>
      <div className="create-grid">
        <label className="field">
          <span>Jina</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Halmashauri ya Wilaya ya Bagamoyo" />
        </label>
        <label className="field">
          <span>Mkoa</span>
          <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Pwani" />
        </label>
      </div>
      <div className="field">
        <span>Anwani kutoka NaPA (si lazima)</span>
        <FilePicker
          disabled={busy}
          onParsed={(d) => {
            setData(d);
            if (d?.councilTitle && !name.trim()) setName(d.councilTitle);
          }}
        />
        <small>Ripoti ya "Idadi ya Anwani za Barabara" ya halmashauri: kata, vijiji au mitaa, na barabara au vitongoji vyake.</small>
      </div>
      {data && <Preview data={data} />}
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      <p className="muted small">Msimbo wa herufi 8 utatolewa na mfumo baada ya kuongeza.</p>
      <button className="btn btn-primary" disabled={busy || name.trim().length < 3 || region.trim().length < 2}>
        {busy ? "Inaongeza…" : data ? `Ongeza na pakia kata ${data.totals.wards}` : "Ongeza halmashauri"}
      </button>
    </form>
  );
}

function UploadForCouncil({ councilId, onClose }: { councilId: Id<"councils">; onClose: () => void }) {
  const { progress, run } = useNapaImport();
  const [data, setData] = useState<NapaImport | null>(null);
  return (
    <div className="upload-panel">
      <FilePicker onParsed={(d) => setData(d)} disabled={progress.state === "running"} />
      {data && <Preview data={data} />}
      <ProgressLine progress={progress} />
      <div className="row-actions">
        {data && progress.state !== "running" && progress.state !== "done" && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => void run(councilId, data)}>
            {progress.state === "error" ? "Pakia tena" : `Pakia kata ${data.totals.wards}`}
          </button>
        )}
        {progress.state !== "running" && <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>Funga</button>}
      </div>
    </div>
  );
}

export function Councils() {
  const councils = useQuery(api.councils.listAll, {});
  const update = useMutation(api.councils.update);
  const regenerate = useMutation(api.councils.regenerateCode);
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  const newCode = async (councilId: Id<"councils">, legacy: boolean) => {
    const ok = window.confirm(
      legacy
        ? "Toa msimbo mpya wa herufi 8? Msimbo wa zamani hautafanya kazi tena."
        : "Toa msimbo mpya? Msimbo wa sasa hautafanya kazi tena; wale ambao bado hawajaomba watahitaji msimbo mpya.",
    );
    if (ok) await regenerate({ councilId, client: hqClient });
  };

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>Halmashauri</h1>
        <p className="muted">
          Kila halmashauri ina msimbo wa herufi 8. Mkuu wa Idara anafungua akaunti kwenye makao makuu, anaandika msimbo huo, na wewe unaidhinisha
          ombi lake kwenye Maombi ya halmashauri hiyo.
        </p>
      </header>

      <CreateCouncil />

      {councils?.length === 0 && <p className="empty">Bado hakuna halmashauri.</p>}
      {councils && councils.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Halmashauri</th>
              <th>Msimbo</th>
              <th>Anwani</th>
              <th>Wanachama</th>
              <th>Maombi ya maafisa</th>
              <th>Hali</th>
            </tr>
          </thead>
          <tbody>
            {councils.map((c) => (
              <tr key={c._id}>
                <td>
                  <strong>{c.name}</strong>
                  <div className="muted small">{c.region}</div>
                </td>
                <td>
                  <div className="code-cell">
                    <CouncilCodeText code={c.code} />
                    {!c.validCode && <span className="tone-danger small">Msimbo wa zamani</span>}
                    <button type="button" className="link small" onClick={() => void newCode(c._id, !c.validCode)}>
                      {c.validCode ? "Badili" : "Toa msimbo mpya"}
                    </button>
                  </div>
                </td>
                <td>
                  {c.addressImport ? (
                    <div className="small">
                      Kata {n(c.addressImport.wards)}, vijiji {n(c.addressImport.villages)}, barabara {n(c.addressImport.streets)}
                      <div className="muted">{c.addressImport.reportDate ? `Ripoti ${c.addressImport.reportDate}` : ""}</div>
                    </div>
                  ) : (
                    <span className="muted small">Hakuna</span>
                  )}
                  {uploadFor === c._id ? (
                    <UploadForCouncil councilId={c._id} onClose={() => setUploadFor(null)} />
                  ) : (
                    <button type="button" className="link small" onClick={() => setUploadFor(c._id)}>
                      {c.addressImport ? "Pakia ripoti mpya" : "Pakia anwani"}
                    </button>
                  )}
                </td>
                <td>
                  {c.active}
                  {c.pending > 0 && <span className="badge inline">{c.pending} yanasubiri</span>}
                </td>
                <td>
                  <div className="state-cell">
                    <span className={c.registrationOpen ? "status status-active" : "status"}>{c.registrationOpen ? "Wazi" : "Imefungwa"}</span>
                    <button className="btn btn-quiet btn-small" onClick={() => void update({ councilId: c._id, registrationOpen: !c.registrationOpen, client: hqClient })}>
                      {c.registrationOpen ? "Funga" : "Fungua"}
                    </button>
                  </div>
                </td>
                <td>
                  <div className="state-cell">
                    <span className={`status status-${c.status === "active" ? "active" : "suspended"}`}>{c.status === "active" ? "Hai" : "Imesitishwa"}</span>
                    <button
                      className={`btn btn-small ${c.status === "active" ? "btn-danger" : "btn-quiet"}`}
                      onClick={() => void update({ councilId: c._id, status: c.status === "active" ? "disabled" : "active", client: hqClient })}
                    >
                      {c.status === "active" ? "Sitisha" : "Rejesha"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
