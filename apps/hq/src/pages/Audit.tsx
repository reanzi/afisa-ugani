import { useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import { SECTION_LABELS } from "@afisa/shared";
import { useHq } from "../context";
import { when } from "./common";

const ACTIONS: Record<string, string> = {
  "user.signUp": "Alifungua akaunti",
  "user.signIn": "Aliingia",
  "user.updateProfile": "Alibadili taarifa zake",
  "membership.request": "Aliomba kujiunga",
  "membership.reRequest": "Aliomba tena kujiunga",
  "membership.approve": "Aliidhinisha mwanachama",
  "membership.reject": "Alikataa ombi",
  "membership.suspend": "Alisitisha akaunti",
  "membership.reactivate": "Alirejesha akaunti",
  "membership.assignRole": "Alibadili cheo",
  "membership.grantSection": "Aliongeza sehemu",
  "membership.revokeSection": "Aliondoa sehemu",
  "membership.assignAreas": "Alipanga maeneo",
  "membership.seat": "Aliwekwa na mfumo",
  "area.create": "Aliongeza eneo",
  "area.rename": "Alibadili jina la eneo",
  "record.create": "Aliandika kumbukumbu",
  "record.update": "Alibadili kumbukumbu",
  "record.delete": "Alifuta kumbukumbu",
  "council.create": "Aliongeza halmashauri",
};

export function Audit() {
  const { councilId } = useHq();
  const rows = useQuery(api.auditLog.recent, { councilId, limit: 150 });

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>Kumbukumbu za matukio</h1>
        <p className="muted">Kila badiliko kwenye mfumo, nani alilifanya na lini. Kumbukumbu hizi haziwezi kubadilishwa wala kufutwa.</p>
      </header>
      {rows?.length === 0 && <p className="empty">Bado hakuna matukio.</p>}
      {rows && rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Lini</th>
              <th>Nani</th>
              <th>Tukio</th>
              <th>Sehemu</th>
              <th>Kupitia</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="small nowrap">
                  {when(r.receivedAt)}
                  {r.occurredAt < r.receivedAt - 5 * 60_000 && (
                    <div className="muted">Bila mtandao: {when(r.occurredAt)}</div>
                  )}
                </td>
                <td>{r.actorName}</td>
                <td>
                  {ACTIONS[r.action] ?? r.action}
                  {r.action === "membership.assignRole" && r.after && typeof r.after === "object" && "role" in r.after && (
                    <span className="muted"> ({String((r.after as { role: string }).role)})</span>
                  )}
                </td>
                <td>{r.section ? <span className={`sec sec-${r.section} sec-tag`}>{SECTION_LABELS[r.section].sw}</span> : null}</td>
                <td className="small">{r.app === "field" ? "Simu" : r.app === "hq" ? "Makao makuu" : "Mfumo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
