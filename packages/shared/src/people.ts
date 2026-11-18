/**
 * Who someone is: full name, phone and public-service check number. The check
 * number is the sign-in name; it identifies an officer across councils.
 */

/** Digits only: "1112 3456 7" → "111234567". */
export function normalizeCheckNumber(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/** A public-service check number: 5 to 12 digits. */
export function isValidCheckNumber(raw: string): boolean {
  return /^\d{5,12}$/.test(normalizeCheckNumber(raw));
}

/** "+255 712 345 678", "255712345678", "0712 345 678" → "0712345678". */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^\+?255\d{9}$/.test(d)) return `0${d.replace(/^\+?255/, "")}`;
  return d;
}

/** Tanzanian mobile number (06x or 07x, ten digits). */
export function isValidPhone(raw: string): boolean {
  return /^0[67]\d{8}$/.test(normalizePhone(raw));
}

/** At least two names, each two letters or more. */
export function isFullName(raw: string): boolean {
  const parts = raw.trim().split(/\s+/).filter((p) => p.replace(/[^\p{L}]/gu, "").length >= 2);
  return parts.length >= 2;
}

/** Collapse spaces; keep the officer's own capitalisation. */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export type RegistrationProblem = "name" | "phone" | "checkNumber" | "password";

export function registrationProblems(f: { name: string; phone: string; checkNumber: string; password: string }): RegistrationProblem[] {
  const out: RegistrationProblem[] = [];
  if (!isFullName(f.name)) out.push("name");
  if (!isValidPhone(f.phone)) out.push("phone");
  if (!isValidCheckNumber(f.checkNumber)) out.push("checkNumber");
  if (f.password.length < 8) out.push("password");
  return out;
}

/** "ASHA juma MRISHO" → "Asha Juma Mrisho"; a capital after spaces and hyphens, not after the apostrophe in "Ng’wanakilala". */
export function titleCaseName(raw: string): string {
  return cleanName(raw)
    .toLocaleLowerCase("sw")
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("sw"));
}

/**
 * A name that fits on one line: title case, and when it is long, middle names
 * become initials ("Asha Juma Mrisho Mohamed" → "Asha J. M. Mohamed"), then
 * only the first and last names remain. Whatever is still too long is cut by
 * the screen (ellipsis), with the full name in a tooltip.
 */
export function displayName(raw: string | null | undefined, max = 22): string {
  if (!raw?.trim()) return "";
  const full = titleCaseName(raw);
  if (full.length <= max) return full;
  const parts = full.split(" ");
  if (parts.length <= 2) return full;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const initials = `${first} ${parts.slice(1, -1).map((p) => `${p[0]}.`).join(" ")} ${last}`;
  return initials.length <= max ? initials : `${first} ${last}`;
}

/** Up to two letters for an avatar: first and last name. */
export function initialsOf(raw: string | null | undefined): string {
  const parts = (raw ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = parts[0]![0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (a + b).toLocaleUpperCase("sw");
}
