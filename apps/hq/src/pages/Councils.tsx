/** Root only: create councils and open or close them. */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import { errorMessage } from "@afisa/ui";
import { hqClient } from "../context";

export function Councils() {
  const councils = useQuery(api.councils.listAll, {});
  const create = useMutation(api.councils.create);
  const update = useMutation(api.councils.update);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [region, setRegion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({ name, code, region, registrationOpen: true, client: hqClient });
      setName("");
      setCode("");
      setRegion("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>Halmashauri</h1>
        <p className="muted">
          Kila halmashauri inapata msimbo. Mkuu wa Idara anafungua akaunti kwenye makao makuu, anaandika msimbo huu, na wewe unaidhinisha
          ombi lake kwenye Maombi ya halmashauri hiyo.
        </p>
      </header>

      <form className="council-form" onSubmit={submit}>
        <label className="field">
          <span>Jina</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Halmashauri ya Mji ya Bagamoyo" />
        </label>
        <label className="field">
          <span>Msimbo</span>
          <input className="input code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, "-"))} placeholder="BAGAMOYO-TC" />
        </label>
        <label className="field">
          <span>Mkoa</span>
          <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Pwani" />
        </label>
        <button className="btn btn-primary" disabled={busy || name.trim().length < 3 || code.trim().length < 3 || region.trim().length < 2}>
          Ongeza halmashauri
        </button>
        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      </form>

      {councils?.length === 0 && <p className="empty">Bado hakuna halmashauri. Ongeza ya kwanza hapo juu.</p>}
      {councils && councils.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Halmashauri</th>
              <th>Msimbo</th>
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
                <td><code className="council-code">{c.code}</code></td>
                <td>
                  {c.active}
                  {c.pending > 0 && <span className="badge inline">{c.pending} yanasubiri</span>}
                </td>
                <td>
                  <div className="state-cell">
                    <span className={c.registrationOpen ? "status status-active" : "status"}>{c.registrationOpen ? "Wazi" : "Imefungwa"}</span>
                    <button
                      className="btn btn-quiet btn-small"
                      onClick={() => void update({ councilId: c._id, registrationOpen: !c.registrationOpen, client: hqClient })}
                    >
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
