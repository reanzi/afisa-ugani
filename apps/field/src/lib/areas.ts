import { useEffect, useMemo } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { db, setMeta } from "./db";
import { useWork } from "./session";

export type Area = FunctionReturnType<typeof api.areas.list>[number];

/**
 * The areas this person works in, cached for offline use. Officers get their
 * assigned villages, plus every village of an assigned ward. HQ users get all.
 */
export function useMyAreas(): { wards: Area[]; villages: Area[]; byId: Map<string, Area> } {
  const { councilId, membership } = useWork();
  const { isAuthenticated } = useConvexAuth();
  const key = `areas:${councilId}`;
  const live = useQuery(api.areas.list, isAuthenticated ? { councilId: councilId as Id<"councils"> } : "skip");
  const cached = useLiveQuery(async () => (await db.meta.get(key))?.value as Area[] | undefined, [key]);

  useEffect(() => {
    if (live) void setMeta(key, live);
  }, [live, key]);

  return useMemo(() => {
    const all = live ?? cached ?? [];
    const byId = new Map(all.map((a) => [a._id as string, a]));
    const assigned = new Set<string>(membership.areaIds);
    const scoped =
      membership.role === "officer"
        ? all.filter((a) => assigned.has(a._id) || (a.parentId !== null && assigned.has(a.parentId)))
        : all;
    return {
      wards: scoped.filter((a) => a.kind === "ward"),
      villages: scoped.filter((a) => a.kind === "village"),
      byId,
    };
  }, [live, cached, membership]);
}
