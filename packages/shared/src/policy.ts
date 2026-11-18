/**
 * The usage policy every officer agrees to once, before first use, and again
 * only when its version changes. Written in both languages side by side.
 * A draft for the department to review before the pilot.
 */

/** Bump when the text changes in substance; officers then agree again. */
export const POLICY_VERSION = "2026-11-2";

export type PolicySection = { title: { sw: string; en: string }; points: { sw: string; en: string }[] };

export const POLICY_TITLE = { sw: "Sera ya matumizi ya Afisa Ugani", en: "Afisa Ugani usage policy" };

export const POLICY_INTRO = {
  sw: "Afisa Ugani ni chombo cha kazi cha Idara ya Kilimo, Mifugo na Uvuvi. Kwa kuitumia unakubali yafuatayo.",
  en: "Afisa Ugani is a work tool of the Department of Agriculture, Livestock and Fisheries. By using it you agree to the following.",
};

export const POLICY_SECTIONS: PolicySection[] = [
  {
    title: { sw: "Kumbukumbu zako", en: "Your records" },
    points: [
      {
        sw: "Kumbukumbu unazoandika ni zako. Makao makuu huona ripoti unazotuma tu, na zile zinazojituma tarehe ya mwisho halmashauri ikiwasha utumaji wa kujituma.",
        en: "The records you write are yours. Head office sees only the reports you send, and those that send themselves on the due date when the council switches automatic sending on.",
      },
      {
        sw: "Andika taarifa za kweli za kazi uliyofanya. Ripoti inaweza kurudishwa kwako ili kurekebishwa.",
        en: "Record true information about the work you did. A report can be sent back to you for correction.",
      },
      {
        sw: "Viwango unavyoweka (kama tija ya mazao) na mpango wa uzalishaji huonekana makao makuu na hutumika baada ya kuidhinishwa.",
        en: "The presets you set (such as crop yields) and your production plan are seen by head office and are used once approved.",
      },
    ],
  },
  {
    title: { sw: "Picha", en: "Photos" },
    points: [
      {
        sw: "Picha zipigwe shambani au bandani wakati wa kazi, kwa kamera ya programu hii. Picha za zamani kutoka kwenye simu hazikubaliwi, ili picha zionyeshe hali halisi wakati huo.",
        en: "Take photos in the field or the shed during your work, with this app's camera. Old photos from the phone's gallery are not accepted, so that photos show the real situation at the time.",
      },
      {
        sw: "Programu haisomi picha zilizoko kwenye simu yako. Inatumia tu picha unazopiga ndani yake kwa ajili ya kumbukumbu zako.",
        en: "The app does not read the photos stored on your phone. It uses only the photos you take inside it for your records.",
      },
      {
        sw: "Ukituma ripoti, picha za kumbukumbu za kipindi cha ripoti hiyo zinaonekana makao makuu pamoja nayo, kwa ufuatiliaji na hatua zaidi.",
        en: "When you send a report, the photos of the records in that report's period are seen by head office with it, for follow-up and further action.",
      },
      {
        sw: "Picha za kazi zinaweza kutumiwa na Idara na Wizara kwa utafiti, mafunzo, na kufundisha mifumo ya kutambua wadudu na magonjwa, bila jina lako wala la mkulima.",
        en: "Work photos may be used by the Department and the Ministry for research, training, and teaching systems to recognise pests and diseases, without your name or the farmer's.",
      },
      {
        sw: "Usipige nyuso za watu, vitambulisho, wala ndani ya nyumba. Omba ruhusa ya mkulima kabla ya kupiga shamba au mifugo yake.",
        en: "Do not photograph people's faces, identity cards, or the inside of homes. Ask the farmer's permission before photographing their farm or animals.",
      },
    ],
  },
  {
    title: { sw: "Taarifa za watu", en: "People's information" },
    points: [
      {
        sw: "Chukua taarifa za wakulima zinazohitajika tu. Namba ya simu ya mkulima iandikwe kwa ridhaa yake.",
        en: "Collect only the farmer information that is needed. Write down a farmer's phone number only with their consent.",
      },
      {
        sw: "Taarifa binafsi zinalindwa kwa mujibu wa Sheria ya Ulinzi wa Taarifa Binafsi, 2022.",
        en: "Personal information is protected under the Personal Data Protection Act, 2022.",
      },
    ],
  },
  {
    title: { sw: "Akaunti yako", en: "Your account" },
    points: [
      {
        sw: "Usimpe mtu mwingine nenosiri lako. Kila kitendo kinarekodiwa kwa jina la akaunti iliyokifanya.",
        en: "Do not give your password to anyone. Every action is recorded under the account that did it.",
      },
      {
        sw: "Simu ikipotea, mjulishe mkuu wa sehemu yako mara moja.",
        en: "If your phone is lost, tell your section head at once.",
      },
    ],
  },
];

/** The policy as plain text, for copying or printing. */
export function policyText(lang: "sw" | "en"): string {
  const out = [POLICY_TITLE[lang], `(${POLICY_VERSION})`, "", POLICY_INTRO[lang], ""];
  for (const s of POLICY_SECTIONS) {
    out.push(s.title[lang]);
    for (const p of s.points) out.push(`- ${p[lang]}`);
    out.push("");
  }
  return out.join("\n").trim();
}
