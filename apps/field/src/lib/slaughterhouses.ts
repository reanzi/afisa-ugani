import { useEffect, useMemo } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { slaughterhouseOffered, workAreaIds } from "@afisa/shared";
import { db, setMeta } from "./db";
import { useWork } from "./session";
import { useMyAreas } from "./areas";

export type Slaughterhouse = FunctionReturnType<typeof api.slaughterhouses.list>[number];

/**
 * The council's slaughterhouses, cached for offline use: `offered` are the
 * ones this officer may pick (in their areas, serving their areas, or open
 * to the whole council); `byId` has all, so old records still show names.
 */
export function useSlaughterhouses(): { offered: Slaughterhouse[]; byId: Map<string, Slaughterhouse> } {
  const { councilId, membership } = useWork();
  const { isAuthenticated } = useConvexAuth();
  const { byId: areasById } = useMyAreas();
  const key = `slaughterhouses:${councilId}`;
  const live = useQuery(api.slaughterhouses.list, isAuthenticated ? { councilId: councilId as Id<"councils"> } : "skip");
  const cached = useLiveQuery(async () => (await db.meta.get(key))?.value as Slaughterhouse[] | undefined, [key]);

  useEffect(() => {
    if (live) void setMeta(key, live);
  }, [live, key]);

  return useMemo(() => {
    const all = live ?? cached ?? [];
    const byId = new Map(all.map((h) => [h._id as string, h]));
    // HQ people work everywhere: offer every open slaughterhouse.
    if (membership.role !== "officer") return { offered: all.filter((h) => h.status === "active"), byId };
    const areas = [...areasById.values()].map((a) => ({ _id: a._id as string, parentId: (a.parentId as string | null) ?? null }));
    const work = workAreaIds(membership.areaIds, areas);
    return { offered: all.filter((h) => slaughterhouseOffered(h, work)), byId };
  }, [live, cached, membership, areasById]);
}
