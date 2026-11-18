/**
 * Eight boxes for a council code, in two groups of four ("ABCD-EFGH"), like a
 * one-time code: typing moves forward, Backspace moves back, pasting
 * "abcd-ef12" fills every box.
 */
import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function CodeInput({
  value,
  onChange,
  length = 8,
  group = 4,
  invalid,
  labelledBy,
  autoFocus,
}: {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  group?: number;
  invalid?: boolean;
  labelledBy?: string;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = clean(value).slice(0, length).split("");
  // Focus moves after the new value has rendered, so every handler sees the current code.
  const pendingFocus = useRef<number | null>(null);
  const focusNow = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  };
  const focus = (i: number) => {
    pendingFocus.current = i;
  };
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const i = pendingFocus.current;
    pendingFocus.current = null;
    focusNow(i);
  });

  const setFrom = (start: number, typed: string) => {
    const incoming = clean(typed);
    if (!incoming) return;
    const next = [...chars];
    for (let k = 0; k < incoming.length && start + k < length; k++) next[start + k] = incoming[k]!;
    const joined = next.join("").slice(0, length);
    onChange(joined);
    focus(Math.min(start + incoming.length, length - 1));
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...chars];
      if (next[i]) {
        next.splice(i, 1);
      } else if (i > 0) {
        next.splice(i - 1, 1);
      }
      // Deleting a filled box stays there; deleting from an empty box steps back.
      focus(chars[i] ? i : Math.max(0, i - 1));
      onChange(next.join(""));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusNow(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusNow(Math.min(i + 1, chars.length));
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    // A full code pasted anywhere fills from the start.
    setFrom(clean(text).length >= length ? 0 : i, text);
  };

  const boxes = Array.from({ length }, (_, i) => (
    <input
      key={i}
      ref={(el) => {
        refs.current[i] = el;
      }}
      className="code-box"
      value={chars[i] ?? ""}
      inputMode="text"
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      maxLength={length}
      autoFocus={autoFocus && i === 0}
      aria-label={`Herufi ${i + 1} kati ya ${length}`}
      // Always type into the first empty box, so a code cannot have gaps.
      onFocus={(e) => {
        const firstEmpty = Math.min(chars.length, length - 1);
        if (i > firstEmpty) focusNow(firstEmpty);
        else e.currentTarget.select();
      }}
      onChange={(e) => {
        const v = clean(e.target.value);
        if (!v) {
          // Android keyboards often delete without a usable Backspace key event.
          const next = [...chars];
          next.splice(i, 1);
          onChange(next.join(""));
          return;
        }
        if (v.length >= length) return setFrom(0, v); // autofill or paste of a whole code
        const prev = chars[i] ?? "";
        setFrom(i, v.length > 1 && prev && v.includes(prev) ? v.replace(prev, "") : v);
      }}
      onKeyDown={(e) => onKey(i, e)}
      onPaste={(e) => onPaste(i, e)}
    />
  ));

  return (
    <div className={`code-input-row ${invalid ? "is-invalid" : ""}`} role="group" aria-labelledby={labelledBy}>
      {boxes.slice(0, group)}
      <span className="code-sep" aria-hidden="true">–</span>
      {boxes.slice(group)}
    </div>
  );
}

/** Shows a code in two readable groups: "ABCD-EFGH". */
export function CouncilCodeText({ code, large }: { code: string; large?: boolean }) {
  const c = clean(code);
  const legacy = c.length !== 8;
  return (
    <span className={`council-code-text ${large ? "is-large" : ""}`} aria-label={`Msimbo ${c.split("").join(" ")}`}>
      {legacy ? (
        code
      ) : (
        <>
          {c.slice(0, 4)}
          <span className="code-sep" aria-hidden="true">-</span>
          {c.slice(4)}
        </>
      )}
    </span>
  );
}
