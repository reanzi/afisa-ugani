/**
 * Names are stored in lower case (people, councils, regions, wards, villages,
 * streets) so the same name typed two ways is one name. Screens and reports
 * show them through `presentName`, which capitalises each word but keeps
 * Swahili and English joining words small ("Halmashauri ya Mji wa Bagamoyo")
 * and known abbreviations in capitals ("Bagamoyo TC").
 */

/** Joining words kept lower case unless they start the name. */
const SMALL = new Set(["ya", "wa", "la", "za", "cha", "vya", "kwa", "na", "katika", "of", "the", "and", "de"]);

/** Written in capitals wherever they appear. */
const UPPER = new Set(["tc", "dc", "mc", "cc", "tcc", "dcc", "or", "tamisemi", "napa", "ccm", "mjt", "ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii"]);

/** The form a name is saved in: trimmed, single spaces, lower case. */
export function storeName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function capitalise(part: string): string {
  // Leading punctuation stays ("(kati)" -> "(Kati)").
  const i = part.search(/\p{L}/u);
  if (i < 0) return part;
  return part.slice(0, i) + part.charAt(i).toLocaleUpperCase("en-US") + part.slice(i + 1);
}

function presentWord(word: string, first: boolean): string {
  const bare = word.replace(/[^\p{L}\p{N}]/gu, "");
  if (UPPER.has(bare)) return word.toLocaleUpperCase("en-US");
  if (!first && SMALL.has(bare)) return word;
  // "mwana-hamisi" -> "Mwana-Hamisi"; "or-tamisemi" handled above.
  return word
    .split("-")
    .map((p) => (UPPER.has(p.replace(/[^\p{L}\p{N}]/gu, "")) ? p.toLocaleUpperCase("en-US") : capitalise(p)))
    .join("-");
}

/** How a stored name is shown. Already-capitalised text is re-cased the same way. */
export function presentName(stored: string | null | undefined): string {
  if (!stored) return "";
  return storeName(stored)
    .split(" ")
    .map((w, i) => presentWord(w, i === 0))
    .join(" ");
}

/** For optional names: null stays null. */
export function presentMaybe(stored: string | null | undefined): string | null {
  return stored ? presentName(stored) : null;
}
