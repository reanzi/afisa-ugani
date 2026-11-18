import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { SECTIONS, SECTION_LABELS, type OfficerLevel, type Section } from "@afisa/shared";
import { errorMessage } from "@afisa/ui";
import { clientMeta } from "../lib/client";

export function Join({ rejectedNote, defaultName }: { rejectedNote: string | null; defaultName: string | null }) {
  const councils = useQuery(api.councils.listOpen, {});
  const requestJoin = useMutation(api.memberships.requestJoin);
  const { signOut } = useAuthActions();

  const [name, setName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState("");
  const [councilId, setCouncilId] = useState("");
  const [section, setSection] = useState<Section | null>(null);
  const [level, setLevel] = useState<OfficerLevel | null>(null);
  const [areaHint, setAreaHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenCouncil = councilId || (councils?.length === 1 ? councils[0]!._id : "");
  const ready = name.trim().length >= 3 && chosenCouncil && section && level;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await requestJoin({
        councilId: chosenCouncil as Id<"councils">,
        name: name.trim(),
        phone: phone.trim() || undefined,
        primarySection: section,
        level,
        areaHint: areaHint.trim() || undefined,
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
      <p className="lead">Jaza taarifa hizi mara moja. Mkuu wa sehemu yako ataziona na kukuidhinisha.</p>

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

        {councils && councils.length > 1 && (
          <label className="field">
            <span>Halmashauri</span>
            <select className="select" value={councilId} onChange={(e) => setCouncilId(e.target.value)}>
              <option value="">Chagua halmashauri</option>
              {councils.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} — {c.region}
                </option>
              ))}
            </select>
          </label>
        )}
        {councils && councils.length === 1 && (
          <p className="muted">Halmashauri: <strong>{councils[0]!.name}</strong></p>
        )}
        {councils && councils.length === 0 && (
          <div className="notice notice-wait"><p>Hakuna halmashauri inayopokea maombi kwa sasa.</p></div>
        )}

        <fieldset className="field plain">
          <legend>Sehemu yako kuu</legend>
          <div className="chips">
            {SECTIONS.map((s) => (
              <button
                type="button"
                key={s}
                className={`chip sec sec-${s}`}
                aria-pressed={section === s}
                onClick={() => setSection(s)}
              >
                <span className="sec-tag" aria-hidden />
                {SECTION_LABELS[s].sw}
              </button>
            ))}
          </div>
          <small>Sehemu nyingine zinaweza kuongezwa baadaye na mkuu wa sehemu husika.</small>
        </fieldset>

        <fieldset className="field plain">
          <legend>Unafanya kazi ngazi gani?</legend>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={level === "vaeo"} onClick={() => setLevel("vaeo")}>
              Kijiji (VAEO)
            </button>
            <button type="button" className="chip" aria-pressed={level === "waeo"} onClick={() => setLevel("waeo")}>
              Kata (WAEO)
            </button>
          </div>
        </fieldset>

        <label className="field">
          <span>Kijiji au kata unayofanyia kazi</span>
          <input className="input" placeholder="mfano: Kata ya Mzumbe, kijiji cha Changarawe" value={areaHint} onChange={(e) => setAreaHint(e.target.value)} />
        </label>

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
