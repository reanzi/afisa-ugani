/**
 * Wipe the system: every council with all its data, and every account except
 * root, so the deployment can start again from nothing. Root accounts stay so
 * someone can sign in and create the first council again.
 *
 * Off unless the deployment sets ALLOW_WIPE=true:
 *   npx convex env set ALLOW_WIPE true      # allow
 *   npx convex env remove ALLOW_WIPE        # forbid again (the default)
 *
 * The wipe runs as a job: each step deletes one batch and schedules the next,
 * so even a large deployment stays within Convex's limits per transaction.
 * Progress is kept in `settings` under "wipe". Turning ALLOW_WIPE off stops a
 * running wipe at its next step.
 *
 * What is NOT removed: root accounts, `settings` (e.g. the minimum app
 * version), and password hashes inside the auth component (it offers no way
 * to delete them; with the account and username gone they are unreachable).
 */
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { components, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { fail, rootMutation, rootQuery } from "./lib/guards";

// Convex runs functions with process.env; declared here so the browser-typed tsconfig accepts it.
declare const process: { env: Record<string, string | undefined> };

/** The phrase root types to confirm, so a stray click cannot start it. */
export const WIPE_PHRASE = "FUTA KILA KITU";

export function wipeAllowed(): boolean {
  return process.env.ALLOW_WIPE === "true";
}

/** Deleted in this order: children before the rows they point to; users last. */
const TABLES = [
  "media",
  "records",
  "submissions",
  "slaughterPlaces",
  "slaughterhouses",
  "presets",
  "councilPresets",
  "memberships",
  "areas",
  "sectionCodes",
  "councils",
  "auditLog",
  "users",
] as const satisfies readonly TableNames[];
type WipeTable = (typeof TABLES)[number];

const BATCH = 250;
const USER_BATCH = 25; // each user also needs calls into the auth components

export type WipeJob = {
  status: "running" | "done" | "stopped";
  startedAt: number;
  startedBy: string;
  finishedAt?: number;
  table?: WipeTable;
  deleted: Partial<Record<WipeTable, number>>;
  files: number;
  note?: string;
};

async function readJob(ctx: QueryCtx): Promise<{ id: Id<"settings">; job: WipeJob } | null> {
  const row = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", "wipe")).unique();
  return row ? { id: row._id, job: row.value as WipeJob } : null;
}

async function saveJob(ctx: MutationCtx, job: WipeJob) {
  const current = await readJob(ctx);
  if (current) await ctx.db.patch(current.id, { value: job });
  else await ctx.db.insert("settings", { key: "wipe", value: job });
}

/** What root's danger zone shows: whether wiping is allowed, and the last or running job. */
export const status = rootQuery({
  args: {},
  handler: async (ctx) => {
    const current = await readJob(ctx);
    return { allowed: wipeAllowed(), phrase: WIPE_PHRASE, job: current?.job ?? null };
  },
});

async function begin(ctx: MutationCtx, confirm: string, startedBy: string) {
  if (!wipeAllowed()) fail("FORBIDDEN", "Kufuta mfumo hakuruhusiwi. Weka ALLOW_WIPE=true kwenye mazingira ya Convex kwanza.");
  if (confirm.trim() !== WIPE_PHRASE) fail("INVALID", `Andika “${WIPE_PHRASE}” kuthibitisha.`);
  const current = await readJob(ctx);
  if (current?.job.status === "running") fail("INVALID", "Ufutaji tayari unaendelea.");
  await saveJob(ctx, { status: "running", startedAt: Date.now(), startedBy, table: TABLES[0], deleted: {}, files: 0 });
  await ctx.scheduler.runAfter(0, internal.wipe.step, {});
}

/** Root, from HQ: start the wipe. Needs ALLOW_WIPE=true and the confirmation phrase. */
export const start = rootMutation({
  args: { confirm: v.string() },
  handler: async (ctx, { confirm }) => {
    await begin(ctx, confirm, ctx.viewer.user.name ?? String(ctx.viewer.userId));
    return null;
  },
});

/** The same from the CLI: npx convex run wipe:startFromCli '{"confirm":"FUTA KILA KITU"}' */
export const startFromCli = internalMutation({
  args: { confirm: v.string() },
  handler: async (ctx, { confirm }) => {
    await begin(ctx, confirm, "CLI");
    return "Ufutaji umeanza. Fuatilia kwa: npx convex run wipe:statusFromCli";
  },
});

export const statusFromCli = internalMutation({
  args: {},
  handler: async (ctx) => ({ allowed: wipeAllowed(), job: (await readJob(ctx))?.job ?? null }),
});

/** Remove one non-root user: free their check number for re-use and end their sessions. */
async function removeUser(ctx: MutationCtx, user: Doc<"users">) {
  await ctx.runMutation(components.authUsername.public.deleteUsername, { userId: user._id });
  const sessions = await ctx.runQuery(components.auth.public.listSessions, { userId: user._id });
  if (sessions.length > 0) {
    await ctx.runMutation(components.auth.public.revokeSessions, { sessionIds: sessions.map((s) => s.sessionId) });
  }
  await ctx.db.delete(user._id);
}

/** One batch of one table, then schedules itself until every table is empty. */
export const step = internalMutation({
  args: {},
  handler: async (ctx) => {
    const current = await readJob(ctx);
    if (!current || current.job.status !== "running") return null;
    const job = current.job;
    if (!wipeAllowed()) {
      await saveJob(ctx, { ...job, status: "stopped", finishedAt: Date.now(), note: "ALLOW_WIPE iliondolewa wakati wa kufuta." });
      return null;
    }

    let table: WipeTable | undefined = job.table ?? TABLES[0];
    let removed = 0;
    let files = 0;

    if (table === "users") {
      const users = await ctx.db
        .query("users")
        .filter((q) => q.neq(q.field("isRoot"), true))
        .take(USER_BATCH);
      for (const u of users) await removeUser(ctx, u);
      removed = users.length;
    } else {
      const rows = await ctx.db.query(table).take(BATCH);
      for (const row of rows) {
        if (table === "media") {
          const media = row as Doc<"media">;
          await ctx.storage.delete(media.storageId).catch(() => undefined);
          files++;
        }
        await ctx.db.delete(row._id);
      }
      removed = rows.length;
    }

    const deleted = { ...job.deleted, [table]: (job.deleted[table] ?? 0) + removed };
    const limit = table === "users" ? USER_BATCH : BATCH;
    if (removed < limit) {
      // This table is empty now: move on.
      const next = TABLES[TABLES.indexOf(table) + 1];
      table = next;
    }

    if (table === undefined) {
      await saveJob(ctx, { ...job, deleted, files: job.files + files, table: undefined, status: "done", finishedAt: Date.now() });
      // A fresh log starts with a record of the wipe itself.
      await ctx.db.insert("auditLog", {
        actorIsRoot: true,
        action: "system.wipe",
        entity: "system",
        after: { deleted, files: job.files + files, startedBy: job.startedBy },
        occurredAt: Date.now(),
        receivedAt: Date.now(),
      });
      return null;
    }

    await saveJob(ctx, { ...job, deleted, files: job.files + files, table });
    await ctx.scheduler.runAfter(0, internal.wipe.step, {});
    return null;
  },
});
