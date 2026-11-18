/** Root only: create councils (with their NaPA address list), manage codes, open or close sign-ups. */
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { formatCouncilCode, type NapaImport } from "@afisa/shared";
import { CouncilCodeText, errorMessage, useConfirm, useT } from "@afisa/ui";
import { hqClient } from "../context";
import { napaErrorText, readNapaFile, useNapaImport, type ImportProgress } from "../napa";

const n = (v: number) => v.toLocaleString("en-US");

function FilePicker({ onParsed, disabled }: { onParsed: (data: NapaImport | null, name: string | null) => void; disabled?: boolean }) {
  const t = useT();
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
        {reading ? t("Inasoma faili…", "Reading the file…") : name ? t("Chagua faili jingine", "Choose another file") : t("Chagua faili la anwani (.xls, .xlsx)", "Choose the address file (.xls, .xlsx)")}
      </label>
      {name && !error && !reading && <span className="muted small">{name}</span>}
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
    </div>
  );
}

function Preview({ data }: { data: NapaImport }) {
  const t = useT();
  return (
    <div className="napa-preview">
      <p>
        <strong>{data.councilTitle ?? t("Ripoti ya anwani", "Address report")}</strong>
        {data.reportDate ? t(`, ripoti ya tarehe ${data.reportDate}`, `, report dated ${data.reportDate}`) : ""}
      </p>
      <dl className="napa-totals">
        <div><dt>{t("Kata", "Wards")}</dt><dd>{n(data.totals.wards)}</dd></div>
        <div><dt>{t("Vijiji / mitaa", "Villages / streets")}</dt><dd>{n(data.totals.villages)}</dd></div>
        <div><dt>{t("Barabara na vitongoji", "Roads and hamlets")}</dt><dd>{n(data.totals.streets)}</dd></div>
        <div><dt>{t("Anwani", "Addresses")}</dt><dd>{n(data.totals.addresses)}</dd></div>
      </dl>
      <p className="muted small">{data.wards.map((w) => w.name).join(", ")}</p>
      {data.skipped > 0 && <p className="tone-danger small">{t(`Mistari ${data.skipped} haikuwa na kata au kijiji, haitaingizwa.`, `${data.skipped} rows had no ward or village and will be skipped.`)}</p>}
    </div>
  );
}

function ProgressLine({ progress }: { progress: ImportProgress }) {
  const t = useT();
  if (progress.state === "running") {
    return (
      <div className="import-progress" role="status" aria-live="polite">
        <div className="bar"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
        <p>{t(`Inapakia kata ${progress.done + 1} kati ya ${progress.total}: ${progress.ward}`, `Loading ward ${progress.done + 1} of ${progress.total}: ${progress.ward}`)}</p>
      </div>
    );
  }
  if (progress.state === "error") return <div className="notice notice-danger" role="alert"><p>{progress.message}</p></div>;
  if (progress.state === "done") {
    return (
      <div className="notice notice-ok" role="status">
        <p>
          {t(
            `Anwani zimeingizwa: kata ${n(progress.added.wards)}, vijiji/mitaa ${n(progress.added.villages)}, barabara na vitongoji ${n(progress.added.streets)} vipya${progress.updated ? `; ${n(progress.updated)} vimesasishwa` : ""}.`,
            `Addresses imported: ${n(progress.added.wards)} wards, ${n(progress.added.villages)} villages/streets, ${n(progress.added.streets)} new roads and hamlets${progress.updated ? `; ${n(progress.updated)} updated` : ""}.`,
          )}
        </p>
      </div>
    );
  }
  return null;
}

function CreateCouncil() {
  const t = useT();
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
        <p>{t("Mpe Mkuu wa Idara msimbo huu. Atafungua akaunti kwenye makao makuu na kuuandika ili kuomba kujiunga.", "Give this code to the Head of Department. They create an account in head office and enter it to ask to join.")}</p>
        <div className="code-show">
          <CouncilCodeText code={created.code} large />
          <button type="button" className="btn btn-quiet btn-small" onClick={() => void navigator.clipboard?.writeText(formatCouncilCode(created.code))}>
            {t("Nakili msimbo", "Copy code")}
          </button>
        </div>
        <ProgressLine progress={progress} />
        {progress.state === "error" && data && (
          <button type="button" className="btn btn-primary" onClick={() => void run(created.councilId, data)}>{t("Pakia tena", "Load again")}</button>
        )}
        {progress.state !== "running" && (
          <button type="button" className="btn btn-quiet" onClick={startOver}>{t("Ongeza halmashauri nyingine", "Add another council")}</button>
        )}
      </section>
    );
  }

  return (
    <form className="create-council" onSubmit={submit}>
      <h2>{t("Ongeza halmashauri", "Add a council")}</h2>
      <div className="create-grid">
        <label className="field">
          <span>{t("Jina", "Name")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Halmashauri ya Wilaya ya Bagamoyo" />
        </label>
        <label className="field">
          <span>{t("Mkoa", "Region")}</span>
          <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Pwani" />
        </label>
      </div>
      <div className="field">
        <span>{t("Anwani kutoka NaPA (si lazima)", "Addresses from NaPA (optional)")}</span>
        <FilePicker
          disabled={busy}
          onParsed={(d) => {
            setData(d);
            if (d?.councilTitle && !name.trim()) setName(d.councilTitle);
          }}
        />
        <small>{t('Ripoti ya "Idadi ya Anwani za Barabara" ya halmashauri: kata, vijiji au mitaa, na barabara au vitongoji vyake.', 'The council\'s "Idadi ya Anwani za Barabara" report: wards, villages or streets, and their roads or hamlets.')}</small>
      </div>
      {data && <Preview data={data} />}
      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      <p className="muted small">{t("Msimbo wa herufi 8 utatolewa na mfumo baada ya kuongeza.", "The system issues an 8-character code once the council is added.")}</p>
      <button className="btn btn-primary" disabled={busy || name.trim().length < 3 || region.trim().length < 2}>
        {busy ? t("Inaongeza…", "Adding…") : data ? t(`Ongeza na pakia kata ${data.totals.wards}`, `Add and load ${data.totals.wards} wards`) : t("Ongeza halmashauri", "Add council")}
      </button>
    </form>
  );
}

function UploadForCouncil({ councilId, onClose }: { councilId: Id<"councils">; onClose: () => void }) {
  const t = useT();
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
            {progress.state === "error" ? t("Pakia tena", "Load again") : t(`Pakia kata ${data.totals.wards}`, `Load ${data.totals.wards} wards`)}
          </button>
        )}
        {progress.state !== "running" && <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>{t("Funga", "Close")}</button>}
      </div>
    </div>
  );
}

export function Councils() {
  const t = useT();
  const confirm = useConfirm();
  const councils = useQuery(api.councils.listAll, {});
  const update = useMutation(api.councils.update);
  const regenerate = useMutation(api.councils.regenerateCode);
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  const newCode = async (councilId: Id<"councils">, legacy: boolean) => {
    const ok = await confirm({
      title: legacy ? t("Toa msimbo mpya wa herufi 8?", "Issue a new 8-character code?") : t("Toa msimbo mpya?", "Issue a new code?"),
      body: legacy
        ? t("Msimbo wa zamani hautafanya kazi tena.", "The old code will stop working.")
        : t(
            "Msimbo wa sasa hautafanya kazi tena. Wale ambao bado hawajaomba kujiunga watahitaji msimbo mpya.",
            "The current code will stop working. Anyone who has not yet asked to join will need the new code.",
          ),
      confirmLabel: t("Toa msimbo mpya", "Issue new code"),
      tone: "danger",
    });
    if (ok) await regenerate({ councilId, client: hqClient });
  };

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>{t("Halmashauri", "Councils")}</h1>
        <p className="muted">
          {t(
            "Kila halmashauri ina msimbo wa herufi 8. Mkuu wa Idara anafungua akaunti kwenye makao makuu, anaandika msimbo huo, na wewe unaidhinisha ombi lake kwenye Maombi ya halmashauri hiyo.",
            "Each council has an 8-character code. The Head of Department creates an account in head office, enters the code, and you approve the request under that council's Requests.",
          )}
        </p>
      </header>

      <CreateCouncil />

      {councils?.length === 0 && <p className="empty">{t("Bado hakuna halmashauri.", "No councils yet.")}</p>}
      {councils && councils.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t("Halmashauri", "Council")}</th>
              <th>{t("Msimbo", "Code")}</th>
              <th>{t("Anwani", "Addresses")}</th>
              <th>{t("Wanachama", "Members")}</th>
              <th>{t("Usajili wa maafisa", "Officer sign-up")}</th>
              <th>{t("Hali", "Status")}</th>
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
                    {!c.validCode && <span className="tone-danger small">{t("Msimbo wa zamani", "Old-style code")}</span>}
                    <button type="button" className="link small" onClick={() => void newCode(c._id, !c.validCode)}>
                      {c.validCode ? t("Badili", "Change") : t("Toa msimbo mpya", "Issue new code")}
                    </button>
                  </div>
                </td>
                <td>
                  {c.addressImport ? (
                    <div className="small">
                      {t(
                        `Kata ${n(c.addressImport.wards)}, vijiji ${n(c.addressImport.villages)}, barabara ${n(c.addressImport.streets)}`,
                        `${n(c.addressImport.wards)} wards, ${n(c.addressImport.villages)} villages, ${n(c.addressImport.streets)} roads`,
                      )}
                      <div className="muted">{c.addressImport.reportDate ? t(`Ripoti ${c.addressImport.reportDate}`, `Report ${c.addressImport.reportDate}`) : ""}</div>
                    </div>
                  ) : (
                    <span className="muted small">{t("Hakuna", "None")}</span>
                  )}
                  {uploadFor === c._id ? (
                    <UploadForCouncil councilId={c._id} onClose={() => setUploadFor(null)} />
                  ) : (
                    <button type="button" className="link small" onClick={() => setUploadFor(c._id)}>
                      {c.addressImport ? t("Pakia ripoti mpya", "Load a newer report") : t("Pakia anwani", "Load addresses")}
                    </button>
                  )}
                </td>
                <td>
                  {c.active}
                  {c.pending > 0 && <span className="badge inline">{t(`${c.pending} yanasubiri`, `${c.pending} waiting`)}</span>}
                </td>
                <td>
                  <div className="state-cell">
                    <span className={c.registrationOpen ? "status status-active" : "status"}>{c.registrationOpen ? t("Wazi", "Open") : t("Imefungwa", "Closed")}</span>
                    <button className="btn btn-quiet btn-small" onClick={() => void update({ councilId: c._id, registrationOpen: !c.registrationOpen, client: hqClient })}>
                      {c.registrationOpen ? t("Funga", "Close") : t("Fungua", "Open")}
                    </button>
                  </div>
                </td>
                <td>
                  <div className="state-cell">
                    <span className={`status status-${c.status === "active" ? "active" : "suspended"}`}>{c.status === "active" ? t("Hai", "Active") : t("Imesitishwa", "Suspended")}</span>
                    <button
                      className={`btn btn-small ${c.status === "active" ? "btn-danger" : "btn-quiet"}`}
                      onClick={async () => {
                        if (c.status === "active") {
                          const ok = await confirm({
                            title: t(`Sitisha ${c.name}?`, `Suspend ${c.name}?`),
                            body: t("Hakuna mwanachama wa halmashauri hii atakayeweza kutumia mfumo hadi uirejeshe.", "No member of this council can use the system until you restore it."),
                            confirmLabel: t("Sitisha", "Suspend"),
                            tone: "danger",
                          });
                          if (!ok) return;
                        }
                        await update({ councilId: c._id, status: c.status === "active" ? "disabled" : "active", client: hqClient });
                      }}
                    >
                      {c.status === "active" ? t("Sitisha", "Suspend") : t("Rejesha", "Restore")}
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
