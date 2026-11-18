import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { HQ_ROLES, ROLE_LABELS, SECTIONS, SECTION_LABELS, type OfficerLevel, type Role, type Section } from "@afisa/shared";
import { errorMessage, Select } from "@afisa/ui";
import { clientMeta } from "../lib/client";

type Mode = "afisa" | "makao";

export function Join({ rejectedNote, defaultName }: { rejectedNote: string | null; defaultName: string | null }) {
  const councils = useQuery(api.councils.listOpen, {});
  const requestJoin = useMutation(api.memberships.requestJoin);
  const { signOut } = useAuthActions();

  const [mode, setMode] = useState<Mode>("afisa");
  const [name, setName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState("");
  const [councilId, setCouncilId] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [section, setSection] = useState<Section | null>(null);
  const [level, setLevel] = useState<OfficerLevel | null>(null);
  const [areaHint, setAreaHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeCouncil = useQuery(api.councils.lookupByCode, mode === "makao" && code.trim().length >= 3 ? { code } : "skip");
  const chosenCouncil = councilId || (councils?.length === 1 ? councils[0]!._id : "");
  const ready =
    name.trim().length >= 3 &&
    section !== null &&
    (mode === "afisa" ? Boolean(chosenCouncil) && level !== null : Boolean(codeCouncil) && role !== "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !section) return;
    setBusy(true);
    setError(null);
    try {
      await requestJoin({
        ...(mode === "afisa"
          ? { councilId: chosenCouncil as Id<"councils">, level: level ?? undefined, areaHint: areaHint.trim() || undefined }
          : { councilCode: code.trim(), requestedRole: role as Role }),
        name: name.trim(),
        phone: phone.trim() || undefined,
        primarySection: section,
        client: await clientMeta(),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page narrow">
      <h1 className="page-title">Omba kujiunga</h1>
      <p className="lead">
        {mode === "afisa"
          ? "Jaza taarifa hizi mara moja. Mkuu wa sehemu yako ataziona na kukuidhinisha."
          : "Kwa watumishi wa makao makuu ya idara. Utahitaji msimbo wa halmashauri."}
      </p>

      <div className="segmented" role="tablist" aria-label="Aina ya ombi">
        <button role="tab" aria-selected={mode === "afisa"} onClick={() => setMode("afisa")}>Afisa ugani</button>
        <button role="tab" aria-selected={mode === "makao"} onClick={() => setMode("makao")}>Nina msimbo wa halmashauri</button>
      </div>

      {rejectedNote && (
        <div className="notice notice-danger" role="status">
          <strong>Ombi lako la awali halikukubaliwa.</strong>
          <p>Sababu: {rejectedNote}</p>
        </div>
      )}

      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Jina kamili</span>
          <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Namba ya simu (si lazima)</span>
          <input className="input" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>

        {mode === "afisa" ? (
          <>
            {councils && councils.length > 1 && (
              <div className="field">
                <span className="field-label" id="council-label">Halmashauri</span>
                <Select
                  labelledBy="council-label"
                  label="Halmashauri"
                  value={councilId}
                  onChange={setCouncilId}
                  placeholder="Chagua halmashauri"
                  options={councils.map((c) => ({ value: c._id, label: c.name, hint: c.region }))}
                />
              </div>
            )}
            {councils && councils.length === 1 && (
              <p className="muted">Halmashauri: <strong>{councils[0]!.name}</strong></p>
            )}
            {councils && councils.length === 0 && (
              <div className="notice notice-wait"><p>Hakuna halmashauri inayopokea maombi ya maafisa kwa sasa.</p></div>
            )}
          </>
        ) : (
          <>
            <label className="field">
              <span>Msimbo wa halmashauri</span>
              <input className="input code-input" autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="mfano: BAGAMOYO-TC" />
              {code.trim().length >= 3 && codeCouncil === null && <small className="tone-danger">Msimbo huu haupo.</small>}
              {codeCouncil && <small className="tone-ok">{codeCouncil.name}, {codeCouncil.region}</small>}
            </label>
            <div className="field">
              <span className="field-label" id="role-label">Cheo chako</span>
              <Select
                labelledBy="role-label"
                label="Cheo chako"
                value={role}
                onChange={(v) => setRole(v as Role)}
                options={HQ_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r].sw }))}
              />
              <small>Mkuu wa Idara huidhinishwa na msimamizi wa mfumo; vyeo vingine huidhinishwa na Mkuu wa Idara.</small>
            </div>
          </>
        )}

        <fieldset className="field plain">
          <legend>{mode === "afisa" ? "Sehemu yako kuu" : "Sehemu yako"}</legend>
          <div className="chips">
            {SECTIONS.map((s) => (
              <button type="button" key={s} className={`chip sec sec-${s}`} aria-pressed={section === s} onClick={() => setSection(s)}>
                <span className="sec-tag" aria-hidden />
                {SECTION_LABELS[s].sw}
              </button>
            ))}
          </div>
          {mode === "afisa" && <small>Sehemu nyingine zinaweza kuongezwa baadaye na mkuu wa sehemu husika.</small>}
        </fieldset>

        {mode === "afisa" && (
          <>
            <fieldset className="field plain">
              <legend>Unafanya kazi ngazi gani?</legend>
              <div className="chips">
                <button type="button" className="chip" aria-pressed={level === "vaeo"} onClick={() => setLevel("vaeo")}>Kijiji (VAEO)</button>
                <button type="button" className="chip" aria-pressed={level === "waeo"} onClick={() => setLevel("waeo")}>Kata (WAEO)</button>
              </div>
            </fieldset>
            <label className="field">
              <span>Kijiji au kata unayofanyia kazi</span>
              <input className="input" placeholder="mfano: Kata ya Mzumbe, kijiji cha Changarawe" value={areaHint} onChange={(e) => setAreaHint(e.target.value)} />
            </label>
          </>
        )}

        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}

        <button className="btn btn-primary btn-block" disabled={!ready || busy}>
          {busy ? "Inatuma…" : "Tuma ombi"}
        </button>
        <button type="button" className="btn btn-quiet btn-block" onClick={() => void signOut()}>
          Toka
        </button>
      </form>
    </main>
  );
}
