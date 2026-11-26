/**
 * Root only: every council at a glance, and one council in full (code,
 * sign-up, people in charge, NaPA addresses). Root creates councils here and
 * loads or refreshes any council's addresses.
 */
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { parseAsString, useQueryState } from "nuqs";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { formatCouncilCode, ROLE_LABELS, SECTION_LABELS, type NapaImport, type Role, type Section } from "@afisa/shared";
import { CouncilCodeText, Dialog, errorMessage, useConfirm, useLabel, useT, shortDate } from "@afisa/ui";
import { CopyCode } from "../CopyCode";
import { hqClient } from "../context";
import { napaErrorText, readNapaFile, useNapaImport, type ImportProgress } from "../napa";

const n = (v: number) => v.toLocaleString("en-US");
const day = (ms: number) => shortDate(ms);

/* ---------- NaPA file: pick, preview, load ---------- */

function FilePicker({ onParsed, disabled }: { onParsed: (data: NapaImport | null, name: string | null) => void; disabled?: boolean }) {
  const t = useT();
  const id = useId();
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
        id={id}
        onChange={(e) => void pick(e.target.files?.[0])}
        disabled={disabled}
      />
      <label htmlFor={id} className={`btn btn-quiet btn-small ${disabled ? "is-disabled" : ""}`}>
        {reading ? t("Inasoma faili…", "Reading the file…") : name ? t("Chagua faili jingine", "Choose another file") : t("Chagua faili la NaPA (.xls, .xlsx)", "Choose the NaPA file (.xls, .xlsx)")}
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
        {data.reportDate ? <span className="muted">{t(`, ripoti ya tarehe ${data.reportDate}`, `, report dated ${data.reportDate}`)}</span> : ""}
      </p>
      <dl className="napa-totals">
        <div><dt>{t("Kata", "Wards")}</dt><dd>{n(data.totals.wards)}</dd></div>
        <div><dt>{t("Vijiji / mitaa", "Villages / streets")}</dt><dd>{n(data.totals.villages)}</dd></div>
        <div><dt>{t("Barabara na vitongoji", "Roads and hamlets")}</dt><dd>{n(data.totals.streets)}</dd></div>
        <div><dt>{t("Anwani", "Addresses")}</dt><dd>{n(data.totals.addresses)}</dd></div>
      </dl>
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
        <p className="small">{t(`Inapakia kata ${progress.done + 1} kati ya ${progress.total}: ${progress.ward}`, `Loading ward ${progress.done + 1} of ${progress.total}: ${progress.ward}`)}</p>
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
            `Addresses loaded: ${n(progress.added.wards)} wards, ${n(progress.added.villages)} villages/streets, ${n(progress.added.streets)} new roads and hamlets${progress.updated ? `; ${n(progress.updated)} updated` : ""}.`,
          )}
        </p>
      </div>
    );
  }
  return null;
}

/** Load or refresh a council's addresses from a NaPA report. Re-loading only adds what is new and updates counts. */
export function UploadForCouncil({ councilId, onClose }: { councilId: Id<"councils">; onClose?: () => void }) {
  const t = useT();
  const { progress, run, reset } = useNapaImport();
  const [data, setData] = useState<NapaImport | null>(null);
  return (
    <div className="upload-panel">
      <FilePicker
        onParsed={(d) => {
          setData(d);
          reset();
        }}
        disabled={progress.state === "running"}
      />
      {data && <Preview data={data} />}
      <ProgressLine progress={progress} />
      <div className="row-actions">
        {data && progress.state !== "running" && progress.state !== "done" && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => void run(councilId, data)}>
            {progress.state === "error" ? t("Pakia tena", "Load again") : t(`Pakia kata ${data.totals.wards}`, `Load ${data.totals.wards} wards`)}
          </button>
        )}
        {onClose && progress.state !== "running" && <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>{t("Funga", "Close")}</button>}
      </div>
    </div>
  );
}

/* ---------- Small pieces ---------- */

type Tone = "ok" | "wait" | "danger" | "muted";
function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/* ---------- Create ---------- */

function CreateCouncilDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: Id<"councils">) => void }) {
  const t = useT();
  const create = useMutation(api.councils.create);
  const { progress, run, reset } = useNapaImport();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [region, setRegion] = useState("");
  const [data, setData] = useState<NapaImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ councilId: Id<"councils">; code: string; name: string } | null>(null);
  const formId = useId();

  const close = () => {
    setCreated(null);
    setName("");
    setDisplayName("");
    setRegion("");
    setData(null);
    setError(null);
    reset();
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await create({ name, displayName: displayName.trim() || undefined, region, registrationOpen: true, client: hqClient });
      setCreated({ ...res, name: name.trim() });
      if (data) await run(res.councilId, data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const running = busy || progress.state === "running";

  if (created) {
    return (
      <Dialog
        open={open}
        onClose={close}
        busy={running}
        wide
        title={t(`${created.name} imeongezwa`, `${created.name} added`)}
        actions={
          <>
            <button type="button" className="btn btn-primary" disabled={running} onClick={() => { const id = created.councilId; close(); onCreated(id); }}>
              {t("Angalia halmashauri", "View council")}
            </button>
            <button type="button" className="btn btn-quiet" disabled={running} onClick={close}>{t("Funga", "Close")}</button>
          </>
        }
      >
        <div className="code-show">
          <div>
            <span className="eyebrow">{t("Msimbo wa usajili", "Sign-up code")}</span>
            <CouncilCodeText code={created.code} large />
          </div>
          <CopyCode code={created.code} />
        </div>
        <ProgressLine progress={progress} />
        {progress.state === "error" && data && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => void run(created.councilId, data)}>{t("Pakia tena", "Load again")}</button>
        )}
        {!data && (
          <div className="notice notice-wait">
            <p>{t("Usajili utafunguka baada ya kupakia anwani. Fungua halmashauri hii na upakie faili la NaPA.", "Sign-up opens once addresses are loaded. Open this council and load the NaPA file.")}</p>
          </div>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={running}
      wide
      title={t("Ongeza halmashauri", "Add a council")}
      actions={
        <>
          <button form={formId} className="btn btn-primary" disabled={running || name.trim().length < 3 || region.trim().length < 2}>
            {busy ? t("Inaongeza…", "Adding…") : data ? t(`Ongeza na pakia kata ${data.totals.wards}`, `Add and load ${data.totals.wards} wards`) : t("Ongeza halmashauri", "Add council")}
          </button>
          <button type="button" className="btn btn-quiet" disabled={running} onClick={close}>{t("Ghairi", "Cancel")}</button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={submit}>
        <label className="field span-2">
          <span>{t("Jina kamili", "Full name")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Halmashauri ya Wilaya ya Bagamoyo" />
          <small>{t("Linatumika kwenye ripoti.", "Used on reports.")}</small>
        </label>
        <label className="field">
          <span>{t("Jina fupi", "Short name")}</span>
          <input className="input" maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Bagamoyo DC" />
          <small>{t("Linaonekana kwenye skrini (si lazima).", "Shown on screens (optional).")}</small>
        </label>
        <label className="field">
          <span>{t("Mkoa", "Region")}</span>
          <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Pwani" />
        </label>
        <div className="field span-2">
          <span>{t("Anwani kutoka NaPA", "Addresses from NaPA")}</span>
          <FilePicker
            disabled={running}
            onParsed={(d) => {
              setData(d);
              if (d?.councilTitle && !name.trim()) setName(d.councilTitle);
            }}
          />
          <small>{t('Ripoti ya "Idadi ya Anwani za Barabara". Unaweza pia kuipakia baadaye; usajili unafunguka anwani zikishaingia.', 'The "Idadi ya Anwani za Barabara" report. You can also load it later; sign-up opens once addresses are in.')}</small>
        </div>
        {data && <div className="span-2"><Preview data={data} /></div>}
        {error && <div className="notice notice-danger span-2" role="alert"><p>{error}</p></div>}
      </form>
    </Dialog>
  );
}

/* ---------- Edit ---------- */

function EditCouncilDialog({
  council,
  open,
  onClose,
}: {
  council: { _id: Id<"councils">; name: string; displayName: string | null; region: string };
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const update = useMutation(api.councils.update);
  const [name, setName] = useState(council.name);
  const [displayName, setDisplayName] = useState(council.displayName ?? "");
  const [region, setRegion] = useState(council.region);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await update({ councilId: council._id, name, displayName, region, client: hqClient });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      wide
      title={t("Badili taarifa za halmashauri", "Edit council details")}
      actions={
        <>
          <button form={formId} className="btn btn-primary" disabled={busy || name.trim().length < 3 || region.trim().length < 2}>
            {busy ? t("Inahifadhi…", "Saving…") : t("Hifadhi", "Save")}
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={onClose}>{t("Ghairi", "Cancel")}</button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={submit}>
        <label className="field span-2">
          <span>{t("Jina kamili", "Full name")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("Jina fupi", "Short name")}</span>
          <input className="input" maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("Acha wazi kutumia jina kamili", "Empty: use the full name")} />
        </label>
        <label className="field">
          <span>{t("Mkoa", "Region")}</span>
          <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} />
        </label>
        {error && <div className="notice notice-danger span-2" role="alert"><p>{error}</p></div>}
      </form>
    </Dialog>
  );
}

/* ---------- One council ---------- */

function CouncilDetail({ councilId, onBack, onOpen }: { councilId: Id<"councils">; onBack: () => void; onOpen: (id: Id<"councils">) => void }) {
  const t = useT();
  const label = useLabel();
  const confirm = useConfirm();
  const c = useQuery(api.councils.detail, { councilId });
  const update = useMutation(api.councils.update);
  const regenerate = useMutation(api.councils.regenerateCode);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (c === undefined) return <section className="hq-page"><p className="muted">{t("Inapakia…", "Loading…")}</p></section>;
  if (c === null) {
    return (
      <section className="hq-page">
        <button type="button" className="back-link" onClick={onBack}>← {t("Halmashauri zote", "All councils")}</button>
        <p className="empty">{t("Halmashauri hii haipo.", "This council does not exist.")}</p>
      </section>
    );
  }

  const hasAddresses = c.areas.villages > 0;
  const head = c.leads.find((l) => l.role === "admin");
  const signUpOpen = c.registrationOpen && hasAddresses && c.status === "active";
  const steps = [
    { done: hasAddresses, label: t("Anwani zimepakiwa", "Addresses loaded") },
    { done: signUpOpen, label: t("Usajili uko wazi", "Sign-up is open") },
    { done: Boolean(head), label: t("Mkuu wa Idara amewekwa", "Head of Department seated") },
  ];

  const newCode = async () => {
    const ok = await confirm({
      title: t("Toa msimbo mpya?", "Issue a new code?"),
      body: t("Msimbo wa sasa hautafanya kazi tena. Wale ambao bado hawajaomba kujiunga watahitaji msimbo mpya.", "The current code stops working. Anyone who has not yet asked to join will need the new one."),
      confirmLabel: t("Toa msimbo mpya", "Issue new code"),
      tone: "danger",
    });
    if (ok) await act(() => regenerate({ councilId, client: hqClient }));
  };

  const toggleStatus = async () => {
    if (c.status === "active") {
      const ok = await confirm({
        title: t(`Sitisha ${c.displayName ?? c.name}?`, `Suspend ${c.displayName ?? c.name}?`),
        body: t("Hakuna mwanachama wa halmashauri hii atakayeweza kutumia mfumo hadi uirejeshe.", "No member of this council can use the system until you restore it."),
        confirmLabel: t("Sitisha", "Suspend"),
        tone: "danger",
      });
      if (!ok) return;
    }
    await act(() => update({ councilId, status: c.status === "active" ? "disabled" : "active", client: hqClient }));
  };

  return (
    <section className="hq-page council-detail">
      <button type="button" className="back-link" onClick={onBack}>← {t("Halmashauri zote", "All councils")}</button>

      <header className="detail-head">
        <div className="detail-title">
          <h1>{c.displayName ?? c.name}</h1>
          <p className="muted">
            {c.displayName ? `${c.name} · ` : ""}
            {t(`Mkoa wa ${c.region}`, `${c.region} region`)} · {t(`Iliongezwa ${day(c.createdAt)}`, `Added ${day(c.createdAt)}`)}
          </p>
          <div className="pill-row">
            {c.status === "active" ? <Pill tone="ok">{t("Hai", "Active")}</Pill> : <Pill tone="danger">{t("Imesitishwa", "Suspended")}</Pill>}
            {signUpOpen ? <Pill tone="ok">{t("Usajili wazi", "Sign-up open")}</Pill> : !hasAddresses ? <Pill tone="wait">{t("Inasubiri anwani", "Needs addresses")}</Pill> : <Pill tone="muted">{t("Usajili umefungwa", "Sign-up closed")}</Pill>}
          </div>
        </div>
        <div className="detail-actions">
          <button type="button" className="btn btn-primary" onClick={() => onOpen(c._id)}>{t("Fungua halmashauri", "Open council")}</button>
          <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>{t("Badili taarifa", "Edit details")}</button>
        </div>
      </header>

      {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}

      <ol className="setup-steps" aria-label={t("Hatua za kuanzisha", "Setup steps")}>
        {steps.map((s, i) => (
          <li key={i} className={s.done ? "is-done" : undefined}>
            <span className="setup-mark" aria-hidden>{s.done ? "✓" : i + 1}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="detail-grid">
        <article className="card">
          <h2>{t("Msimbo wa usajili", "Sign-up code")}</h2>
          <div className="code-line">
            <CouncilCodeText code={c.code} large />
            <CopyCode code={c.code} />
          </div>
          {!c.validCode && <p className="tone-danger small">{t("Huu ni msimbo wa zamani. Toa msimbo mpya wa herufi 8.", "This is an old-style code. Issue a new 8-character code.")}</p>}
          {c.sectionCodes.length > 0 && (
            <>
              <span className="eyebrow">{t("Misimbo ya sehemu", "Section codes")}</span>
              <ul className="code-list">
                {c.sectionCodes.map((x) => (
                  <li key={x.section} className={`sec sec-${x.section}`}>
                    <span className="sec-tag">{label(SECTION_LABELS[x.section])}</span>
                    <span className="code-with-copy">
                      <span className="code-chip">{formatCouncilCode(x.code)}</span>
                      <CopyCode code={x.code} compact />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="muted small">{t("Mpe Mkuu wa Idara msimbo wa halmashauri. Watumishi wengine wanajisajili kwa msimbo wa sehemu yao, unaoonekana pia kwenye menyu ya pembeni ya viongozi wao.", "Give the Head of Department the council code. Other staff sign up with their section's code, which their leads also see in their side menu.")}</p>
          <div className="card-actions">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => void newCode()}>{t("Toa msimbo mpya", "Issue a new code")}</button>
          </div>
        </article>

        <article className="card">
          <h2>{t("Usajili", "Sign-up")}</h2>
          <p>
            {!hasAddresses
              ? t("Umefungwa hadi anwani (kata na vijiji) zipakiwe, ili anayeidhinisha aweze kupanga maeneo ya kazi.", "Closed until addresses (wards and villages) are loaded, so whoever approves can assign work areas.")
              : c.registrationOpen
                ? t("Wazi: watu wanaweza kuomba kujiunga kwa msimbo.", "Open: people can ask to join with the code.")
                : t("Umefungwa: msimbo haukubali maombi mapya.", "Closed: the code takes no new requests.")}
          </p>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-quiet btn-small"
              disabled={!hasAddresses && !c.registrationOpen}
              onClick={() => void act(() => update({ councilId, registrationOpen: !c.registrationOpen, client: hqClient }))}
            >
              {c.registrationOpen ? t("Funga usajili", "Close sign-up") : t("Fungua usajili", "Open sign-up")}
            </button>
          </div>
        </article>

        <article className="card">
          <h2>{t("Wanachama", "Members")}</h2>
          <dl className="stat-row">
            <div><dt>{t("Hai", "Active")}</dt><dd>{n(c.members.active)}</dd></div>
            <div><dt>{t("Wanasubiri", "Waiting")}</dt><dd className={c.members.pending ? "tone-wait" : undefined}>{n(c.members.pending)}</dd></div>
            <div><dt>{t("Wamesitishwa", "Suspended")}</dt><dd>{n(c.members.suspended)}</dd></div>
          </dl>
          {c.members.pending > 0 && (
            <div className="card-actions">
              <button type="button" className="btn btn-quiet btn-small" onClick={() => onOpen(c._id)}>{t("Shughulikia maombi", "Review requests")}</button>
            </div>
          )}
        </article>

        <article className="card">
          <h2>{t("Viongozi", "People in charge")}</h2>
          {c.leads.length === 0 ? (
            <p className="muted">
              {t("Bado hakuna. Mkuu wa Idara akishaomba kwa msimbo, mpe cheo kwenye Maombi.", "None yet. Once the Head of Department asks with the code, give them the position under Requests.")}
            </p>
          ) : (
            <ul className="lead-list">
              {c.leads.map((l, i) => (
                <li key={i}>
                  <strong>{l.name}</strong>
                  <span className="muted small">
                    {label(ROLE_LABELS[l.role as Role])}
                    {l.role === "section_head" || l.role === "section_vice" ? `, ${label(SECTION_LABELS[l.section as Section])}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="card span-2">
          <div className="card-head">
            <h2>{t("Anwani", "Addresses")}</h2>
            {!uploading && (
              <button type="button" className={`btn btn-small ${hasAddresses ? "btn-quiet" : "btn-primary"}`} onClick={() => setUploading(true)}>
                {hasAddresses ? t("Pakia ripoti mpya", "Load a newer report") : t("Pakia anwani", "Load addresses")}
              </button>
            )}
          </div>
          <dl className="stat-row">
            <div><dt>{t("Kata", "Wards")}</dt><dd>{n(c.areas.wards)}</dd></div>
            <div><dt>{t("Vijiji / mitaa", "Villages / streets")}</dt><dd>{n(c.areas.villages)}</dd></div>
            <div><dt>{t("Barabara na vitongoji", "Roads and hamlets")}</dt><dd>{n(c.areas.streets)}</dd></div>
            <div><dt>{t("Anwani (NaPA)", "Addresses (NaPA)")}</dt><dd>{c.addressImport ? n(c.addressImport.addresses) : "—"}</dd></div>
          </dl>
          <p className="muted small">
            {c.addressImport
              ? t(
                  `Ripoti ya NaPA${c.addressImport.reportDate ? ` ya ${c.addressImport.reportDate}` : ""}, ilipakiwa ${day(c.addressImport.importedAt)}. Kupakia ripoti mpya kunaongeza vilivyo vipya na kusasisha idadi; hakufuti chochote.`,
                  `NaPA report${c.addressImport.reportDate ? ` of ${c.addressImport.reportDate}` : ""}, loaded ${day(c.addressImport.importedAt)}. Loading a newer report adds what is new and updates counts; it deletes nothing.`,
                )
              : hasAddresses
                ? t("Maeneo yaliongezwa kwa mkono.", "Areas were added by hand.")
                : t("Bado hakuna anwani. Pakia ripoti ya NaPA ya halmashauri hii.", "No addresses yet. Load this council's NaPA report.")}
          </p>
          {uploading && <UploadForCouncil councilId={councilId} onClose={() => setUploading(false)} />}
          {c.wards.length > 0 && (
            <div className="ward-table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>{t("Kata", "Ward")}</th>
                    <th className="num">{t("Vijiji / mitaa", "Villages / streets")}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.wards.map((w) => (
                    <tr key={w._id}>
                      <td>{w.name}</td>
                      <td className="num">{n(w.villages)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="card span-2 card-danger">
          <div className="card-head">
            <div>
              <h2>{c.status === "active" ? t("Sitisha halmashauri", "Suspend the council") : t("Rejesha halmashauri", "Restore the council")}</h2>
              <p className="muted small">
                {c.status === "active"
                  ? t("Wanachama wote watazuiwa kutumia mfumo. Taarifa hazifutwi.", "Every member is blocked from the system. Nothing is deleted.")
                  : t("Wanachama wataweza kutumia mfumo tena.", "Members can use the system again.")}
              </p>
            </div>
            <button type="button" className={`btn btn-small ${c.status === "active" ? "btn-danger" : "btn-quiet"}`} onClick={() => void toggleStatus()}>
              {c.status === "active" ? t("Sitisha", "Suspend") : t("Rejesha", "Restore")}
            </button>
          </div>
        </article>
      </div>

      {editing && <EditCouncilDialog council={c} open={editing} onClose={() => setEditing(false)} />}
    </section>
  );
}

/* ---------- Danger zone: wipe the system ---------- */

const WIPE_TABLES: Record<string, [string, string]> = {
  media: ["Picha", "Photos"],
  records: ["Kumbukumbu za maafisa", "Officers' records"],
  submissions: ["Ripoti zilizotumwa", "Sent reports"],
  presets: ["Viwango na mipango", "Presets and plans"],
  councilPresets: ["Viwango vya halmashauri", "Council defaults"],
  memberships: ["Uanachama", "Memberships"],
  areas: ["Maeneo na anwani", "Areas and addresses"],
  councils: ["Halmashauri", "Councils"],
  auditLog: ["Kumbukumbu za matukio", "Activity log"],
  users: ["Akaunti (isipokuwa msimamizi)", "Accounts (except root)"],
};

function SystemWipe() {
  const t = useT();
  const status = useQuery(api.wipe.status, {});
  const start = useMutation(api.wipe.start);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!status) return null;
  const job = status.job;
  const running = job?.status === "running";
  const label = (k: string) => t(...(WIPE_TABLES[k] ?? [k, k]));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await start({ confirm: typed, client: hqClient });
      setOpen(false);
      setTyped("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card card-danger wipe-card">
      <div className="card-head">
        <div>
          <span className="eyebrow tone-danger">{t("Eneo la hatari", "Danger zone")}</span>
          <h2>{t("Futa mfumo wote", "Wipe the whole system")}</h2>
          <p className="muted small">
            {t(
              "Inafuta halmashauri zote pamoja na anwani, wanachama, kumbukumbu, ripoti, picha na akaunti zote isipokuwa za msimamizi wa mfumo. Haiwezi kurudishwa.",
              "Deletes every council with its addresses, members, records, reports, photos, and every account except the system administrators'. It cannot be undone.",
            )}
          </p>
        </div>
        <button type="button" className="btn btn-danger btn-small" disabled={!status.allowed || running} onClick={() => setOpen(true)}>
          {t("Futa mfumo…", "Wipe system…")}
        </button>
      </div>
      {!status.allowed && (
        <p className="small">
          {t("Imezimwa kwenye mazingira haya. Kuiwasha:", "Switched off on this deployment. To allow it:")} <code>npx convex env set ALLOW_WIPE true</code>
        </p>
      )}
      {job && (
        <div className={`notice ${job.status === "done" ? "notice-ok" : job.status === "running" ? "notice-wait" : "notice-danger"}`} role="status">
          <p>
            <strong>
              {job.status === "running"
                ? t(`Inafuta: ${label(job.table ?? "")}…`, `Wiping: ${label(job.table ?? "")}…`)
                : job.status === "done"
                  ? t(`Mfumo ulifutwa ${day(job.finishedAt ?? job.startedAt)}`, `System wiped ${day(job.finishedAt ?? job.startedAt)}`)
                  : t("Ufutaji ulisimamishwa", "The wipe was stopped")}
            </strong>
            {job.note ? ` ${job.note}` : ""}
          </p>
          <p className="small">
            {Object.entries(job.deleted)
              .filter(([, n]) => (n ?? 0) > 0)
              .map(([k, count]) => `${label(k)}: ${n(count ?? 0)}`)
              .join(" · ") || t("Bado hakuna kilichofutwa.", "Nothing deleted yet.")}
          </p>
        </div>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        title={t("Futa mfumo wote?", "Wipe the whole system?")}
        actions={
          <>
            <button type="button" className="btn btn-danger" disabled={busy || typed.trim() !== status.phrase} onClick={() => void submit()}>
              {busy ? t("Inaanza…", "Starting…") : t("Futa kila kitu", "Wipe everything")}
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setOpen(false)}>{t("Ghairi", "Cancel")}</button>
          </>
        }
      >
        <p>{t("Halmashauri zote na taarifa zake zitafutwa, na kila mtu isipokuwa msimamizi wa mfumo atahitaji kufungua akaunti upya.", "Every council and its data will be deleted, and everyone except the system administrator will need to create an account again.")}</p>
        <label className="field">
          <span>{t(`Andika “${status.phrase}” kuthibitisha`, `Type “${status.phrase}” to confirm`)}</span>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      </Dialog>
    </article>
  );
}

/* ---------- All councils ---------- */

export function Councils({ onOpen }: { onOpen: (councilId: Id<"councils">) => void }) {
  const t = useT();
  const councils = useQuery(api.councils.listAll, {});
  const [selected, setSelected] = useQueryState("halmashauri", parseAsString);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...(councils ?? [])].sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
    if (!q) return list;
    return list.filter((c) => [c.name, c.displayName ?? "", c.region, c.code].some((x) => x.toLowerCase().includes(q)));
  }, [councils, search]);

  if (selected) {
    return <CouncilDetail key={selected} councilId={selected as Id<"councils">} onBack={() => void setSelected(null)} onOpen={onOpen} />;
  }

  const totals = (councils ?? []).reduce(
    (acc, c) => ({
      active: acc.active + c.active,
      pending: acc.pending + c.pending,
      noAddresses: acc.noAddresses + (c.hasAddresses ? 0 : 1),
      noHead: acc.noHead + (c.head ? 0 : 1),
    }),
    { active: 0, pending: 0, noAddresses: 0, noHead: 0 },
  );

  return (
    <section className="hq-page council-page">
      <header className="page-head-row">
        <div>
          <h1>{t("Halmashauri", "Councils")}</h1>
          <p className="muted">{t("Halmashauri zote kwenye mfumo. Chagua moja kuona maelezo yake, msimbo na anwani.", "Every council in the system. Choose one to see its details, code and addresses.")}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>+ {t("Ongeza halmashauri", "Add council")}</button>
      </header>

      <div className="council-layout">
        <div className="council-main">
          {councils && councils.length > 0 && (
            <dl className="kpi-row">
              <div><dt>{t("Halmashauri", "Councils")}</dt><dd>{n(councils.length)}</dd></div>
              <div><dt>{t("Wanachama hai", "Active members")}</dt><dd>{n(totals.active)}</dd></div>
              <div className={totals.pending ? "is-wait" : undefined}><dt>{t("Maombi yanasubiri", "Requests waiting")}</dt><dd>{n(totals.pending)}</dd></div>
              <div className={totals.noAddresses ? "is-wait" : undefined}><dt>{t("Bila anwani", "Without addresses")}</dt><dd>{n(totals.noAddresses)}</dd></div>
              <div className={totals.noHead ? "is-wait" : undefined}><dt>{t("Bila Mkuu wa Idara", "Without a HoD")}</dt><dd>{n(totals.noHead)}</dd></div>
            </dl>
          )}

          {councils === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
          {councils?.length === 0 && (
            <div className="empty-card">
              <h2>{t("Bado hakuna halmashauri", "No councils yet")}</h2>
              <p className="muted">{t("Ongeza halmashauri ya kwanza, pakia anwani zake, kisha mpe Mkuu wa Idara msimbo.", "Add the first council, load its addresses, then give the Head of Department the code.")}</p>
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>{t("Ongeza halmashauri", "Add council")}</button>
            </div>
          )}

          {councils && councils.length > 0 && (
            <div className="table-card">
              <div className="table-tools">
                <input
                  className="input input-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Tafuta kwa jina, mkoa au msimbo", "Search by name, region or code")}
                  aria-label={t("Tafuta halmashauri", "Search councils")}
                />
              </div>
              <table className="table council-table">
                <thead>
                  <tr>
                    <th>{t("Halmashauri", "Council")}</th>
                    <th>{t("Msimbo", "Code")}</th>
                    <th>{t("Anwani", "Addresses")}</th>
                    <th>{t("Mkuu wa Idara", "Head of Dept.")}</th>
                    <th className="num">{t("Wanachama", "Members")}</th>
                    <th>{t("Hali", "Status")}</th>
                    <th aria-label={t("Fungua", "Open")} />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c._id} className="is-clickable" onClick={() => void setSelected(c._id)}>
                      <td>
                        <button type="button" className="row-title" onClick={(e) => { e.stopPropagation(); void setSelected(c._id); }}>
                          {c.displayName ?? c.name}
                        </button>
                        <div className="muted small">{c.displayName ? `${c.name} · ` : ""}{c.region}</div>
                      </td>
                      <td>
                        <span className="code-with-copy">
                          <span className="code-chip">{formatCouncilCode(c.code)}</span>
                          <CopyCode code={c.code} compact />
                        </span>
                      </td>
                      <td>
                        {c.addressImport ? (
                          <span className="small">{t(`Kata ${n(c.addressImport.wards)} · vijiji ${n(c.addressImport.villages)}`, `${n(c.addressImport.wards)} wards · ${n(c.addressImport.villages)} villages`)}</span>
                        ) : c.hasAddresses ? (
                          <span className="small">{t("Zimeongezwa kwa mkono", "Added by hand")}</span>
                        ) : (
                          <Pill tone="wait">{t("Hakuna anwani", "No addresses")}</Pill>
                        )}
                      </td>
                      <td>{c.head ? <span className="small">{c.head}</span> : <span className="muted small">{t("Hajawekwa", "Not seated")}</span>}</td>
                      <td className="num">
                        {n(c.active)}
                        {c.pending > 0 && (
                          <button
                            type="button"
                            className="badge inline"
                            title={t("Fungua maombi", "Open requests")}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpen(c._id);
                            }}
                          >
                            +{c.pending}
                          </button>
                        )}
                      </td>
                      <td>
                        {c.status !== "active" ? (
                          <Pill tone="danger">{t("Imesitishwa", "Suspended")}</Pill>
                        ) : !c.hasAddresses ? (
                          <Pill tone="wait">{t("Inasubiri anwani", "Needs addresses")}</Pill>
                        ) : c.registrationOpen ? (
                          <Pill tone="ok">{t("Usajili wazi", "Sign-up open")}</Pill>
                        ) : (
                          <Pill tone="muted">{t("Usajili umefungwa", "Sign-up closed")}</Pill>
                        )}
                      </td>
                      <td className="chev" aria-hidden>›</td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted">{t("Hakuna halmashauri inayolingana na utafutaji.", "No council matches the search.")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="council-aside">
          <SystemWipe />
        </aside>
      </div>

      <CreateCouncilDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => void setSelected(id)} />
    </section>
  );
}
