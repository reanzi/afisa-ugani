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
