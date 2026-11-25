/**
 * The signed-in person at the foot of the side menu: avatar, name and role on
 * one line each. Opening it shows the account page link, appearance,
 * language and sign-out, so the side menu itself stays quiet.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { displayName, initialsOf, titleCaseName } from "@afisa/shared";
import { IconLogout, LANGS, setLang, setThemeChoice, useLang, useT, useTheme, type ThemeChoice } from "@afisa/ui";

const Chevron = () => (
  <svg className="acct-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m7 14 5-5 5 5" />
  </svg>
);
const IconUser = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </svg>
);
const IconDoc = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5M10 13h6M10 17h6" />
  </svg>
);

export function AccountMenu({
  name,
  roleText,
  checkNumber,
  onAccount,
  onPolicy,
  onSignOut,
}: {
  name: string | null;
  roleText: string;
  checkNumber: string | null;
  onAccount: () => void;
  onPolicy: () => void;
  onSignOut: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const { choice } = useTheme();
  const [open, setOpen] = useState(false);
  // The side menu scrolls (and so clips); place the panel over the page instead.
  const [place, setPlace] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const full = name ? titleCaseName(name) : t("Bila jina", "No name");

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const position = () => {
      const r = trigger.current!.getBoundingClientRect();
      const width = Math.max(r.width, 300);
      const left = Math.min(r.left, window.innerWidth - width - 8);
      const below = r.top < window.innerHeight / 2; // narrow screens: the account sits in the top bar
      setPlace(below ? { left, width, top: r.bottom + 6 } : { left, width, bottom: window.innerHeight - r.top + 6 });
    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    root.current?.querySelector<HTMLElement>(".acct-panel button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const themes: { value: ThemeChoice; label: string }[] = [
    { value: "system", label: t("Mfumo", "System") },
    { value: "auto", label: t("Kwa saa", "By time") },
    { value: "shambani", label: t("Mchana", "Light") },
    { value: "usiku", label: t("Usiku", "Dark") },
  ];

  return (
    <div className="hq-account" ref={root}>
      {open && (
        <div className="acct-panel" id={panelId} role="dialog" aria-label={t("Akaunti", "Account")} style={place}>
          <div className="acct-head">
            <strong>{full}</strong>
            <span>{roleText}</span>
            {checkNumber && <span className="muted">{t("Namba ya utumishi", "Check number")} {checkNumber}</span>}
          </div>

          <button type="button" className="acct-item" onClick={go(onAccount)}>
            <IconUser /> {t("Akaunti yangu", "My account")}
          </button>
          <button type="button" className="acct-item" onClick={go(onPolicy)}>
            <IconDoc /> {t("Sera ya matumizi", "Usage policy")}
          </button>

          <div className="acct-group">
            <span className="acct-label" id={`${panelId}-theme`}>{t("Mwonekano", "Appearance")}</span>
            <div className="acct-seg" role="group" aria-labelledby={`${panelId}-theme`}>
              {themes.map((x) => (
                <button key={x.value} type="button" aria-pressed={choice === x.value} onClick={() => setThemeChoice(x.value)}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>

          <div className="acct-group">
            <span className="acct-label" id={`${panelId}-lang`}>{t("Lugha", "Language")}</span>
            <div className="acct-seg" role="group" aria-labelledby={`${panelId}-lang`}>
              {LANGS.map((l) => (
                <button key={l.value} type="button" lang={l.value} aria-pressed={lang === l.value} onClick={() => setLang(l.value)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="acct-item is-danger" onClick={go(onSignOut)}>
            <IconLogout size={20} /> {t("Toka", "Sign out")}
          </button>
        </div>
      )}

      <button
        ref={trigger}
        type="button"
        className="acct-trigger"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={full}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden>{initialsOf(full)}</span>
        <span className="acct-text">
          <span className="acct-name">{displayName(full, 18) || full}</span>
          <span className="acct-role">{roleText}</span>
        </span>
        <Chevron />
      </button>
    </div>
  );
}
