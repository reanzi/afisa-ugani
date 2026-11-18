/** The usage policy, in the language chosen now. */
import { POLICY_INTRO, POLICY_SECTIONS, POLICY_TITLE, POLICY_VERSION } from "@afisa/shared";
import { useLang } from "./i18n";

export function PolicyView({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const lang = useLang();
  const H = headingLevel === 1 ? "h1" : "h2";
  const S = headingLevel === 1 ? "h2" : "h3";
  return (
    <article className="policy">
      <H className="policy-title">{POLICY_TITLE[lang]}</H>
      <p className="policy-version">{lang === "en" ? "Version" : "Toleo"} {POLICY_VERSION}</p>
      <p className="policy-intro">{POLICY_INTRO[lang]}</p>
      {POLICY_SECTIONS.map((s) => (
        <section key={s.title.sw}>
          <S>{s.title[lang]}</S>
          <ul>
            {s.points.map((p) => (
              <li key={p.sw}>{p[lang]}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
