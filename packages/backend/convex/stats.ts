/**
 * One-off after deploying the council totals (lib/stats.ts): count them for
 * every council. Safe to run again at any time; it recounts from scratch.
 *   npx convex run stats:backfill
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./lib/functions";
import { countCouncilStats } from "./lib/stats";

export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const councils = await ctx.db.query("councils").collect();
    for (const c of councils) await ctx.scheduler.runAfter(0, internal.stats.recount, { councilId: c._id });
    return { councils: councils.length };
  },
});

export const recount = internalMutation({
  args: { councilId: v.id("councils") },
  handler: async (ctx, { councilId }) => {
    const council = await ctx.db.get(councilId);
    if (!council) return null;
    const stats = await countCouncilStats(ctx, councilId);
    if (!stats.headUserId) delete stats.headUserId;
    await ctx.db.patch(councilId, { stats });
    return stats;
  },
});
