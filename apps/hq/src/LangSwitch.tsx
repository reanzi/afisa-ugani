import { LANGS, setLang, useLang, useT } from "@afisa/ui";

/** SW | EN, always visible: the side bar, and the corner of the sign-in screens. */
export function LangSwitch() {
  const lang = useLang();
  const t = useT();
  return (
    <div className="lang-switch" role="group" aria-label={t("Lugha", "Language")}>
      {LANGS.map((l) => (
        <button key={l.value} type="button" aria-pressed={lang === l.value} title={l.label} lang={l.value} onClick={() => setLang(l.value)}>
          {l.short}
        </button>
      ))}
    </div>
  );
}
