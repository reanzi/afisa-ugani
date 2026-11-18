/**
 * Council codes: 8 characters, letters and digits, shown as "ABCD-EFGH".
 * Generated codes avoid look-alikes (0/O, 1/I/L) so they survive being read
 * aloud over the phone or copied from paper.
 */

export const COUNCIL_CODE_LENGTH = 8;
export const COUNCIL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Upper-case, drop separators and anything that is not A–Z or 0–9. */
export function normalizeCouncilCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidCouncilCode(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}

/** "ABCDEFGH" → "ABCD-EFGH". Partial codes are grouped as far as they go. */
export function formatCouncilCode(code: string): string {
  const c = normalizeCouncilCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** A new random code. `random` returns integers in [0, n); pass a crypto-backed source. */
export function generateCouncilCode(random: (n: number) => number): string {
  let out = "";
  for (let i = 0; i < COUNCIL_CODE_LENGTH; i++) out += COUNCIL_CODE_ALPHABET[random(COUNCIL_CODE_ALPHABET.length)];
  return out;
}
