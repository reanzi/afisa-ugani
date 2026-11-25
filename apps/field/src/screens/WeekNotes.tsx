/**
 * The officer's week-end notes for one section: events, work done (drafted
 * from the week's records), achievements and challenges. Saved as a
 * "weekly_review" record, so it syncs like any other record.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  describeWork,
  isReviewType,
  labelOf,
  PAYLOAD_VERSION,
  RAIN_LEVELS,
  SECTION_LABELS,
  suggestRainLevel,
  validatePayload,
  weekLabel,
  weekRange,
  weeklyKind,
  type TextBlock,
  type WeeklyReview,
} from "@afisa/shared";
import { useLabel, useT } from "@afisa/ui";
import { db } from "../lib/db";
import { useWork } from "../lib/session";
import { requestSync } from "../lib/sync";
import { useSealed } from "../lib/food";
import { useWeekParams, useWeeklyReport, weekNotesClientId } from "../lib/weekly";

export function WeekNotes() {
  const t = useT();
  const label = useLabel();
  const navigate = useNavigate();
  const { me, councilId } = useWork();
  const { week, section } = useWeekParams();
  const { report, notes, records } = useWeeklyReport(section, week);
  const sealed = useSealed(section ? weeklyKind(section) : "weekly_kilimo")?.get(week) ?? null;

  const [loaded, setLoaded] = useState(false);
  const [rainLevel, setRainLevel] = useState("");
  const [events, setEvents] = useState("");
  const [work, setWork] = useState("");
  const [achievements, setAchievements] = useState("");
  const [challenges, setChallenges] = useState("");
  const [saving, setSaving] = useState(false);

  const live = useMemo(() => (records ?? []).filter((r) => !r.deletedAt && !isReviewType(r.type)), [records]);
  const own = useMemo(() => live.filter((r) => r.section === section), [live, section]);
  const rainDays = useMemo(() => new Set(live.filter((r) => r.type === "rainfall").map((r) => new Date(r.occurredAt).toDateString())).size, [live]);
  const suggestion = suggestRainLevel(rainDays, 7);
  const back = `/ripoti?aina=wiki&wiki=${week}${section ? `&sehemu=${section}` : ""}`;

  // Fill the form once: from the saved notes, or with drafts made from the week's records.
  useEffect(() => {
    if (loaded || !report || records === undefined) return;
    const textOf = (id: string) => (report.parts.flatMap((p) => p.blocks).find((b) => b.id === id) as TextBlock | undefined)?.text ?? "";
    setRainLevel(notes?.rainLevel ?? "");
    setEvents(notes?.events ?? textOf("1.1b"));
    setWork(notes?.work ?? describeWork(own));
    setAchievements(notes?.achievements ?? "");
    setChallenges(notes?.challenges ?? "");
    setLoaded(true);
  }, [loaded, report, records, notes, own]);

  if (!section) return <main className="page narrow"><p className="empty">{t("Ripoti za wiki ni za sehemu za mifugo na kilimo.", "Weekly reports are for the livestock and crops sections.")}</p></main>;

  const save = async () => {
    setSaving(true);
    const payload: WeeklyReview = {
      week,
      section,
      rainLevel: rainLevel || undefined,
      events: events.trim(),
      work: work.trim(),
      achievements: achievements.trim(),
      challenges: challenges.trim(),
    };
    const clean = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    if (validatePayload("weekly_review", clean)) {
      setSaving(false);
      return;
    }
    const now = Date.now();
    const { start, end } = weekRange(week);
    await db.records.put({
      clientId: weekNotesClientId(me.userId, councilId, section, week),
      councilId,
      type: "weekly_review",
      section,
      occurredAt: Math.max(start, Math.min(now, end - 1)),
      payload: clean,
      payloadVersion: PAYLOAD_VERSION,
      clientUpdatedAt: now,
      syncState: "pending",
    });
    requestSync();
    navigate(back, { replace: true });
  };

  if (!loaded) return <main className="page narrow"><p className="muted">{t("Inafungua…", "Opening…")}</p></main>;

  const sectionName = label(SECTION_LABELS[section]);
  return (
    <main className="page narrow">
      <Link to={back} className="back">{t("Rudi kwenye ripoti", "Back to the report")}</Link>
      <h1 className="page-title">{t(`Maelezo ya wiki: ${sectionName}`, `Week notes: ${sectionName}`)}</h1>
      <p className="lead">{weekLabel(week)}</p>
      {sealed && (
        <div className="seal" role="status">
          <strong>{t("Ripoti ya wiki hii imeshatumwa", "This week's report has been sent")}</strong>
          <span>{t("Maelezo haya yamefungwa pamoja nayo. Unaweza kuyasoma tu.", "These notes were locked with it. You can only read them.")}</span>
        </div>
      )}
      <fieldset className="plain review-lock" disabled={Boolean(sealed)}>
        <section className="stack review-block">
          <fieldset className="field plain">
            <legend>{t("Mvua ya wiki hii ilikuwaje?", "How was the rainfall this week?")}</legend>
            <div className="chips">
              {RAIN_LEVELS.map((o) => (
                <button key={o.value} type="button" className="chip" aria-pressed={rainLevel === o.value} onClick={() => setRainLevel(rainLevel === o.value ? "" : o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
            <small>
              {t(
                `Siku ${rainDays} za mvua zimeandikwa. Pendekezo: ${labelOf(RAIN_LEVELS, suggestion).toLowerCase()}. Usipochagua, pendekezo litatumika.`,
                `${rainDays} rain days recorded. Suggestion: ${labelOf(RAIN_LEVELS, suggestion).toLowerCase()}. If you don't choose, the suggestion is used.`,
              )}
            </small>
          </fieldset>
          <label className="field">
            <span>{t("Matukio muhimu", "Key events")}</span>
            <textarea className="textarea" value={events} onChange={(e) => setEvents(e.target.value)} placeholder={t("Milipuko ya magonjwa, ukame, mafuriko, migogoro…", "Disease outbreaks, drought, floods, conflicts…")} />
          </label>
          <label className="field">
            <span>{t("Kazi zilizofanyika", "Work done")}</span>
            <textarea className="textarea tall" value={work} onChange={(e) => setWork(e.target.value)} />
            <small>{t("Imetungwa kutoka kumbukumbu zako za wiki. Ongeza au rekebisha.", "Drafted from your records this week. Add to it or correct it.")}</small>
          </label>
          <label className="field">
            <span>{t("Mafanikio", "Achievements")}</span>
            <textarea className="textarea" value={achievements} onChange={(e) => setAchievements(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("Changamoto na matatizo", "Challenges and problems")}</span>
            <textarea className="textarea" value={challenges} onChange={(e) => setChallenges(e.target.value)} />
          </label>
        </section>
        {!sealed && (
          <button className="btn btn-primary btn-block" disabled={saving} onClick={() => void save()}>
            {saving ? t("Inahifadhi…", "Saving…") : t("Hifadhi maelezo", "Save notes")}
          </button>
        )}
      </fieldset>
    </main>
  );
}
