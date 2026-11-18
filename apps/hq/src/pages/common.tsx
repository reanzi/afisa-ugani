import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { SECTION_LABELS, type Section, type Target } from "@afisa/shared";
import { useHq } from "../context";

export type MemberRow = FunctionReturnType<typeof api.memberships.listForHq>[number];

export const toTarget = (m: MemberRow): Target => ({
  userId: m.userId,
  role: m.role,
  status: m.status,
  primarySection: m.primarySection,
  sections: m.sections,
});

export function SectionTags({ sections, primary }: { sections: readonly Section[]; primary?: Section }) {
  return (
    <span className="tags">
      {sections.map((s) => (
        <span key={s} className={`sec sec-${s} sec-tag`} title={s === primary ? "Sehemu kuu" : undefined}>
          {SECTION_LABELS[s].sw}
          {s === primary && sections.length > 1 ? " (kuu)" : ""}
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
  const areas = useAreas();
  if (!areas) return <p className="muted">Inapakia maeneo…</p>;
  const wards = areas.filter((a) => a.kind === "ward");
  if (wards.length === 0) return <p className="muted">Hakuna maeneo bado. Ongeza kata na vijiji kwenye ukurasa wa Maeneo.</p>;
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
              Kata ya {w.name} (yote)
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
  return ids
    .map((id) => areas.find((a) => a._id === id))
    .filter((a) => a !== undefined)
    .map((a) => (a.kind === "ward" ? `Kata ya ${a.name}` : a.name))
    .join(", ");
}

export function when(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString("sw-TZ", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
