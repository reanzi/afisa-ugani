import { getLang } from "./i18n";

const DAYS_SW = ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_SW = [
  "Januari", "Februari", "Machi", "Aprili", "Mei", "Juni",
  "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const en = () => getLang() === "en";
// Read at call time so text follows the language switch.
const days = () => (en() ? DAYS_EN : DAYS_SW);
const months = () => (en() ? MONTHS_EN : MONTHS_SW);

/** "Jumanne, 17 Novemba" */
export function dayTitle(d: Date): string {
  return `${days()[d.getDay()]}, ${d.getDate()} ${months()[d.getMonth()]}`;
}

/** "17 Nov 2026" */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${months()[d.getMonth()]!.slice(0, 3)} ${d.getFullYear()}`;
}

/** "14:05" (24-hour clock, as used on official forms) */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function monthName(month: number): string {
  return months()[month] ?? "";
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
    return en() ? "No connection. Try again when you are online." : "Hakuna mtandao. Jaribu tena ukipata mtandao.";
  }
  return en() ? "Something went wrong. Try again." : "Kuna hitilafu. Jaribu tena.";
}

/** Text for the user errors returned by convex-auth sign-in/sign-up. The sign-in name is the check number. */
export function authErrorMessage(err: { error: string; minimumLength?: number; maximumLength?: number; retryAfterMs?: number }): string {
  const t = (sw: string, e: string) => (en() ? e : sw);
  switch (err.error) {
    case "USER_NOT_FOUND":
      return t("Hakuna akaunti yenye namba hii ya utumishi. Angalia namba, au fungua akaunti.", "No account has this check number. Check the number, or create an account.");
    case "INVALID_CREDENTIALS":
      return t("Nenosiri si sahihi.", "The password is not correct.");
    case "RATE_LIMITED": {
      const mins = Math.max(1, Math.ceil((err.retryAfterMs ?? 60_000) / 60_000));
      return t(`Majaribio mengi mno. Subiri dakika ${mins} kisha ujaribu tena.`, `Too many attempts. Wait ${mins} minute(s) and try again.`);
    }
    case "USERNAME_TAKEN":
      return t("Namba hii ya utumishi tayari ina akaunti. Ingia badala yake.", "This check number already has an account. Sign in instead.");
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
    case "USERNAME_HAS_INVALID_CHARACTERS":
    case "USERNAME_HAS_SURROUNDING_WHITESPACE":
      return t("Namba ya utumishi iwe tarakimu 5 hadi 12.", "The check number should be 5 to 12 digits.");
    case "PASSWORD_TOO_SHORT":
      return t(`Nenosiri liwe na herufi ${err.minimumLength ?? 8} au zaidi.`, `The password needs ${err.minimumLength ?? 8} or more characters.`);
    case "PASSWORD_TOO_LONG":
      return t("Nenosiri ni refu mno.", "The password is too long.");
    case "PASSWORD_TOO_COMMON":
      return t("Nenosiri hili linajulikana sana. Chagua jingine gumu zaidi.", "This password is too common. Choose a harder one.");
    case "PASSWORD_HAS_SURROUNDING_WHITESPACE":
      return t("Nenosiri lisianze wala kuishia na nafasi.", "The password cannot start or end with a space.");
    default:
      return t("Imeshindikana. Angalia mtandao kisha ujaribu tena.", "That did not work. Check the connection and try again.");
  }
}

/** "leo 14:05", "jana 09:30", or "17 Nov" for older times. */
export function relativeWhen(ms: number, now = Date.now()): string {
  const day = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const diff = Math.round((day(now) - day(ms)) / 86_400_000);
  if (diff === 0) return `${en() ? "today" : "leo"} ${clock(ms)}`;
  if (diff === 1) return `${en() ? "yesterday" : "jana"} ${clock(ms)}`;
  const d = new Date(ms);
  return `${d.getDate()} ${months()[d.getMonth()]!.slice(0, 3)}`;
}
