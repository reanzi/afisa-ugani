import { Link } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { actionsFor, SECTION_LABELS } from "@afisa/shared";
import { dayTitle } from "@afisa/ui";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { useMyAreas } from "../lib/areas";
import { EntryRow } from "./EntryRow";

export function Today() {
  const { me, councilId, sections, membership } = useWork();
  const { byId } = useMyAreas();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const entries = useLiveQuery(
    () =>
      db.records
        .where("[councilId+occurredAt]")
        .between([councilId, start], [councilId, start + 86_400_000], true, false)
        .filter((r) => !r.deletedAt && r.type !== "monthly_review")
        .reverse()
        .toArray(),
    [councilId, start],
  );
  const actions = actionsFor(sections);
  const ready = actions.filter((a) => a.ready);
  const soon = actions.filter((a) => !a.ready);
  const firstName = me.name?.split(" ")[0];

  return (
    <main className="page">
      <header className="today-head">
        <h1 className="day-title">{dayTitle(now)}</h1>
        <p className="muted">
          {firstName ? `Karibu ${firstName}. ` : ""}
          {membership.councilName}
        </p>
        <p className="sec-list">
          {sections.map((s) => (
            <span key={s} className={`sec sec-${s} sec-tag`}>{SECTION_LABELS[s].sw}</span>
          ))}
        </p>
      </header>

      <section aria-labelledby="andika">
        <h2 id="andika" className="section-title">Andika</h2>
        <ul className="action-grid">
          {ready.map((a) => {
            const only = a.sections.length === 1 ? a.sections[0] : undefined;
            return (
              <li key={a.type}>
                <Link
                  to={`/andika/${a.type}`}
                  className={`action-tile sec ${only ? `sec-${only}` : ""} ${a.type === "activity" ? "is-general" : ""}`}
                >
                  <span className="action-label">{a.label}</span>
                  <span className="action-hint">{a.hint}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {soon.length > 0 && (
          <div className="soon">
            <p>Zinakuja hivi karibuni</p>
            <ul>
              {soon.map((a) => (
                <li key={a.type} className={`sec ${a.sections.length === 1 ? `sec-${a.sections[0]}` : ""}`}>{a.label}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="leo">
        <h2 id="leo" className="section-title">
          Kazi za leo {entries && entries.length > 0 ? <span className="count">{entries.length}</span> : null}
        </h2>
        {entries && entries.length === 0 && (
          <p className="empty">Bado hujaandika chochote leo. Chagua kazi hapo juu ukimaliza kila shughuli.</p>
        )}
        <ul className="entry-list">
          {entries?.map((r) => (
            <EntryRow key={r.clientId} record={r} areaName={r.areaId ? byId.get(r.areaId)?.name : undefined} />
          ))}
        </ul>
      </section>
    </main>
  );
}
