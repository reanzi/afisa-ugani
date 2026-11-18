import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { SECTION_LABELS, type Section, type Target } from "@afisa/shared";
import { Dialog, errorMessage, getLang, IconReturn, locale, useLabel, useT } from "@afisa/ui";
import { hqClient, useHq } from "../context";

export type MemberRow = FunctionReturnType<typeof api.memberships.listForHq>[number];

export const toTarget = (m: MemberRow): Target => ({
  userId: m.userId,
  role: m.role,
  status: m.status,
  primarySection: m.primarySection,
  sections: m.sections,
});

export function SectionTags({ sections, primary }: { sections: readonly Section[]; primary?: Section }) {
  const t = useT();
  const label = useLabel();
  return (
    <span className="tags">
      {sections.map((s) => (
        <span key={s} className={`sec sec-${s} sec-tag`} title={s === primary ? t("Sehemu kuu", "Main section") : undefined}>
          {label(SECTION_LABELS[s])}
          {s === primary && sections.length > 1 ? t(" (kuu)", " (main)") : ""}
        </span>
      ))}
    </span>
  );
}

export function useAreas() {
  const { councilId } = useHq();
  return useQuery(api.areas.list, { councilId });
}

/** Wards with their villages as checkboxes. Ticking a ward covers all its villages. */
export function AreaPicker({ value, onChange }: { value: Id<"areas">[]; onChange: (next: Id<"areas">[]) => void }) {
  const t = useT();
  const areas = useAreas();
  if (!areas) return <p className="muted">{t("Inapakia maeneo…", "Loading areas…")}</p>;
  const wards = areas.filter((a) => a.kind === "ward");
  if (wards.length === 0) return <p className="muted">{t("Hakuna maeneo bado. Ongeza kata na vijiji kwenye ukurasa wa Maeneo.", "No areas yet. Add wards and villages on the Areas page.")}</p>;
  const set = new Set(value);
  const toggle = (id: Id<"areas">) => onChange(set.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="area-picker">
      {wards.map((w) => {
        const wardOn = set.has(w._id);
        return (
          <fieldset key={w._id} className="area-ward">
            <label className="check strong">
              <input type="checkbox" checked={wardOn} onChange={() => toggle(w._id)} />
              {t(`Kata ya ${w.name} (yote)`, `${w.name} ward (all)`)}
            </label>
            <div className="area-villages">
              {areas
                .filter((v) => v.parentId === w._id)
                .map((v) => (
                  <label key={v._id} className="check">
                    <input type="checkbox" checked={wardOn || set.has(v._id)} disabled={wardOn} onChange={() => toggle(v._id)} />
                    {v.name}
                  </label>
                ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function areaNames(ids: readonly string[], areas: { _id: string; name: string; kind: string }[] | undefined): string {
  if (!areas) return "";
  const en = getLang() === "en";
  return ids
    .map((id) => areas.find((a) => a._id === id))
    .filter((a) => a !== undefined)
    .map((a) => (a.kind === "ward" ? (en ? `${a.name} ward` : `Kata ya ${a.name}`) : a.name))
    .join(", ");
}

export function when(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(locale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type ReportRow = { auto: boolean; late: boolean; revision: number; reopened: { byName: string; note: string } | null };

/** Sent by itself, late, corrected, or out for correction: next to a sent report. */
export function SendTags({ r }: { r: ReportRow }) {
  const t = useT();
  if (!r.auto && !r.late && r.revision < 2 && !r.reopened) return null;
  return (
    <span className="send-tags">
      {r.reopened && <span className="send-tag is-reopened">{t("Inarekebishwa", "Being corrected")}</span>}
      {r.revision > 1 && <span className="send-tag">{t(`Imerekebishwa (toleo la ${r.revision})`, `Corrected (version ${r.revision})`)}</span>}
      {r.auto && <span className="send-tag">{t("Ilitumwa yenyewe", "Sent automatically")}</span>}
      {r.late && <span className="send-tag is-late">{t("Imechelewa", "Late")}</span>}
    </span>
  );
}

/**
 * Send a report back to its officer with a note saying what to correct. Shown
 * to the report's section leads and the department only (the server checks).
 */
export function ReopenReport({ id, officer, canReopen, reopened }: { id: Id<"submissions">; officer: string; canReopen: boolean; reopened: { byName: string; note: string } | null }) {
  const t = useT();
  const { councilId } = useHq();
  const reopen = useMutation(api.submissions.reopen);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (reopened) {
    return (
      <div className="reopen-note" role="status">
        <strong>{t("Imerudishwa kwa marekebisho", "Sent back for correction")}</strong>
        <span>{reopened.byName}: “{reopened.note}”</span>
      </div>
    );
  }
  if (!canReopen) return null;

  const close = () => {
    setOpen(false);
    setNote("");
    setError(null);
  };
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await reopen({ councilId, submissionId: id, note: note.trim(), client: hqClient });
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-quiet btn-small btn-with-icon" onClick={() => setOpen(true)}>
        <IconReturn size={18} />
        {t("Rudisha kwa marekebisho", "Send back for correction")}
      </button>
      <Dialog
        open={open}
        onClose={close}
        busy={busy}
        title={t("Rudisha ripoti kwa marekebisho", "Send the report back for correction")}
        actions={
          <>
            <button type="button" className="btn btn-primary btn-block" disabled={busy || note.trim().length < 5} onClick={() => void send()}>
              {busy ? t("Inatuma…", "Sending…") : t("Rudisha kwa afisa", "Send back to the officer")}
            </button>
            <button type="button" className="btn btn-quiet btn-block" disabled={busy} onClick={close}>
              {t("Hapana", "Cancel")}
            </button>
          </>
        }
      >
        <p>
          {t(
            `${officer} ataona maelezo yako kwenye simu, atarekebisha na kutuma tena. Hadi atakapotuma, ripoti iliyopo itaendelea kuonekana hapa.`,
            `${officer} will see your note on the phone, correct the report and send it again. Until then the current report stays visible here.`,
          )}
        </p>
        <label className="field">
          <span>{t("Nini kirekebishwe?", "What needs correcting?")}</span>
          <textarea
            className="textarea"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("mfano: Bei ya sukari inaonekana juu mno; hakiki tena dukani.", "e.g. The sugar price looks too high; check it again at the shop.")}
          />
        </label>
        {error && <div className="notice notice-danger" role="alert"><p>{error}</p></div>}
      </Dialog>
    </>
  );
}

/** Officers who have not sent this report: for a phone call, not for blame. */
export function MissingReports({ kind, period, due }: { kind: "food_prices" | "monthly"; period: string; due: number }) {
  const t = useT();
  const { councilId } = useHq();
  const missing = useQuery(api.submissions.missingForHq, { councilId, kind, period });
  if (!missing || missing.length === 0) return null;
  const past = Date.now() > due;
  return (
    <section className="missing no-print" aria-labelledby={`missing-${kind}`}>
      <h2 id={`missing-${kind}`} className="food-h2">
        {past ? t("Hawajatuma", "Not sent") : t("Bado hawajatuma", "Not sent yet")} <span className="badge inline">{missing.length}</span>
      </h2>
      <ul className="missing-list">
        {missing.map((m) => (
          <li key={m.userId}>
            <strong>{m.name}</strong>
            <span className="muted">{m.areaLabel || t("Eneo halijapangwa", "No area assigned")}</span>
            {m.phone && <a className="link" href={`tel:${m.phone}`}>{m.phone}</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
