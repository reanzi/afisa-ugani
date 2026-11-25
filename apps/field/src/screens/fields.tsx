import { useId } from "react";
import { fieldVisible, L, type FieldSpec } from "@afisa/shared";
import { Select, SuggestInput } from "@afisa/ui";

/** Draft values: numbers stay as typed strings until saving, so "1." can be typed. */
export type Draft = Record<string, string>;

export function draftToPayload(fields: readonly FieldSpec[], draft: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (draft[f.key] ?? "").trim();
    if (raw === "") continue;
    if (f.kind === "count") out[f.key] = Number.parseInt(raw, 10);
    else if (f.kind === "decimal" || f.kind === "money") out[f.key] = Number(raw.replace(/,/g, "").replace(/\s/g, ""));
    else out[f.key] = raw;
  }
  // Drop answers to questions that no longer apply (e.g. hide processing after switching to milk).
  for (const f of fields) if (!fieldVisible(f, out)) delete out[f.key];
  return out;
}

export function payloadToDraft(payload: Record<string, unknown>): Draft {
  const d: Draft = {};
  for (const [k, v] of Object.entries(payload)) if (v !== undefined && v !== null) d[k] = String(v);
  return d;
}

const unitOf = (f: FieldSpec, payload: Record<string, unknown>) =>
  typeof f.unit === "function" ? f.unit(payload) : (f.unit ?? "");

export function FieldInput({
  field,
  value,
  onChange,
  payload,
  error,
}: {
  field: FieldSpec;
  value: string;
  onChange: (v: string) => void;
  payload: Record<string, unknown>;
  error?: boolean;
}) {
  const id = useId();
  const unit = unitOf(field, payload);
  const labelId = `${id}-label`;
  const label = (
    <span className="field-label" id={labelId}>
      {field.label}
      {!field.required && <span className="optional"> (si lazima)</span>}
    </span>
  );

  if (field.kind === "choice" || (field.kind === "select" && (field.options?.length ?? 0) <= 4)) {
    return (
      <fieldset className={`field plain ${error ? "has-error" : ""}`}>
        <legend>{label}</legend>
        <div className="chips">
          {field.options?.map((o) => (
            <button
              key={o.value}
              type="button"
              className="chip"
              aria-pressed={value === o.value}
              onClick={() => onChange(value === o.value && !field.required ? "" : o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {field.hint && <small>{field.hint}</small>}
      </fieldset>
    );
  }

  if (field.kind === "select") {
    return (
      <div className={`field ${error ? "has-error" : ""}`}>
        {label}
        <Select
          labelledBy={labelId}
          label={field.label}
          value={value}
          onChange={onChange}
          options={field.options ?? []}
          invalid={error}
        />
        {field.hint && <small>{field.hint}</small>}
      </div>
    );
  }

  if (field.kind === "count") {
    const n = Number.parseInt(value || "0", 10) || 0;
    return (
      <div className={`field ${error ? "has-error" : ""}`}>
        <label htmlFor={id}>{label}</label>
        <div className="stepper">
          <button type="button" aria-label={L(`Punguza ${field.label}`, `Decrease ${field.label}`)} onClick={() => onChange(String(Math.max(0, n - 1)))} disabled={n <= 0}>
            −
          </button>
          <input
            id={id}
            className="input"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            placeholder="0"
            onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <button type="button" aria-label={L(`Ongeza ${field.label}`, `Increase ${field.label}`)} onClick={() => onChange(String(n + 1))}>
            +
          </button>
        </div>
        {field.hint && <small>{field.hint}</small>}
      </div>
    );
  }

  if (field.kind === "decimal" || field.kind === "money") {
    return (
      <label className={`field ${error ? "has-error" : ""}`} htmlFor={id}>
        {label}
        <span className="with-unit">
          <input
            id={id}
            className="input"
            inputMode="decimal"
            value={value}
            placeholder="0"
            onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
          />
          {unit && <span className="unit">{unit}</span>}
        </span>
        {field.hint && <small>{field.hint}</small>}
      </label>
    );
  }

  if (field.kind === "longtext") {
    return (
      <label className={`field ${error ? "has-error" : ""}`} htmlFor={id}>
        {label}
        <textarea id={id} className="textarea" value={value} onChange={(e) => onChange(e.target.value)} />
        {field.hint && <small>{field.hint}</small>}
      </label>
    );
  }

  if (field.suggestions) {
    return (
      <div className={`field ${error ? "has-error" : ""}`}>
        {label}
        <SuggestInput id={id} labelledBy={labelId} value={value} onChange={onChange} suggestions={field.suggestions} invalid={error} />
        {field.hint && <small>{field.hint}</small>}
      </div>
    );
  }

  return (
    <label className={`field ${error ? "has-error" : ""}`} htmlFor={id}>
      {label}
      <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      {field.hint && <small>{field.hint}</small>}
    </label>
  );
}
