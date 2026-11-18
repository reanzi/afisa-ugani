/**
 * Asks for one preset where a calculation needs it ("Weka tija ya Mahindi"),
 * then shows where it stands: waiting for approval, approved, or refused.
 */
import { useState, type FormEvent } from "react";
import { presetDef } from "@afisa/shared";
import type { LocalPreset } from "../lib/db";
import { proposePreset } from "../lib/presets";

const fmt = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v ?? ""));

export function PresetAsk({
  councilId,
  presetKey,
  row,
  reason,
  compact = false,
}: {
  councilId: string;
  presetKey: string;
  row: LocalPreset | undefined;
  /** Why the app is asking: "Kukokotoa mavuno ya Mahindi". */
  reason?: string;
  compact?: boolean;
}) {
  const def = presetDef(presetKey);
  const [editing, setEditing] = useState(!row);
  const [text, setText] = useState(row ? fmt(row.value) : "");
  const [problem, setProblem] = useState<string | null>(null);
  if (!def) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(text.replace(",", "."));
    if (!Number.isFinite(value) || value < def.min || value > def.max) {
      setProblem(`Andika namba kati ya ${def.min} na ${def.max.toLocaleString("en-US")}.`);
      return;
    }
    setProblem(null);
    await proposePreset(councilId, presetKey, value);
    setEditing(false);
  };

  const status = row
    ? row.syncState === "rejected"
      ? { tone: "danger", text: `Haikupokelewa: ${row.error ?? ""}` }
      : row.status === "approved"
        ? { tone: "ok", text: `Imeidhinishwa: ${fmt(row.approvedValue)} ${def.unit}${row.approvedByName ? `, na ${row.approvedByName}` : ""}` }
        : row.status === "rejected"
          ? { tone: "danger", text: `Imekataliwa${row.note ? `: “${row.note}”` : ""}. Weka thamani nyingine.` }
          : {
              tone: "wait",
              text: `Umeweka ${fmt(row.value)} ${def.unit}; inasubiri idhini ya mkuu wa sehemu${row.approvedValue !== undefined ? ` (inayotumika sasa ${fmt(row.approvedValue)})` : ""}.`,
            }
    : null;

  return (
    <div className={`preset-ask${compact ? " is-compact" : ""}${status ? ` tone-${status.tone}` : ""}`}>
      {!compact && (
        <div className="preset-ask-head">
          <strong>{def.label}</strong>
          {reason && <span>{reason}</span>}
        </div>
      )}
      {status && !editing && (
        <p className="preset-status">
          {status.text}{" "}
          <button type="button" className="link" onClick={() => setEditing(true)}>Badili</button>
        </p>
      )}
      {editing && (
        <form className="preset-form" onSubmit={submit} noValidate>
          <label className="field">
            <span className="sr-only">{def.label}</span>
            <span className="with-unit">
              <input
                className="input"
                inputMode="decimal"
                value={text}
                onChange={(e) => setText(e.target.value.replace(/[^0-9.,]/g, ""))}
                placeholder={compact ? `${def.label}` : undefined}
              />
              <span className="unit">{def.unit}</span>
            </span>
          </label>
          <button className="btn btn-primary" disabled={!text}>Hifadhi</button>
        </form>
      )}
      {editing && !compact && <p className="muted small">{def.hint} Itatumika baada ya mkuu wa sehemu kuidhinisha.</p>}
      {problem && <p className="field-error" role="alert">{problem}</p>}
    </div>
  );
}
