import { Fragment, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@afisa/backend/api";
import { presentName, SECTION_LABELS } from "@afisa/shared";
import { useLabel, useT, longDate } from "@afisa/ui";
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
  "council.update": ["Alibadili taarifa za halmashauri", "Changed council details"],
  "council.displayName": ["Alibadili jina fupi la halmashauri", "Changed the council's short name"],
  "council.regenerateCode": ["Alitoa msimbo mpya wa halmashauri", "Issued a new council code"],
  "council.addressImport": ["Alimaliza kupakia anwani za NaPA", "Finished loading NaPA addresses"],
  "council.preset": ["Aliweka kiwango cha halmashauri", "Set a council default"],
  "area.importNapa": ["Alipakia anwani za kata (NaPA)", "Loaded a ward's addresses (NaPA)"],
  "area.bulkAdd": ["Aliongeza maeneo kwa pamoja", "Added areas in bulk"],
  "user.acceptPolicy": ["Alikubali sera ya matumizi", "Accepted the usage policy"],
  "user.makeRoot": ["Alifanywa msimamizi wa mfumo", "Was made system administrator"],
  "system.wipe": ["Mfumo wote ulifutwa", "The whole system was wiped"],
  "settings.minClientVersion": ["Alibadili toleo la chini la programu", "Changed the minimum app version"],
  "council.autoSend": ["Alibadili utumaji wa ripoti wenyewe", "Changed automatic sending"],
  "submission.create": ["Alituma ripoti", "Sent a report"],
  "submission.auto": ["Ripoti ilijituma", "A report sent itself"],
  "submission.reopen": ["Alirudisha ripoti kwa marekebisho", "Sent a report back for correction"],
  "submission.resubmit": ["Alituma ripoti iliyorekebishwa", "Sent a corrected report"],
};

type Row = NonNullable<FunctionReturnType<typeof api.auditLog.recent>>[number];

/** Runs of the same action by the same person, close together, shown as one line. */
type Group = { key: string; rows: Row[] };
const BURST_MS = 15 * 60_000;

function groupRows(rows: Row[]): Group[] {
  const out: Group[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    const head = last?.rows[last.rows.length - 1];
    if (
      last &&
      head &&
      head.action === r.action &&
      head.actorName === r.actorName &&
      head.app === r.app &&
      head.section === r.section &&
      head.receivedAt - r.receivedAt <= BURST_MS &&
      dayKey(head.receivedAt) === dayKey(r.receivedAt)
    ) {
      last.rows.push(r);
    } else {
      out.push({ key: r._id, rows: [r] });
    }
  }
  return out;
}

const dayKey = (ms: number) => new Date(ms).toDateString();
const time = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** A short detail for one entry, when its data has one worth showing. */
function detailOf(r: Row): string | null {
  const after = (r.after ?? {}) as Record<string, unknown>;
  if (r.action === "area.importNapa" && typeof after.ward === "string") return presentName(after.ward);
  if (r.action === "area.create" || r.action === "area.rename") return typeof after.name === "string" ? presentName(after.name) : null;
  if (r.action === "membership.assignRole" && typeof after.role === "string") return after.role;
  if (r.action === "council.addressImport" && typeof after.wards === "number") return `${after.wards} / ${after.villages ?? "?"}`;
  return null;
}

export function Audit() {
  const t = useT();
  const label = useLabel();
  const { councilId } = useHq();
  const rows = useQuery(api.auditLog.recent, { councilId, limit: 300 });
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupRows(rows ?? []), [rows]);
  const dayLabel = (ms: number) => {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (dayKey(ms) === today.toDateString()) return t("Leo", "Today");
    if (dayKey(ms) === yesterday.toDateString()) return t("Jana", "Yesterday");
    return longDate(ms);
  };
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const from = (app: string | null) => (app === "field" ? t("Simu", "Phone") : app === "hq" ? t("Makao makuu", "Head office") : t("Mfumo", "System"));

  return (
    <section className="hq-page">
      <header className="hq-page-head">
        <h1>{t("Kumbukumbu za matukio", "Activity log")}</h1>
        <p className="muted">
          {t(
            "Kila badiliko kwenye mfumo, nani alilifanya na lini. Matukio yanayojirudia kwa mfululizo yamekusanywa pamoja; bofya kuyaona yote.",
            "Every change in the system, who made it and when. Repeated actions in a row are grouped; click to see each one.",
          )}
        </p>
      </header>
      {rows === undefined && <p className="muted">{t("Inapakia…", "Loading…")}</p>}
      {rows?.length === 0 && <p className="empty">{t("Bado hakuna matukio.", "Nothing yet.")}</p>}
      {groups.length > 0 && (
        <div className="table-card">
          <table className="table audit-table">
            <thead>
              <tr>
                <th className="audit-time">{t("Saa", "Time")}</th>
                <th>{t("Tukio", "What")}</th>
                <th>{t("Nani", "Who")}</th>
                <th>{t("Sehemu", "Section")}</th>
                <th>{t("Kupitia", "From")}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => {
                const first = g.rows[0]!;
                const last = g.rows[g.rows.length - 1]!;
                const a = ACTIONS[first.action];
                const what = a ? t(a[0], a[1]) : first.action;
                const many = g.rows.length > 1;
                const expanded = open.has(g.key);
                const newDay = i === 0 || dayKey(groups[i - 1]!.rows[0]!.receivedAt) !== dayKey(first.receivedAt);
                const single = detailOf(first);
                return (
                  <Fragment key={g.key}>
                    {newDay && (
                      <tr className="audit-day">
                        <th colSpan={5} scope="rowgroup">{dayLabel(first.receivedAt)}</th>
                      </tr>
                    )}
                    <tr className={many ? "audit-group" : undefined}>
                      <td className="audit-time">
                        {many && time(last.receivedAt) !== time(first.receivedAt) ? `${time(last.receivedAt)}–${time(first.receivedAt)}` : time(first.receivedAt)}
                        {first.occurredAt < first.receivedAt - 5 * 60_000 && (
                          <div className="muted small">{t("Bila mtandao:", "Offline at:")} {when(first.occurredAt)}</div>
                        )}
                      </td>
                      <td>
                        {many ? (
                          <button type="button" className="audit-toggle" aria-expanded={expanded} onClick={() => toggle(g.key)}>
                            <span className="audit-chev" aria-hidden>{expanded ? "▾" : "▸"}</span>
                            {what}
                            <span className="audit-count">×{g.rows.length}</span>
                          </button>
                        ) : (
                          <>
                            {what}
                            {single && <span className="muted"> · {single}</span>}
                          </>
                        )}
                      </td>
                      <td>{first.actorName}</td>
                      <td>{first.section ? <span className={`sec sec-${first.section} sec-tag`}>{label(SECTION_LABELS[first.section])}</span> : null}</td>
                      <td className="muted">{from(first.app)}</td>
                    </tr>
                    {many && expanded && (
                      <tr className="audit-detail">
                        <td />
                        <td colSpan={4}>
                          <ul>
                            {g.rows.map((r) => (
                              <li key={r._id}>
                                <span className="audit-time">{time(r.receivedAt)}</span>
                                <span>{detailOf(r) ?? what}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
