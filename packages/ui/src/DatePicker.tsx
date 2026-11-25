/**
 * The app's own date picker, in place of the browser's: a field that reads
 * "Nov 19, 2026" and opens a month calendar (a sheet on phones, a popover on
 * wider screens). Values stay "YYYY-MM-DD", like <input type="date">, so it
 * drops in where that was used. TimeField picks hours and minutes the same way.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useT } from "./i18n";
import { monthName, shortDate, weekdayInitials } from "./format";
import { Select } from "./Select";

const PHONE = "(max-width: 639px)";
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-19" for a local date. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Local midnight of "2026-11-19", or null. */
export function parseIsoDay(v: string | null | undefined): Date | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function CalendarIcon() {
  return (
    <svg className="dp-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d={dir === "left" ? "M12.5 5l-5 5 5 5" : "M7.5 5l5 5-5 5"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  /** Accessible name (and the phone sheet's heading) when there is no labelledBy. */
  label?: string;
  labelledBy?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Show a "clear" button that empties the value. */
  clearable?: boolean;
  size?: "md" | "sm";
};

export function DatePicker({ value, onChange, min, max, label, labelledBy, id, placeholder, disabled, invalid, clearable, size = "md" }: DatePickerProps) {
  const t = useT();
  const autoId = useId();
  const triggerId = id ?? `${autoId}-dp`;
  const gridId = `${autoId}-grid`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(PHONE).matches);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  const selected = parseIsoDay(value);
  const minD = parseIsoDay(min);
  const maxD = parseIsoDay(max);
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const [focus, setFocus] = useState<Date>(selected ?? today);
  const view = new Date(focus.getFullYear(), focus.getMonth(), 1);

  const allowed = useCallback((d: Date) => (!minD || d >= minD) && (!maxD || d <= maxD), [minD, maxD]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openPanel = () => {
    if (disabled) return;
    setPhone(window.matchMedia(PHONE).matches);
    setFocus(selected ?? (maxD && today > maxD ? maxD : today));
    setOpen(true);
  };

  const pick = (d: Date) => {
    if (!allowed(d)) return;
    onChange(isoDay(d));
    close();
  };

  useLayoutEffect(() => {
    if (!open || phone) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const height = 380;
      const below = window.innerHeight - r.bottom - 12;
      const above = below < height && r.top - 12 > below;
      setPos({ top: above ? r.top - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 316)), above });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, phone]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    const prev = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.body.style.overflow = prev;
    };
  }, [open, phone, close]);

  // Keep keyboard focus on the focused day.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => panelRef.current?.querySelector<HTMLButtonElement>(`[data-day="${isoDay(focus)}"]`)?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, focus]);

  const move = (days: number) => setFocus((f) => new Date(f.getFullYear(), f.getMonth(), f.getDate() + days));
  const moveMonth = (n: number) => setFocus((f) => {
    const target = new Date(f.getFullYear(), f.getMonth() + n, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(f.getDate(), last));
  });

  const onGridKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(-1),
      ArrowRight: () => move(1),
      ArrowUp: () => move(-7),
      ArrowDown: () => move(7),
      PageUp: () => moveMonth(-1),
      PageDown: () => moveMonth(1),
      Home: () => move(-((focus.getDay() + 6) % 7)),
      End: () => move(6 - ((focus.getDay() + 6) % 7)),
      Enter: () => pick(focus),
      " ": () => pick(focus),
      Escape: () => close(),
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  // Six weeks, Monday first.
  const start = new Date(view.getFullYear(), view.getMonth(), 1 - ((view.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const prevMonthEnd = new Date(view.getFullYear(), view.getMonth(), 0);
  const nextMonthStart = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  const canPrev = !minD || prevMonthEnd >= minD;
  const canNext = !maxD || nextMonthStart <= maxD;

  const panel = open
    ? createPortal(
        <>
          {phone && <div className="sel-backdrop" aria-hidden="true" />}
          <div
            ref={panelRef}
            className={`dp-panel ${phone ? "sel-panel is-sheet" : "is-popover"} ${pos?.above ? "is-above" : ""}`}
            style={!phone && pos ? { top: pos.top, left: pos.left } : undefined}
            role="dialog"
            aria-modal={phone || undefined}
            aria-label={label ?? t("Chagua tarehe", "Choose a date")}
          >
            {phone && (
              <div className="sel-sheet-head">
                <strong>{label ?? t("Chagua tarehe", "Choose a date")}</strong>
                <button type="button" className="sel-close" onClick={() => close()} aria-label={t("Funga", "Close")}>
                  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                </button>
              </div>
            )}
            <div className="dp-head">
              <button type="button" className="dp-nav" onClick={() => moveMonth(-1)} disabled={!canPrev} aria-label={t("Mwezi uliopita", "Previous month")}>
                <Chevron dir="left" />
              </button>
              <strong className="dp-title" aria-live="polite">{monthName(view.getMonth())} {view.getFullYear()}</strong>
              <button type="button" className="dp-nav" onClick={() => moveMonth(1)} disabled={!canNext} aria-label={t("Mwezi ujao", "Next month")}>
                <Chevron dir="right" />
              </button>
            </div>
            <div className="dp-grid" id={gridId} role="grid" onKeyDown={onGridKey}>
              {weekdayInitials().map((w, i) => (
                <span key={i} className="dp-wd" role="columnheader">{w}</span>
              ))}
              {cells.map((d) => {
                const iso = isoDay(d);
                const inMonth = d.getMonth() === view.getMonth();
                const isSel = selected !== null && iso === isoDay(selected);
                const isToday = iso === isoDay(today);
                const ok = allowed(d);
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    data-day={iso}
                    tabIndex={iso === isoDay(focus) ? 0 : -1}
                    aria-selected={isSel}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={shortDate(d.getTime())}
                    disabled={!ok}
                    className={`dp-day${inMonth ? "" : " is-out"}${isSel ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                    onClick={() => pick(d)}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="dp-foot">
              {clearable && value ? (
                <button type="button" className="dp-link" onClick={() => { onChange(""); close(); }}>{t("Futa", "Clear")}</button>
              ) : <span />}
              <button type="button" className="dp-link" disabled={!allowed(today)} onClick={() => pick(today)}>{t("Leo", "Today")}</button>
            </div>
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelledBy ? `${labelledBy} ${triggerId}` : undefined}
        aria-label={labelledBy ? undefined : label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={`sel-trigger sel-${size} dp-trigger ${invalid ? "is-invalid" : ""}`}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPanel();
          }
        }}
      >
        <CalendarIcon />
        <span className={`sel-value${selected ? "" : " is-placeholder"}`}>{selected ? shortDate(selected.getTime()) : (placeholder ?? t("Chagua tarehe", "Choose a date"))}</span>
      </button>
      {panel}
    </>
  );
}

/** Hours and minutes as two of the app's selects; value "14:05". */
export function TimeField({ value, onChange, labelledBy, disabled, maxForToday }: { value: string; onChange: (v: string) => void; labelledBy?: string; disabled?: boolean; maxForToday?: string }) {
  const t = useT();
  const [h = "00", m = "00"] = value.split(":");
  const maxH = maxForToday ? Number(maxForToday.split(":")[0]) : 23;
  const maxM = maxForToday && Number(h) === maxH ? Number(maxForToday.split(":")[1]) : 59;
  const hours = Array.from({ length: maxH + 1 }, (_, i) => ({ value: pad(i), label: pad(i) }));
  const minutes = Array.from({ length: maxM + 1 }, (_, i) => ({ value: pad(i), label: pad(i) }));
  return (
    <div className="dp-time" role="group" aria-labelledby={labelledBy}>
      <Select value={h} onChange={(v) => onChange(`${v}:${Number(v) === maxH && maxForToday && Number(m) > Number(maxForToday.split(":")[1]) ? maxForToday.split(":")[1] : m}`)} options={hours} label={t("Saa", "Hour")} disabled={disabled} searchable={false} />
      <span className="dp-colon" aria-hidden>:</span>
      <Select value={m} onChange={(v) => onChange(`${h}:${v}`)} options={minutes} label={t("Dakika", "Minutes")} disabled={disabled} />
    </div>
  );
}
