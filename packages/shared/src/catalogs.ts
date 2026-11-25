/**
 * Fixed lists from the July 2018 VAEO/WAEO form. Values are stable ids
 * (stored in records); labels are what officers and the printed form show.
 */

import { textLang } from "./lang.ts";

/**
 * `label` is the name in the current screen language (Swahili on official
 * forms, which are built in Swahili); `sw` and `en` are the fixed names.
 */
export type Option = { readonly value: string; readonly label: string; readonly sw?: string; readonly en?: string; readonly hint?: string };

/** An option whose `label` follows the screen language. */
/** Every Swahili catalog text with its English, for text already saved in Swahili. */
const SW_TO_EN = new Map<string, string>();
export const rememberText = (sw: string, en: string | undefined) => remember(sw, en);
const remember = (sw: string, en: string | undefined) => {
  if (en && !SW_TO_EN.has(sw.toLowerCase())) SW_TO_EN.set(sw.toLowerCase(), en);
};

/**
 * Show a catalog text that was saved in Swahili (report rows, older records)
 * in the language chosen now. Unknown text is returned as it is.
 */
export function catalogText(sw: string): string {
  if (textLang() !== "en") return sw;
  const en = SW_TO_EN.get(sw.trim().toLowerCase());
  if (!en) return sw;
  return sw[0] === sw[0]?.toUpperCase() ? en : en.toLowerCase();
}

export function opt(value: string, sw: string, en?: string): Option {
  remember(sw, en);
  return {
    value,
    sw,
    en,
    get label() {
      return textLang() === "en" && en ? en : sw;
    },
  };
}

const opts = (pairs: [string, string, string?][]): Option[] => pairs.map(([value, sw, en]) => opt(value, sw, en));

/** Crops listed in tables 2.1 and 2.2, in the form's order. */
export const CROPS = opts([
  ["mahindi", "Mahindi", "Maize"],
  ["mpunga", "Mpunga", "Rice (paddy)"],
  ["mtama", "Mtama", "Sorghum"],
  ["uwele", "Uwele", "Bulrush millet"],
  ["ulezi", "Ulezi", "Finger millet"],
  ["ngano", "Ngano", "Wheat"],
  ["mihogo", "Mihogo", "Cassava"],
  ["viazi_vitamu", "Viazi vitamu", "Sweet potatoes"],
  ["viazi_mviringo", "Viazi mviringo", "Irish potatoes"],
  ["kunde", "Kunde", "Cowpeas"],
  ["maharage", "Maharage", "Beans"],
  ["ndizi_mbivu", "Ndizi mbivu", "Ripe bananas"],
  ["ndizi_mbichi", "Ndizi mbichi", "Cooking bananas"],
]);

/** Other crops officers commonly price or report pests on. */
export const OTHER_CROPS = opts([
  ["alizeti", "Alizeti", "Sunflower"],
  ["karanga", "Karanga", "Groundnuts"],
  ["ufuta", "Ufuta", "Sesame"],
  ["pamba", "Pamba", "Cotton"],
  ["korosho", "Korosho", "Cashew"],
  ["kahawa", "Kahawa", "Coffee"],
  ["chai", "Chai", "Tea"],
  ["tumbaku", "Tumbaku", "Tobacco"],
  ["mbogamboga", "Mbogamboga", "Vegetables"],
  ["matunda", "Matunda", "Fruit"],
  ["nyingine", "Nyingine", "Other"],
]);

export const ALL_CROPS = [...CROPS, ...OTHER_CROPS];

/** Table 4 rows (slaughter). */
export const SLAUGHTER_ANIMALS = opts([
  ["ngombe", "Ng’ombe", "Cattle"],
  ["kondoo", "Kondoo", "Sheep"],
  ["mbuzi", "Mbuzi", "Goats"],
  ["nguruwe", "Nguruwe", "Pigs"],
  ["kuku_asili", "Kuku wa asili", "Local chickens"],
  ["kuku_kisasa", "Kuku wa kisasa", "Improved chickens"],
  ["mengineyo", "Mengineyo", "Others"],
]);

/** Animals for treatment, vaccination and services (tables 7.1–7.3). */
export const ANIMALS = opts([
  ["ngombe", "Ng’ombe", "Cattle"],
  ["mbuzi", "Mbuzi", "Goats"],
  ["kondoo", "Kondoo", "Sheep"],
  ["nguruwe", "Nguruwe", "Pigs"],
  ["kuku", "Kuku", "Chickens"],
  ["bata", "Bata", "Ducks"],
  ["mbwa", "Mbwa", "Dogs"],
  ["paka", "Paka", "Cats"],
  ["punda", "Punda", "Donkeys"],
  ["mengineyo", "Mengineyo", "Others"],
]);

/** Table 7.3 rows. */
export const SERVICE_ANIMALS = opts([
  ["ngombe", "Ng’ombe", "Cattle"],
  ["mbuzi", "Mbuzi", "Goats"],
  ["kondoo", "Kondoo", "Sheep"],
  ["nguruwe", "Nguruwe", "Pigs"],
  ["kuku", "Kuku", "Chickens"],
  ["bata", "Bata", "Ducks"],
]);

/** Table 7.3 columns. */
export const LIVESTOCK_SERVICES = opts([
  ["kwato", "Kukata kwato", "Hoof trimming"],
  ["kuhasi", "Kuhasi", "Castration"],
  ["ai", "Kuhamilisha (AI)", "Artificial insemination (AI)"],
  ["pembe", "Kukata pembe", "Dehorning"],
  ["alama", "Kuweka alama", "Marking"],
  ["midomo", "Kukata midomo", "Beak trimming"],
  ["mikia", "Kukata mikia", "Tail docking"],
  ["meno", "Kukata meno", "Teeth clipping"],
  ["hereni", "Hereni ya puani (Bull ring)", "Bull ring"],
  ["mimba", "Upimaji wa mimba", "Pregnancy testing"],
  ["joto", "Sindano ya kuchochea joto", "Heat induction injection"],
  ["chuma", "Sindano ya madini chuma", "Iron injection"],
]);

export type ProductKind = "milk" | "dairy" | "eggs" | "hide";
type Product = Option & { readonly unit: string; readonly each: string; readonly kind: ProductKind };
/** `unit` is how quantities are counted ("lita", "mayai"); `each` one of them, for prices ("yai"). */
function product(value: string, sw: string, en: string, kind: ProductKind, unit: [string, string], each: [string, string]): Product {
  remember(unit[0], unit[1]);
  remember(each[0], each[1]);
  return Object.defineProperties(opt(value, sw, en), {
    kind: { value: kind, enumerable: true },
    unit: { get: () => (textLang() === "en" ? unit[1] : unit[0]), enumerable: true },
    each: { get: () => (textLang() === "en" ? each[1] : each[0]), enumerable: true },
  }) as Product;
}
const LITRE: [string, string] = ["lita", "litres"];
const KG: [string, string] = ["kg", "kg"];
export const LIVESTOCK_PRODUCTS: Product[] = [
  product("maziwa_asili", "Maziwa ya ng’ombe wa asili", "Milk from local cattle", "milk", LITRE, ["lita", "litre"]),
  product("maziwa_kisasa", "Maziwa ya ng’ombe wa kisasa", "Milk from improved cattle", "milk", LITRE, ["lita", "litre"]),
  product("jibini", "Jibini (Cheese)", "Cheese", "dairy", KG, KG),
  product("siagi", "Siagi (Butter)", "Butter", "dairy", KG, KG),
  product("samli", "Samli (Ghee)", "Ghee", "dairy", KG, KG),
  product("mayai_kienyeji", "Mayai ya kuku wa kienyeji", "Local chicken eggs", "eggs", ["mayai", "eggs"], ["yai", "egg"]),
  product("mayai_kisasa", "Mayai ya kuku wa kisasa", "Improved chicken eggs", "eggs", ["mayai", "eggs"], ["yai", "egg"]),
  product("ngozi_ngombe", "Ngozi za ng’ombe", "Cattle hides", "hide", ["vipande", "pieces"], ["kg", "kg"]),
  product("ngozi_mbuzi", "Ngozi za mbuzi", "Goat skins", "hide", ["vipande", "pieces"], ["kipande", "piece"]),
  product("ngozi_kondoo", "Ngozi za kondoo", "Sheep skins", "hide", ["vipande", "pieces"], ["kipande", "piece"]),
];

export const HIDE_PROCESSING = opts([
  ["jua", "Zilizokaushwa kwa jua", "Sun dried"],
  ["chumvi", "Zilizokaushwa kwa chumvi", "Salt dried"],
  ["wet_blue", "Wet Blue", "Wet blue"],
]);

export const HIDE_PRICE_AT = opts([
  ["machinjioni", "Machinjioni", "At the slaughterhouse"],
  ["kiwandani", "Kiwandani", "At the factory"],
]);

export const SEVERITY = opts([
  ["kubwa", "Kubwa", "Severe"],
  ["wastani", "Wastani", "Moderate"],
  ["kidogo", "Kidogo", "Light"],
]);

export const RAIN_LEVELS = opts([
  ["nyingi", "Nyingi", "Heavy"],
  ["wastani", "Wastani", "Moderate"],
  ["kidogo", "Kidogo", "Light"],
  ["hakuna", "Hakuna", "None"],
]);

export const EVENT_KINDS = opts([
  ["ukame", "Ukame", "Drought"],
  ["mafuriko", "Mafuriko", "Floods"],
  ["njaa", "Njaa", "Hunger"],
  ["migogoro", "Migogoro", "Conflicts"],
  ["magonjwa_mimea", "Magonjwa ya mimea", "Crop diseases"],
  ["magonjwa_mifugo", "Magonjwa ya mifugo", "Livestock diseases"],
  ["moto", "Moto", "Fire"],
  ["nyingine", "Jingine", "Other"],
]);

export const TRAINING_METHODS = opts([
  ["shamba_darasa", "Shamba darasa", "Farmer field school"],
  ["mkutano", "Mkutano", "Meeting"],
  ["nyumba_kwa_nyumba", "Nyumba kwa nyumba", "House to house"],
  ["onyesho", "Onyesho", "Demonstration"],
  ["ziara", "Ziara ya mafunzo", "Study tour"],
]);

export const CONTROL_METHODS = opts([
  ["kemikali", "Kemikali", "Chemical"],
  ["kibaiolojia", "Kibaiolojia / asili", "Biological / natural"],
]);

export const AMOUNT_UNITS = opts([
  ["kg", "kg", "kg"],
  ["lita", "lita", "litre"],
]);

/** Fertilizers recorded per farmer (one entry is one farmer's farm). */
export const FERTILIZERS = opts([
  ["dap", "DAP", "DAP"],
  ["urea", "UREA", "Urea"],
  ["can", "CAN", "CAN"],
  ["npk", "NPK", "NPK"],
  ["sa", "SA (Salfeti ya Amonia)", "SA (Sulphate of Ammonia)"],
  ["minjingu", "Minjingu", "Minjingu"],
  ["tsp", "TSP", "TSP"],
  ["majani", "Mbolea ya majani (foliar)", "Foliar fertilizer"],
  ["samadi", "Samadi", "Farmyard manure"],
  ["mboji", "Mboji", "Compost"],
  ["nyingine", "Nyingine", "Other"],
]);

/** Organic fertilizers: counted apart from bought (industrial) fertilizer. */
export const ORGANIC_FERTILIZERS: readonly string[] = ["samadi", "mboji"];

export const FERTILIZER_UNITS = opts([
  ["kg", "kg", "kg"],
  ["mfuko", "Mfuko wa kg 50", "50 kg bag"],
  ["tani", "Tani", "Tonne"],
  ["lita", "Lita", "Litre"],
]);

/** Kilograms in one unit; litres stay litres (foliar). */
export const FERTILIZER_KG: Record<string, number> = { kg: 1, mfuko: 50, tani: 1000 };

/** Kinds of registered slaughter places. */
export const SLAUGHTERHOUSE_KINDS = opts([
  ["machinjio", "Machinjio (abattoir)", "Abattoir"],
  ["slab", "Slab ya kuchinjia", "Slaughter slab"],
  ["kuku", "Kituo cha kuchinja kuku", "Poultry slaughter point"],
  ["nyingine", "Nyingine", "Other"],
]);

export const YES_NO = opts([
  ["ndiyo", "Ndiyo", "Yes"],
  ["hapana", "Hapana", "No"],
]);

export const PRICE_TYPES = opts([
  ["sokoni", "Sokoni", "Market"],
  ["rejareja", "Dukani (rejareja)", "Shop (retail)"],
  ["jumla", "Jumla", "Wholesale"],
  ["shambani", "Shambani", "Farm gate"],
]);

export const PRICE_UNITS = opts([
  ["kg", "kg", "kg"],
  ["lita", "Lita", "Litre"],
  ["kipande", "Kipande", "Piece"],
  ["mfuko", "Mfuko / pakiti", "Bag / packet"],
  ["fungu", "Fungu", "Heap"],
  ["debe", "Debe", "Tin (debe)"],
  ["gunia", "Gunia", "Sack"],
  ["trei", "Trei", "Tray"],
]);

export const AVAILABILITY = opts([
  ["wingi", "Inapatikana kwa wingi", "Plentiful"],
  ["wastani", "Wastani", "Moderate"],
  ["haba", "Haba", "Scarce"],
  ["haipatikani", "Haipatikani", "Not available"],
]);

/** Common foods and shop items; officers can type anything else. */
export const SUGGEST_FOODS = [
  "Mchele",
  "Unga wa mahindi (sembe)",
  "Unga wa dona",
  "Mahindi",
  "Maharage",
  "Sukari",
  "Mafuta ya kupikia",
  "Chumvi",
  "Unga wa ngano",
  "Viazi mviringo",
  "Viazi vitamu",
  "Mihogo",
  "Ndizi",
  "Kunde",
  "Mbaazi",
  "Dengu",
  "Karanga",
  "Mtama",
  "Nyama ya ng’ombe",
  "Nyama ya mbuzi",
  "Kuku",
  "Samaki",
  "Dagaa",
  "Maziwa",
  "Mayai",
  "Nyanya",
  "Vitunguu",
];

export const PRICE_COMMODITIES = [
  ...ALL_CROPS.filter((c) => c.value !== "nyingine"),
  ...LIVESTOCK_PRODUCTS,
  opt("nyama_ngombe", "Nyama ya ng’ombe", "Beef"),
  opt("nyama_mbuzi", "Nyama ya mbuzi", "Goat meat"),
  opt("samaki", "Samaki", "Fish"),
  opt("nyingine", "Nyingine", "Other"),
];

export const FISH_SYSTEMS = opts([
  ["bwawa", "Mabwawa", "Ponds"],
  ["kizimba", "Vizimba", "Cages"],
  ["tanki", "Matanki", "Tanks"],
  ["chelezo", "Chelezo", "Rafts"],
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

/** Display name of a priced item: older entries stored a catalogue id ("mahindi"), newer ones the typed name. */
export function commodityLabel(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  return PRICE_COMMODITIES.find((o) => o.value === v)?.label ?? v.charAt(0).toUpperCase() + v.slice(1);
}

/** Key for grouping prices: "Unga wa Mahindi (Sembe)", "unga wa mahindi  (sembe)" and the id agree. */
export function commodityKey(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  const id = PRICE_COMMODITIES.find((o) => o.value === v);
  return (id?.sw ?? v)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9()]+/g, " ")
    .trim();
}

/** The Swahili label: for official forms and stored text. */
export function labelOf(list: readonly Option[], value: unknown): string {
  return list.find((o) => o.value === value)?.label ?? (typeof value === "string" ? value : "");
}
