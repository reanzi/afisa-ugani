const DAYS = ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"];
const MONTHS = [
  "Januari", "Februari", "Machi", "Aprili", "Mei", "Juni",
  "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba",
];

/** "Jumanne, 17 Novemba" */
export function dayTitle(d: Date): string {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "17 Nov 2026" */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]!.slice(0, 3)} ${d.getFullYear()}`;
}

/** "14:05" (24-hour clock, as used on official forms) */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function monthName(month: number): string {
  return MONTHS[month] ?? "";
}

export function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** Readable message from a Convex error ({code, message}) or anything else. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "data" in e) {
    const data = (e as { data: unknown }).data;
    if (data && typeof data === "object" && "message" in data) return String((data as { message: unknown }).message);
    if (typeof data === "string") return data;
  }
  if (e instanceof Error && /fetch|network|connection/i.test(e.message)) {
    return "Hakuna mtandao. Jaribu tena ukipata mtandao.";
  }
  return "Kuna hitilafu. Jaribu tena.";
}

/** Swahili text for the user errors returned by convex-auth sign-in/sign-up. */
export function authErrorMessage(err: { error: string; minimumLength?: number; maximumLength?: number; retryAfterMs?: number }): string {
  switch (err.error) {
    case "USER_NOT_FOUND":
      return "Hakuna akaunti yenye jina hili. Angalia jina au jisajili.";
    case "INVALID_CREDENTIALS":
      return "Nenosiri si sahihi.";
    case "RATE_LIMITED": {
      const mins = Math.max(1, Math.ceil((err.retryAfterMs ?? 60_000) / 60_000));
      return `Majaribio mengi mno. Subiri dakika ${mins} kisha ujaribu tena.`;
    }
    case "USERNAME_TAKEN":
      return "Jina hili tayari linatumika. Ingia, au chagua jina jingine.";
    case "USERNAME_TOO_SHORT":
      return `Jina la mtumiaji liwe na herufi ${err.minimumLength ?? 3} au zaidi.`;
    case "USERNAME_TOO_LONG":
      return `Jina la mtumiaji lisizidi herufi ${err.maximumLength ?? 64}.`;
    case "USERNAME_HAS_INVALID_CHARACTERS":
    case "USERNAME_HAS_SURROUNDING_WHITESPACE":
      return "Jina la mtumiaji liwe na herufi na namba tu, bila nafasi mwanzoni au mwishoni.";
    case "PASSWORD_TOO_SHORT":
      return `Nenosiri liwe na herufi ${err.minimumLength ?? 8} au zaidi.`;
    case "PASSWORD_TOO_LONG":
      return "Nenosiri ni refu mno.";
    case "PASSWORD_TOO_COMMON":
      return "Nenosiri hili linajulikana sana. Chagua jingine gumu zaidi.";
    case "PASSWORD_HAS_SURROUNDING_WHITESPACE":
      return "Nenosiri lisianze wala kuishia na nafasi.";
    default:
      return "Imeshindikana. Angalia mtandao kisha ujaribu tena.";
  }
}
