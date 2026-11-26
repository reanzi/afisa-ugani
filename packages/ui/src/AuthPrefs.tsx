/**
 * Language and appearance on the sign-in and sign-up screens, before there
 * is an account menu to hold them. The theme starts on "system".
 */
import { LANGS, setLang, useLang, useT } from "./i18n";
import { Glide } from "./Glide.tsx";
import { setThemeChoice, useTheme, type ThemeChoice } from "./theme";

const svg = (d: string) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS: Record<Exclude<ThemeChoice, "auto">, React.ReactNode> = {
  system: svg("M4 5h16v11H4zM9 20h6M12 16v4"),
  shambani: svg("M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"),
  usiku: svg("M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"),
};

export function AuthPrefs({ className }: { className?: string }) {
  const t = useT();
  const lang = useLang();
  const { choice } = useTheme();
  const themes: { value: Exclude<ThemeChoice, "auto">; label: string }[] = [
    { value: "system", label: t("Kama mfumo wa kifaa", "Like the device setting") },
    { value: "shambani", label: t("Mchana (mwanga)", "Light") },
    { value: "usiku", label: t("Usiku (giza)", "Dark") },
  ];
  return (
    <div className={`auth-prefs${className ? ` ${className}` : ""}`}>
      <div className="pref-seg" role="group" aria-label={t("Lugha", "Language")}>
        {LANGS.map((l) => (
          <button key={l.value} type="button" aria-pressed={lang === l.value} title={l.label} lang={l.value} onClick={() => setLang(l.value)}>
            {l.short}
          </button>
        ))}
        <Glide />
      </div>
      <div className="pref-seg" role="group" aria-label={t("Mwonekano", "Appearance")}>
        {themes.map((th) => (
          <button
            key={th.value}
            type="button"
            aria-pressed={choice === th.value}
            title={th.label}
            aria-label={th.label}
            onClick={() => setThemeChoice(th.value)}
          >
            {ICONS[th.value]}
          </button>
        ))}
        <Glide />
      </div>
    </div>
  );
}
