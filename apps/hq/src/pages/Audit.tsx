import { useQuery } from "convex/react";
import { api } from "@afisa/backend/api";
import { SECTION_LABELS } from "@afisa/shared";
import { useLabel, useT } from "@afisa/ui";
import { useHq } from "../context";
import { when } from "./common";

const ACTIONS: Record<string, [string, string]> = {
  "user.signUp": ["Alifungua akaunti", "Created an account"],
  "user.signIn": ["Aliingia", "Signed in"],
  "user.updateProfile": ["Alibadili taarifa zake", "Updated their details"],
  "membership.request": ["Aliomba kujiunga", "Asked to join"],
  "membership.reRequest": ["Aliomba tena kujiunga", "Asked to join again"],
  "membership.approve": ["Aliidhinisha mwanachama", "Approved a member"],
  "membership.reject": ["Alikataa ombi", "Declined a request"],
  "membership.suspend": ["Alisitisha akaunti", "Suspended an account"],
  "membership.reactivate": ["Alirejesha akaunti", "Restored an account"],
  "membership.assignRole": ["Alibadili cheo", "Changed a position"],
  "membership.grantSection": ["Aliongeza sehemu", "Added a section"],
  "membership.revokeSection": ["Aliondoa sehemu", "Removed a section"],
  "membership.assignAreas": ["Alipanga maeneo", "Assigned areas"],
  "membership.seat": ["Aliwekwa na mfumo", "Seated by the system"],
  "area.create": ["Aliongeza eneo", "Added an area"],
  "area.rename": ["Alibadili jina la eneo", "Renamed an area"],
  "record.create": ["Aliandika kumbukumbu", "Wrote a record"],
  "record.update": ["Alibadili kumbukumbu", "Changed a record"],
  "record.delete": ["Alifuta kumbukumbu", "Deleted a record"],
  "media.attach": ["Aliongeza picha", "Added a photo"],
  "preset.propose": ["Aliweka kiwango au mpango", "Set a preset or plan"],
  "preset.approve": ["Aliidhinisha kiwango au mpango", "Approved a preset or plan"],
  "preset.reject": ["Alikataa kiwango au mpango", "Refused a preset or plan"],
  "media.delete": ["Alifuta picha", "Deleted a photo"],
  "council.create": ["Aliongeza halmashauri", "Added a council"],
  "council.autoSend": ["Alibadili utumaji wa ripoti wenyewe", "Changed automatic sending"],
  "submission.create": ["Alituma ripoti", "Sent a report"],
  "submission.auto": ["Ripoti ilijituma", "A report sent itself"],
  "submission.reopen": ["Alirudisha ripoti kwa marekebisho", "Sent a report back for correction"],
  "submission.resubmit": ["Alituma ripoti iliyorekebishwa", "Sent a corrected report"],
};

export function Audit() {
  const t = useT();
  const label = useLabel();
  const { councilId } = useHq();
  const rows = useQuery(api.auditLog.recent, { councilId, limit: 150 });

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>{t("Kumbukumbu za matukio", "Activity log")}</h1>
        <p className="muted">
          {t(
            "Kila badiliko kwenye mfumo, nani alilifanya na lini. Kumbukumbu hizi haziwezi kubadilishwa wala kufutwa.",
            "Every change in the system, who made it and when. These entries cannot be changed or deleted.",
          )}
        </p>
      </header>
      {rows?.length === 0 && <p className="empty">{t("Bado hakuna matukio.", "Nothing yet.")}</p>}
      {rows && rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t("Lini", "When")}</th>
              <th>{t("Nani", "Who")}</th>
              <th>{t("Tukio", "What")}</th>
              <th>{t("Sehemu", "Section")}</th>
              <th>{t("Kupitia", "From")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const a = ACTIONS[r.action];
              return (
                <tr key={r._id}>
                  <td className="small nowrap">
                    {when(r.receivedAt)}
                    {r.occurredAt < r.receivedAt - 5 * 60_000 && (
                      <div className="muted">{t("Bila mtandao:", "Offline at:")} {when(r.occurredAt)}</div>
                    )}
                  </td>
                  <td>{r.actorName}</td>
                  <td>
                    {a ? t(a[0], a[1]) : r.action}
                    {r.action === "membership.assignRole" && r.after && typeof r.after === "object" && "role" in r.after && (
                      <span className="muted"> ({String((r.after as { role: string }).role)})</span>
                    )}
                  </td>
                  <td>{r.section ? <span className={`sec sec-${r.section} sec-tag`}>{label(SECTION_LABELS[r.section])}</span> : null}</td>
                  <td className="small">{r.app === "field" ? t("Simu", "Phone") : r.app === "hq" ? t("Makao makuu", "Head office") : t("Mfumo", "System")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
