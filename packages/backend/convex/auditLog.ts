import { v } from "convex/values";
import { canReadAudit, DEPARTMENT_ROLES, presentName } from "@afisa/shared";
import { fail, hiddenUserIds, hqQuery } from "./lib/guards";

/**
 * Recent audit entries for the council. Root's actions are never returned to
 * anyone but root. Section leads see entries of their section and their own.
 *
 * An officer's field entries belong to the officer until they submit a
 * report: audit rows about records and photos are shown only to their author (and root).
 * HQ sees submissions, never raw entries.
 */
export const recent = hqQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const { viewer } = ctx;
    if (!canReadAudit(viewer.actor)) fail("FORBIDDEN", "Huna ruhusa ya kuona kumbukumbu.");
    const max = Math.min(Math.max(limit ?? 100, 1), 300);
    // Over-fetch, then filter by visibility. Move to paginated queries with a
    // per-section index once volumes grow.
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_council_received", (q) => q.eq("councilId", viewer.councilId))
      .order("desc")
      .take(max * 4);
    const hidden = await hiddenUserIds(ctx, viewer);
    const seesAll = viewer.isRoot || (viewer.actor.role !== null && DEPARTMENT_ROLES.includes(viewer.actor.role));
    const visible = rows.filter((r) => {
      if (r.actorIsRoot && !viewer.isRoot) return false;
      if ((r.entity === "records" || r.entity === "media") && r.actorId !== viewer.userId && !viewer.isRoot) return false;
      if (r.actorId && hidden.has(r.actorId)) return false;
      if (seesAll) return true;
      if (r.actorId === viewer.userId) return true;
      return r.section !== undefined && viewer.authority.includes(r.section);
    });
    const names = new Map<string, string>();
    for (const r of visible.slice(0, max)) {
      if (r.actorId && !names.has(r.actorId)) {
        names.set(r.actorId, presentName((await ctx.db.get(r.actorId))?.name) || "—");
      }
    }
    return visible.slice(0, max).map((r) => ({
      _id: r._id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId ?? null,
      section: r.section ?? null,
      actorName: r.actorId ? (names.get(r.actorId) ?? "—") : "Mfumo",
      actorRole: r.actorRole ?? null,
      app: r.app ?? null,
      before: r.before ?? null,
      after: r.after ?? null,
      occurredAt: r.occurredAt,
      receivedAt: r.receivedAt,
    }));
  },
});
