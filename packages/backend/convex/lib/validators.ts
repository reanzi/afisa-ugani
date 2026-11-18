import { v } from "convex/values";
import {
  APPS,
  AREA_KINDS,
  MEMBERSHIP_STATUSES,
  OFFICER_LEVELS,
  ROLES,
  SECTIONS,
} from "@afisa/shared";

const literals = <T extends string>(values: readonly T[]) =>
  v.union(...values.map((x) => v.literal(x)));

export const vSection = literals(SECTIONS);
export const vRole = literals(ROLES);
export const vMembershipStatus = literals(MEMBERSHIP_STATUSES);
export const vOfficerLevel = literals(OFFICER_LEVELS);
export const vAreaKind = literals(AREA_KINDS);
export const vApp = literals(APPS);

/** Who sent a mutation. Informational (for the audit log), never trusted for access. */
export const vClientMeta = v.object({
  app: vApp,
  version: v.string(),
  deviceId: v.optional(v.string()),
});

export const vGeo = v.object({
  lat: v.number(),
  lng: v.number(),
  accuracy: v.number(),
  altitude: v.optional(v.number()),
  capturedAt: v.number(),
});
