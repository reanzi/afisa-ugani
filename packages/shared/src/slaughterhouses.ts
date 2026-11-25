/**
 * Registered slaughterhouses of a council. An officer is offered those in
 * their work areas, those that serve their areas, and those open to the
 * whole council. Anything else is recorded as an unregistered place ("nje"),
 * which HQ can then register.
 */

/** Value of `slaughterhouseId` for a place that is not registered. */
export const UNREGISTERED_PLACE = "nje";

export type SlaughterhouseLite = {
  _id: string;
  areaId: string;
  servesAreaIds: readonly string[];
  servesAll: boolean;
  status: "active" | "closed";
};

type AreaLite = { _id: string; parentId: string | null };

/** One key per unregistered place: its name (any case or spacing) and village. */
export function placeKey(name: string, areaId?: string | null): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, " ")}|${areaId ?? ""}`;
}

/**
 * Where an officer works, for offering slaughterhouses: assigned areas, the
 * villages of an assigned ward, and the ward of an assigned village.
 */
export function workAreaIds(assigned: readonly string[], areas: readonly AreaLite[]): Set<string> {
  const ids = new Set<string>(assigned);
  for (const a of areas) {
    if (a.parentId && assigned.includes(a.parentId)) ids.add(a._id);
    if (assigned.includes(a._id) && a.parentId) ids.add(a.parentId);
  }
  return ids;
}

export function slaughterhouseOffered(h: SlaughterhouseLite, work: ReadonlySet<string>): boolean {
  return h.status === "active" && (h.servesAll || work.has(h.areaId) || h.servesAreaIds.some((id) => work.has(id)));
}
