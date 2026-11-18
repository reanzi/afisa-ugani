/**
 * Groundwork for the research module (see docs/RESEARCH.md): photos with
 * their labels, anonymised, for building datasets. Root only for now; a
 * researcher role and the separate research app come with the module.
 *
 * Nothing here names a person: no officer or farmer names, no phone numbers,
 * location rounded to about 10 km, time to the month.
 */
import { v } from "convex/values";
import { monthKey, photoLabels, toCouncilWallClock } from "@afisa/shared";
import { rootQuery } from "./lib/guards";

export const photoDataset = rootQuery({
  args: { after: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { after, limit }) => {
    const take = Math.min(Math.max(limit ?? 100, 1), 500);
    const page = await ctx.db
      .query("media")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", after ?? 0))
      .order("asc")
      .take(take);
    const items = [];
    for (const m of page) {
      if (m.deletedAt) continue;
      const record = await ctx.db
        .query("records")
        .withIndex("by_clientId", (q) => q.eq("clientId", m.recordClientId))
        .unique();
      if (!record || record.deletedAt) continue;
      const area = record.areaId ? await ctx.db.get(record.areaId) : null;
      const ward = area?.kind === "ward" ? area : area?.parentId ? await ctx.db.get(area.parentId) : null;
      const council = await ctx.db.get(m.councilId);
      const url = await ctx.storage.getUrl(m.storageId);
      if (!url) continue;
      items.push({
        id: m.clientId,
        url,
        width: m.width,
        height: m.height,
        shot: m.shot,
        caption: m.caption ?? null,
        month: monthKey(toCouncilWallClock(m.takenAt)),
        region: council?.region ?? null,
        ward: ward?.name ?? null,
        geo: record.geo ? { lat: Math.round(record.geo.lat * 10) / 10, lng: Math.round(record.geo.lng * 10) / 10 } : null,
        labels: photoLabels({ type: record.type, section: record.section, payload: record.payload as Record<string, unknown> }),
      });
    }
    return { items, next: page.length === take ? page[page.length - 1]!._creationTime : null };
  },
});
