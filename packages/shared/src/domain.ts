/**
 * Core vocabulary shared by the backend, the Field PWA and HQ.
 * Plain values only — no Convex or React imports — so every runtime can use it.
 */

export const SECTIONS = ["kilimo", "mifugo", "uvuvi"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, { sw: string; en: string }> = {
  kilimo: { sw: "Kilimo", en: "Crops" },
  mifugo: { sw: "Mifugo", en: "Livestock" },
  uvuvi: { sw: "Uvuvi", en: "Fisheries" },
};

/**
 * Roles are held per council membership. `root` is not a role: it is a
 * global, hidden flag on the user.
 */
export const ROLES = [
  "admin", // Head of Department — all three sections
  "moderator", // Vice HoD — all three sections
  "section_head",
  "section_vice", // same powers as section_head
  "officer", // VAEO / WAEO
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, { sw: string; en: string }> = {
  admin: { sw: "Mkuu wa Idara", en: "Head of Department" },
  moderator: { sw: "Naibu Mkuu wa Idara", en: "Vice Head of Department" },
  section_head: { sw: "Mkuu wa Sehemu", en: "Head of Section" },
  section_vice: { sw: "Naibu Mkuu wa Sehemu", en: "Vice Head of Section" },
  officer: { sw: "Afisa Ugani", en: "Extension Officer" },
};

export const HQ_ROLES: readonly Role[] = [
  "admin",
  "moderator",
  "section_head",
  "section_vice",
];

/** Roles that see and act on every section of their council. */
export const DEPARTMENT_ROLES: readonly Role[] = ["admin", "moderator"];

/** Roles that head a single section (their primary section). */
export const SECTION_LEAD_ROLES: readonly Role[] = [
  "section_head",
  "section_vice",
];

export const OFFICER_LEVELS = ["vaeo", "waeo"] as const;
export type OfficerLevel = (typeof OFFICER_LEVELS)[number];

export const MEMBERSHIP_STATUSES = [
  "pending",
  "active",
  "suspended",
  "rejected",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const AREA_KINDS = ["ward", "village"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

export const APPS = ["field", "hq"] as const;
export type AppName = (typeof APPS)[number];

/**
 * Bump when the shape of what the Field app sends to `sync.pushRecords`
 * changes. The server keeps accepting every version it lists in
 * SUPPORTED_PAYLOAD_VERSIONS, because phones can run an old cached app for weeks.
 */
export const PAYLOAD_VERSION = 1;
export const SUPPORTED_PAYLOAD_VERSIONS: readonly number[] = [1];

/** Max records per push, to stay well inside Convex mutation limits. */
export const SYNC_PUSH_BATCH = 50;
/** Max records per pull page. */
export const SYNC_PULL_PAGE = 200;

/** Compare dotted versions ("1.2.10" > "1.2.9"). Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
