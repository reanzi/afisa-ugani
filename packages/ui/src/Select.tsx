/**
 * The app's own select. Phones get a bottom sheet with large rows (and search
 * for long lists); wider screens get a list anchored under the field.
 * Keyboard: ↓/↑ to move, Enter to pick, Esc to close, typing filters.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  /** Options sharing a group are listed under that heading. */
  group?: string;
  hint?: string;
};

export type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  /** Heading of the phone sheet; also the accessible name when no labelledBy. */
  label?: string;
  labelledBy?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Defaults to on when there are more than 8 options. */
  searchable?: boolean;
  size?: "md" | "sm";
  className?: string;
};

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function Chevron() {
  return (
    <svg className="sel-chevron" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg className="sel-check" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PHONE = "(max-width: 639px)";

export function Select({
  value,
  onChange,
  options,
  placeholder = "Chagua",
  label,
  labelledBy,
  id,
  disabled,
  invalid,
  searchable,
  size = "md",
  className,
}: SelectProps) {
  const autoId = useId();
  const triggerId = id ?? `${autoId}-trigger`;
  const listId = `${autoId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number; above: boolean } | null>(null);
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(PHONE).matches);

  const search = searchable ?? options.length > 8;
  const selected = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    if (!query.trim()) return options;
    const q = fold(query.trim());
    return options.filter((o) => fold(o.label).includes(q) || (o.group && fold(o.group).includes(q)));
  }, [options, query]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openList = () => {
    if (disabled) return;
    setPhone(window.matchMedia(PHONE).matches);
    const idx = options.findIndex((o) => o.value === value);
    setActive(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  const pick = (o: SelectOption) => {
    onChange(o.value);
    close();
  };

  // Anchor the desktop list under (or above) the trigger.
  useLayoutEffect(() => {
    if (!open || phone) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const flip = below < 240 && above > below;
      setPos({
        top: flip ? r.top - 6 : r.bottom + 6,
        left: Math.min(r.left, window.innerWidth - Math.max(r.width, 260) - 8),
        width: Math.max(r.width, 260),
        maxHeight: Math.min(380, flip ? above : below),
        above: flip,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, phone]);

  // Close on outside press; lock page scroll under the phone sheet.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    const prev = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.body.style.overflow = prev;
    };
  }, [open, phone, close]);

  // Focus the search box, or the list, when opening.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const input = panelRef.current?.querySelector<HTMLInputElement>("input");
      (input ?? listRef.current)?.focus();
    }, 10);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => setActive(0), [query]);

  const onTriggerKey = (e: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openList();
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = shown[active];
      if (o) pick(o);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  let lastGroup: string | undefined;
  const panel = open
    ? createPortal(
        <>
          {phone && <div className="sel-backdrop" aria-hidden="true" />}
          <div
            ref={panelRef}
            className={`sel-panel ${phone ? "is-sheet" : "is-popover"} ${pos?.above ? "is-above" : ""}`}
            style={!phone && pos ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight } : undefined}
            onKeyDown={onListKey}
          >
            {phone && (
              <div className="sel-sheet-head">
                <strong>{label ?? placeholder}</strong>
                <button type="button" className="sel-close" onClick={() => close()} aria-label="Funga">
                  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}
            {search && (
              <input
                className="sel-search"
                type="search"
                placeholder="Tafuta…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-controls={listId}
                aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                autoComplete="off"
              />
            )}
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={label}
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              className="sel-list"
            >
              {shown.length === 0 && <li className="sel-empty">Hakuna kinacholingana</li>}
              {shown.map((o, i) => {
                const heading = o.group && o.group !== lastGroup ? o.group : null;
                lastGroup = o.group;
                return (
                  <li key={`${o.group ?? ""}:${o.value}`} role="presentation">
                    {heading && <div className="sel-group">{heading}</div>}
                    <div
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={o.value === value}
                      className={`sel-option ${i === active ? "is-active" : ""} ${o.group ? "in-group" : ""}`}
                      onPointerMove={() => setActive(i)}
                      onClick={() => pick(o)}
                    >
                      <span className="sel-option-text">
                        {o.label}
                        {o.hint && <small>{o.hint}</small>}
                      </span>
                      {o.value === value && <Check />}
                    </div>
                  </li>
                );
              })}
            </ul>
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
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy ? `${labelledBy} ${triggerId}` : undefined}
        aria-label={labelledBy ? undefined : label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={`sel-trigger sel-${size} ${invalid ? "is-invalid" : ""} ${className ?? ""}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
      >
        <span className={selected ? "sel-value" : "sel-value is-placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <Chevron />
      </button>
      {panel}
    </>
  );
}
