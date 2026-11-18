import { useState } from "react";
import { Link } from "react-router";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useLiveQuery } from "dexie-react-hooks";
import { actionsFor, financialYear, monthKey, monthLabel, monthStats, parseMonth, parsePlanKey, planKey, presetLabel, SECTION_LABELS, SECTIONS, specFor, type Reminder, type Section } from "@afisa/shared";
import { dayTitle, relativeWhen } from "@afisa/ui";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { useMyAreas } from "../lib/areas";
import { useHomeData } from "../lib/home";
import { useFoodState, useOpenFoodPeriod, useReopened } from "../lib/food";
import { EntryRow } from "./EntryRow";
import { usePhotoCounts } from "../lib/photos";
import { usePresetRows } from "../lib/presets";
import { RecordIcon, SectionIcon } from "./recordIcons";

const DISMISS_KEY = "afisa.dismissed";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function Reminders({ items }: { items: Reminder[] }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const shown = items.filter((r) => !dismissed.includes(r.id));
  if (shown.length === 0) return null;
  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-30);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };
  return (
    <section className="reminders" aria-label="Vikumbusho">
      {shown.map((r) => (
        <div key={r.id} className={`reminder tone-${r.tone}`}>
          <p>{r.text}</p>
          <div className="reminder-actions">
            {r.action && <Link to={r.action.to} className="btn btn-small btn-primary">{r.action.label}</Link>}
            {r.id !== "rejected" && (
              <button type="button" className="link" onClick={() => dismiss(r.id)}>Sawa</button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function ActionGrid({ section }: { section: Section }) {
  const actions = actionsFor([section]);
  const ready = actions.filter((a) => a.ready);
  const soon = actions.filter((a) => !a.ready);
  return (
    <>
      <ul className="action-grid">
        {ready.map((a) => (
          <li key={a.type}>
            <Link
              to={`/andika/${a.type}?sehemu=${section}`}
              className={`action-tile sec sec-${a.sections.length === 1 ? a.sections[0] : section} ${a.type === "activity" ? "is-general" : ""}`}
            >
              <span className="action-icon"><RecordIcon type={a.type} /></span>
              <span className="action-label">{a.label}</span>
              <span className="action-hint">{a.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
      {soon.length > 0 && (
        <p className="soon-line">
          Inakuja hivi karibuni: {soon.map((a) => a.label).join(", ")}.
        </p>
      )}
    </>
  );
}

/**
 * The year's production plan: asked for from July until it is sent, and any
 * plan or preset a section lead refused, with the reason.
 */
function PlanNotices() {
  const { councilId, sections, membership } = useWork();
  const rows = usePresetRows(councilId);
  if (!rows) return null;
  const month = monthKey(new Date());
  const fy = financialYear(month);
  const refused = rows.filter((r) => r.status === "rejected" && r.syncState !== "pending");
  const startOfYear = parseMonth(month).month >= 7 && parseMonth(month).month <= 9;
  const section = sections.includes(membership.primarySection) ? membership.primarySection : sections[0]!;
  const noPlan = startOfYear && !rows.some((r) => r.key === planKey(fy, section));
  if (!noPlan && refused.length === 0) return null;
  return (
    <section className="reminders" aria-label="Mpango na viwango">
      {noPlan && (
        <div className="reminder">
          <p>
            <strong>Weka mpango wa uzalishaji wa {fy}.</strong> Eneo la kila zao na malengo ya mwaka; ukishaidhinishwa, ripoti zako zitaonyesha utekelezaji.
          </p>
          <div className="reminder-actions">
            <Link to={`/malengo?mwaka=${fy}`} className="btn btn-small btn-primary">Weka mpango</Link>
          </div>
        </div>
      )}
      {refused.map((r) => (
        <div key={r.id} className="reminder tone-danger">
          <p>
            <strong>{presetLabel(r.key)}: imekataliwa.</strong> {r.note ? `“${r.note}”` : ""}
          </p>
          <div className="reminder-actions">
            <Link to={parsePlanKey(r.key) ? `/malengo?mwaka=${parsePlanKey(r.key)!.fy}&sehemu=${r.section}` : "/malengo"} className="btn btn-small btn-primary">
              Rekebisha
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}

/** Reports a section lead sent back: they come first, with the note. */
function Corrections() {
  const reopened = useReopened();
  if (!reopened || reopened.length === 0) return null;
  return (
    <section className="reminders" aria-label="Ripoti za kurekebisha">
      {reopened.map((s) => (
        <div key={s.clientId} className="reminder tone-danger">
          <p>
            <strong>
              {s.kind === "food_prices" ? "Ripoti ya chakula" : "Ripoti ya mwezi"} ya {monthLabel(s.period)} imerudishwa kwa marekebisho.
            </strong>{" "}
            {s.reopened?.byName ? `${s.reopened.byName}: ` : ""}“{s.reopened?.note}”
          </p>
          <div className="reminder-actions">
            <Link
              to={s.kind === "food_prices" ? `/ripoti?aina=chakula&kipindi=${s.period}` : `/ripoti?mwezi=${s.period}`}
              className="btn btn-small btn-primary"
            >
              Rekebisha
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}

/** Food prices: always one tap away; from the 20th it turns into the ready report. */
function FoodCard() {
  const period = useOpenFoodPeriod();
  const state = useFoodState(period);
  if (!state) return <div className="food-card is-loading" aria-hidden />;
  const n = state.entries.length;
  // A report sent back for correction has its own notice above; keep this card plain.
  const ready = state.ready && !state.sealed && !state.reopened && n > 0;
  return (
    <Link to={ready ? "/ripoti?aina=chakula" : "/bei"} className={`food-card${ready ? " is-ready" : ""}`}>
      <span className="food-card-icon"><RecordIcon type="price" size={24} /></span>
      <span className="food-card-text">
        <strong>{ready ? "Ripoti yako ya chakula iko tayari" : "Bei za vyakula"}</strong>
        <small>
          {ready
            ? `Kagua bei ${n} kisha uitume kabla ya tarehe 22`
            : n > 0
              ? `Bei ${n} kwa ripoti ya ${state.cycle.label}`
              : "Andika bei za sokoni na dukani"}
        </small>
      </span>
      <span className="food-card-go" aria-hidden>
        {ready ? (
          <svg viewBox="0 0 20 20" width="20" height="20"><path d="M7.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          "+"
        )}
      </span>
    </Link>
  );
}

export function Today() {
  const { me, councilId, sections, membership } = useWork();
  const { byId } = useMyAreas();
  const photoCounts = usePhotoCounts();
  const home = useHomeData();
  const multi = sections.length > 1;
  const [chosen, setChosen] = useQueryState("sehemu", parseAsStringLiteral(SECTIONS).withOptions({ history: "push" }));
  const active: Section | null = multi ? (chosen && sections.includes(chosen) ? chosen : null) : sections[0]!;

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
  const todayBySection = (s: Section) => entries?.filter((e) => e.section === s).length ?? 0;
  const stats = home ? monthStats(home.monthRecords, sections) : [];
  const firstName = me.name?.split(" ")[0];

  return (
    <main className="page today">
      <header className="today-head">
        <h1 className="day-title">{dayTitle(now)}</h1>
        <p className="muted">
          {firstName ? `Karibu ${firstName}. ` : ""}
          {membership.councilName}
        </p>
      </header>

      <Corrections />
      <PlanNotices />
      {home && <Reminders items={home.reminders} />}

      <FoodCard />

      <section aria-labelledby="andika" className="andika">
        {active === null ? (
          <>
            <h2 id="andika" className="section-title">Andika kazi ya sehemu gani?</h2>
            <ul className="section-picker">
              {sections.map((s) => (
                <li key={s}>
                  <button type="button" className={`section-card sec sec-${s}`} onClick={() => void setChosen(s)}>
                    <span className="section-card-icon"><SectionIcon section={s} size={28} /></span>
                    <span className="section-card-name">{SECTION_LABELS[s].sw}</span>
                    <span className="section-card-meta">
                      {todayBySection(s) > 0 ? `Leo ${todayBySection(s)}` : `Vitendo ${actionsFor([s]).filter((a) => a.ready).length}`}
                    </span>
                    <svg className="section-card-go" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                      <path d="M7.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="andika-head">
              {multi ? (
                <>
                  <button type="button" className="back-chip" onClick={() => void setChosen(null)} aria-label="Rudi kwenye sehemu zote">
                    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                      <path d="M12.5 5l-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Sehemu
                  </button>
                  <h2 id="andika" className={`section-title sec sec-${active}`}>
                    <span className="sec-tag" aria-hidden />
                    {SECTION_LABELS[active].sw}
                  </h2>
                </>
              ) : (
                <h2 id="andika" className="section-title">Andika</h2>
              )}
            </div>
            <ActionGrid section={active} />
          </>
        )}
      </section>

      {home && home.recent.length > 0 && (
        <section aria-labelledby="rudia">
          <h2 id="rudia" className="section-title">Ulizoandika karibuni</h2>
          <ul className="recent-list">
            {home.recent.map((k) => (
              <li key={`${k.type}:${k.section}`}>
                <Link to={`/andika/${k.type}?sehemu=${k.section}`} className={`recent sec sec-${k.section}`}>
                  <span className="recent-icon"><RecordIcon type={k.type} size={20} /></span>
                  <span className="recent-text">
                    <strong>{specFor(k.type)?.label}</strong>
                    <small>{multi ? `${SECTION_LABELS[k.section].sw}, ` : ""}mara ya mwisho {relativeWhen(k.at)}</small>
                  </span>
                  <span className="recent-add" aria-hidden>+</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.length > 1 && (
        <section aria-labelledby="mwezi" className="month-stats">
          <div className="month-stats-head">
            <h2 id="mwezi" className="section-title">Mwezi huu</h2>
            <Link to="/ripoti" className="link">Ona ripoti</Link>
          </div>
          <dl className="stats">
            {stats.map((s) => (
              <div key={s.id} className={s.section ? `stat sec sec-${s.section}` : "stat"}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-labelledby="leo">
        <h2 id="leo" className="section-title">
          Kazi za leo {entries && entries.length > 0 ? <span className="count">{entries.length}</span> : null}
        </h2>
        {entries && entries.length === 0 && (
          <p className="empty">Bado hujaandika chochote leo. Ukimaliza kila shughuli, iandike hapa.</p>
        )}
        <ul className="entry-list">
          {entries?.map((r) => (
            <EntryRow key={r.clientId} record={r} areaName={r.areaId ? byId.get(r.areaId)?.name : undefined} photos={photoCounts?.get(r.clientId)} />
          ))}
        </ul>
      </section>
    </main>
  );
}
