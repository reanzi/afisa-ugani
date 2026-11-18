/**
 * Fixed lists from the July 2018 VAEO/WAEO form. Values are stable ids
 * (stored in records); labels are what officers and the printed form show.
 */

export type Option = { value: string; label: string };

const opts = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

/** Crops listed in tables 2.1 and 2.2, in the form's order. */
export const CROPS = opts([
  ["mahindi", "Mahindi"],
  ["mpunga", "Mpunga"],
  ["mtama", "Mtama"],
  ["uwele", "Uwele"],
  ["ulezi", "Ulezi"],
  ["ngano", "Ngano"],
  ["mihogo", "Mihogo"],
  ["viazi_vitamu", "Viazi vitamu"],
  ["viazi_mviringo", "Viazi mviringo"],
  ["kunde", "Kunde"],
  ["maharage", "Maharage"],
  ["ndizi_mbivu", "Ndizi mbivu"],
  ["ndizi_mbichi", "Ndizi mbichi"],
]);

/** Other crops officers commonly price or report pests on. */
export const OTHER_CROPS = opts([
  ["alizeti", "Alizeti"],
  ["karanga", "Karanga"],
  ["ufuta", "Ufuta"],
  ["pamba", "Pamba"],
  ["korosho", "Korosho"],
  ["kahawa", "Kahawa"],
  ["chai", "Chai"],
  ["tumbaku", "Tumbaku"],
  ["mbogamboga", "Mbogamboga"],
  ["matunda", "Matunda"],
  ["nyingine", "Nyingine"],
]);

export const ALL_CROPS = [...CROPS, ...OTHER_CROPS];

/** Table 4 rows (slaughter). */
export const SLAUGHTER_ANIMALS = opts([
  ["ngombe", "Ng’ombe"],
  ["kondoo", "Kondoo"],
  ["mbuzi", "Mbuzi"],
  ["nguruwe", "Nguruwe"],
  ["kuku_asili", "Kuku wa asili"],
  ["kuku_kisasa", "Kuku wa kisasa"],
  ["mengineyo", "Mengineyo"],
]);

/** Animals for treatment, vaccination and services (tables 7.1–7.3). */
export const ANIMALS = opts([
  ["ngombe", "Ng’ombe"],
  ["mbuzi", "Mbuzi"],
  ["kondoo", "Kondoo"],
  ["nguruwe", "Nguruwe"],
  ["kuku", "Kuku"],
  ["bata", "Bata"],
  ["mbwa", "Mbwa"],
  ["paka", "Paka"],
  ["punda", "Punda"],
  ["mengineyo", "Mengineyo"],
]);

/** Table 7.3 rows. */
export const SERVICE_ANIMALS = opts([
  ["ngombe", "Ng’ombe"],
  ["mbuzi", "Mbuzi"],
  ["kondoo", "Kondoo"],
  ["nguruwe", "Nguruwe"],
  ["kuku", "Kuku"],
  ["bata", "Bata"],
]);

/** Table 7.3 columns. */
export const LIVESTOCK_SERVICES = opts([
  ["kwato", "Kukata kwato"],
  ["kuhasi", "Kuhasi"],
  ["ai", "Kuhamilisha (AI)"],
  ["pembe", "Kukata pembe"],
  ["alama", "Kuweka alama"],
  ["midomo", "Kukata midomo"],
  ["mikia", "Kukata mikia"],
  ["meno", "Kukata meno"],
  ["hereni", "Hereni ya puani (Bull ring)"],
  ["mimba", "Upimaji wa mimba"],
  ["joto", "Sindano ya kuchochea joto"],
  ["chuma", "Sindano ya madini chuma"],
]);

export type ProductKind = "milk" | "dairy" | "eggs" | "hide";
export const LIVESTOCK_PRODUCTS: (Option & { unit: string; kind: ProductKind })[] = [
  { value: "maziwa_asili", label: "Maziwa ya ng’ombe wa asili", unit: "lita", kind: "milk" },
  { value: "maziwa_kisasa", label: "Maziwa ya ng’ombe wa kisasa", unit: "lita", kind: "milk" },
  { value: "jibini", label: "Jibini (Cheese)", unit: "kg", kind: "dairy" },
  { value: "siagi", label: "Siagi (Butter)", unit: "kg", kind: "dairy" },
  { value: "samli", label: "Samli (Ghee)", unit: "kg", kind: "dairy" },
  { value: "mayai_kienyeji", label: "Mayai ya kuku wa kienyeji", unit: "mayai", kind: "eggs" },
  { value: "mayai_kisasa", label: "Mayai ya kuku wa kisasa", unit: "mayai", kind: "eggs" },
  { value: "ngozi_ngombe", label: "Ngozi za ng’ombe", unit: "vipande", kind: "hide" },
  { value: "ngozi_mbuzi", label: "Ngozi za mbuzi", unit: "vipande", kind: "hide" },
  { value: "ngozi_kondoo", label: "Ngozi za kondoo", unit: "vipande", kind: "hide" },
];

export const HIDE_PROCESSING = opts([
  ["jua", "Zilizokaushwa kwa jua"],
  ["chumvi", "Zilizokaushwa kwa chumvi"],
  ["wet_blue", "Wet Blue"],
]);

export const HIDE_PRICE_AT = opts([
  ["machinjioni", "Machinjioni"],
  ["kiwandani", "Kiwandani"],
]);

export const SEVERITY = opts([
  ["kubwa", "Kubwa"],
  ["wastani", "Wastani"],
  ["kidogo", "Kidogo"],
]);

export const RAIN_LEVELS = opts([
  ["nyingi", "Nyingi"],
  ["wastani", "Wastani"],
  ["kidogo", "Kidogo"],
  ["hakuna", "Hakuna"],
]);

export const EVENT_KINDS = opts([
  ["ukame", "Ukame"],
  ["mafuriko", "Mafuriko"],
  ["njaa", "Njaa"],
  ["migogoro", "Migogoro"],
  ["magonjwa_mimea", "Magonjwa ya mimea"],
  ["magonjwa_mifugo", "Magonjwa ya mifugo"],
  ["moto", "Moto"],
  ["nyingine", "Jingine"],
]);

export const TRAINING_METHODS = opts([
  ["shamba_darasa", "Shamba darasa"],
  ["mkutano", "Mkutano"],
  ["nyumba_kwa_nyumba", "Nyumba kwa nyumba"],
  ["onyesho", "Onyesho"],
  ["ziara", "Ziara ya mafunzo"],
]);

export const CONTROL_METHODS = opts([
  ["kemikali", "Kemikali"],
  ["kibaiolojia", "Kibaiolojia / asili"],
]);

export const AMOUNT_UNITS = opts([
  ["kg", "kg"],
  ["lita", "lita"],
]);

export const PRICE_TYPES = opts([
  ["shambani", "Shambani"],
  ["sokoni", "Sokoni"],
  ["jumla", "Jumla"],
  ["rejareja", "Rejareja"],
]);

export const PRICE_UNITS = opts([
  ["kg", "kg"],
  ["debe", "Debe"],
  ["gunia", "Gunia"],
  ["lita", "Lita"],
  ["kipande", "Kipande"],
  ["trei", "Trei"],
]);

export const PRICE_COMMODITIES = [
  ...ALL_CROPS.filter((c) => c.value !== "nyingine"),
  ...LIVESTOCK_PRODUCTS.map((p) => ({ value: p.value, label: p.label })),
  { value: "nyama_ngombe", label: "Nyama ya ng’ombe" },
  { value: "nyama_mbuzi", label: "Nyama ya mbuzi" },
  { value: "samaki", label: "Samaki" },
  { value: "nyingine", label: "Nyingine" },
];

export const FISH_SYSTEMS = opts([
  ["bwawa", "Mabwawa"],
  ["kizimba", "Vizimba"],
  ["tanki", "Matanki"],
  ["chelezo", "Chelezo"],
]);

/** Typing suggestions, not restrictions: officers can write what they see. */
export const SUGGEST_PESTS = [
  "Viwavijeshi vamizi (Fall armyworm)",
  "Kantangaze (Tuta absoluta)",
  "Panya",
  "Kwelea kwelea",
  "Nzige",
  "Vidukari (Aphids)",
  "Batobato ya mihogo (CMD)",
  "Michirizi kahawia ya mihogo (CBSD)",
  "Ugonjwa wa kunyauka kwa mnyanya",
  "Kutu ya majani",
  "Dumuzi (Larger grain borer)",
];

export const SUGGEST_LIVESTOCK_DISEASES = [
  "Ndigana kali (ECF)",
  "Ndigana baridi (Anaplasmosis)",
  "Kimeta (Anthrax)",
  "Homa ya mapafu (CBPP)",
  "Sotoka ya mbuzi (PPR)",
  "Ugonjwa wa miguu na midomo (FMD)",
  "Kideri (Newcastle)",
  "Ndui ya kuku",
  "Minyoo",
  "Kiwele (Mastitis)",
  "Utoaji kondo la nyuma (Distokia)",
  "Utoaji gesi (Bloat)",
  "Utokaji mimba (Abortion)",
  "Kuumwa nyoka (Snakebite)",
  "Milk fever",
];

export const SUGGEST_FISH = ["Sato (Tilapia)", "Kambale (Catfish)", "Kamongo"];

export function labelOf(list: readonly Option[], value: unknown): string {
  return list.find((o) => o.value === value)?.label ?? (typeof value === "string" ? value : "");
}
