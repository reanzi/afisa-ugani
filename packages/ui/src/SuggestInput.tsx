/**
 * A text field with our own suggestion list (replaces the browser's datalist).
 * Officers can always type something not in the list.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function SuggestInput({
  id,
  value,
  onChange,
  suggestions,
  invalid,
  labelledBy,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: readonly string[];
  invalid?: boolean;
  labelledBy?: string;
}) {
  const auto = useId();
  const inputId = id ?? `${auto}-input`;
  const listId = `${auto}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<number | undefined>(undefined);

  const matches = useMemo(() => {
    const q = fold(value.trim());
    const list = q ? suggestions.filter((s) => fold(s).includes(q) && fold(s) !== q) : suggestions;
    return list.slice(0, 8);
  }, [value, suggestions]);

  const show = open && matches.length > 0;

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
    setActive(-1);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && show && active >= 0) {
      e.preventDefault();
      pick(matches[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="suggest">
      <input
        id={inputId}
        className={`input ${invalid ? "is-invalid" : ""}`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls={listId}
        aria-labelledby={labelledBy}
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKey}
      />
      {show && (
        <ul id={listId} role="listbox" className="suggest-list" onPointerDown={() => window.clearTimeout(blurTimer.current)}>
          {matches.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : undefined}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
