/**
 * Operator functions. Internal: callable only from the CLI or the Convex
 * dashboard by someone holding the deployment key, never from a client.
 *
 * First deployment, in this order:
 *   npx convex run admin:bootstrapRoot '{"username":"900000009","password":"<strong password>","name":"Msimamizi"}'
 *   npx convex run admin:createCouncil '{"name":"Halmashauri ya Wilaya ya Bagamoyo","region":"Pwani"}'
 *   (prints the generated council code, e.g. "K7QM-3XPA")
 * Councils and their NaPA address lists can also be created by root in HQ (Halmashauri).
 * Then the Head of Department signs up in HQ with the council code, and root
 * approves the request in HQ (Maombi). Everything after that happens in HQ.
 *
 * Other tools:
 *   npx convex run admin:createAccount '{"username":"100000001","password":"...","name":"..."}'
 *   npx convex run admin:seatMember '{"username":"100000001","councilCode":"K7QM-3XPA","role":"admin","primarySection":"kilimo"}'
 *   npx convex run admin:makeRoot '{"username":"900000009"}'
 *   npx convex run admin:setMinClientVersion '{"version":"0.2.0"}'
 */
import { v } from "convex/values";
import { api, components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import type { Id } from "./_generated/dataModel";
import { formatCouncilCode, storeName } from "@afisa/shared";
import { ensureSectionCodes, findCouncilByCode, newCouncilCode } from "./councils";
import { writeAudit } from "./lib/audit";
import { vRole, vSection } from "./lib/validators";

function missingAccount(username: string) {
  return (
    `No account with username ${username}. Create it first: sign up in the Field or HQ app, ` +
    `or run admin:createAccount (or admin:bootstrapRoot for the root account).`
  );
}

/**
 * Create a username + password account from the CLI. If the username already
 * exists, nothing is changed and the existing account is used.
 */
export const createAccount = internalAction({
  args: { username: v.string(), password: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ userId: string; created: boolean }> => {
    const res = await ctx.runMutation(api.auth.signUpWithUsernamePassword, {
      username: args.username,
      password: args.password,
    });
    let created = true;
    if (res.status !== "complete") {
      if (res.userError.error !== "USERNAME_TAKEN") {
        throw new Error(`Could not create ${args.username}: ${JSON.stringify(res.userError)}`);
      }
      created = false;
    }
    const userId: Id<"users"> | null = await ctx.runMutation(internal.admin.setNameByUsername, {
      username: args.username,
      name: args.name,
    });
    if (!userId) throw new Error(missingAccount(args.username));
    return { userId, created };
  },
});

export const setNameByUsername = internalMutation({
  args: { username: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { username, name }) => {
    const raw = await ctx.runQuery(components.authUsername.public.getUserIdByUsername, { username });
    const id = raw === null ? null : ctx.db.normalizeId("users", raw);
    if (id && name?.trim()) await ctx.db.patch(id, { name: storeName(name) });
    return id;
  },
});

/** One step for a fresh deployment: create the account (if needed) and make it root. */
export const bootstrapRoot = internalAction({
  args: { username: v.string(), password: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const { userId, created } = await ctx.runAction(internal.admin.createAccount, args);
    await ctx.runMutation(internal.admin.makeRoot, { username: args.username });
    return `${created ? "Created" : "Found"} ${args.username} (${userId}); it is now root. Sign in to HQ with it.`;
  },
});

export const makeRoot = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const userId = await ctx.runQuery(components.authUsername.public.getUserIdByUsername, { username });
    if (userId === null) throw new Error(missingAccount(username));
    const id = ctx.db.normalizeId("users", userId);
    if (!id) throw new Error("Unexpected user id");
    await ctx.db.patch(id, { isRoot: true });
    await writeAudit(ctx, null, {
      action: "user.makeRoot",
      entity: "users",
      entityId: id,
      actorIsRootOverride: true,
    });
    return id;
  },
});

/** Creates a council with a generated 8-character code and prints it. */
export const createCouncil = internalMutation({
  args: { name: v.string(), region: v.string() },
  handler: async (ctx, args) => {
    const code = await newCouncilCode(ctx);
    const id = await ctx.db.insert("councils", {
      name: storeName(args.name),
      code,
      region: storeName(args.region),
      status: "active",
      registrationOpen: true,
      createdAt: Date.now(),
    });
    await ensureSectionCodes(ctx, id);
    await writeAudit(ctx, null, { action: "council.create", entity: "councils", entityId: id, councilId: id, actorIsRootOverride: true });
    return { councilId: id, code: formatCouncilCode(code) };
  },
});

/**
 * Seat the first Head of Department of a council, so the approval chain can
 * start. Afterwards, roles are handed out from HQ.
 */
export const seatMember = internalMutation({
  args: {
    username: v.string(),
    councilCode: v.string(),
    role: vRole,
    primarySection: vSection,
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rawId = await ctx.runQuery(components.authUsername.public.getUserIdByUsername, { username: args.username });
    const userId = rawId === null ? null : ctx.db.normalizeId("users", rawId);
    if (!userId) throw new Error(missingAccount(args.username));
    const council = await findCouncilByCode(ctx, args.councilCode);
    if (!council) throw new Error(`No council ${args.councilCode}`);
    if (args.name) await ctx.db.patch(userId, { name: storeName(args.name) });
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user_council", (q) => q.eq("userId", userId).eq("councilId", council._id))
      .unique();
    const doc = {
      role: args.role,
      status: "active" as const,
      primarySection: args.primarySection,
      sections: [args.primarySection],
      decidedAt: Date.now(),
    };
    const id = existing
      ? (await ctx.db.patch(existing._id, doc), existing._id)
      : await ctx.db.insert("memberships", {
          ...doc,
          userId,
          councilId: council._id,
          areaIds: [],
          requestedAt: Date.now(),
        });
    await writeAudit(ctx, null, {
      action: "membership.seat",
      entity: "memberships",
      entityId: id,
      councilId: council._id,
      section: args.primarySection,
      after: doc,
      actorIsRootOverride: true,
    });
    return id;
  },
});

/**
 * Load wards and villages for a council in one go (for a new council or a demo).
 * Existing names are skipped, so it is safe to run twice.
 *   npx convex run admin:addAreas '{"councilCode":"K7QM-3XPA","wards":[{"name":"Dunda","villages":["Kisutu","Nianjema"]}]}'
 */
export const addAreas = internalMutation({
  args: {
    councilCode: v.string(),
    wards: v.array(v.object({ name: v.string(), villages: v.array(v.string()) })),
  },
  handler: async (ctx, args) => {
    const council = await findCouncilByCode(ctx, args.councilCode);
    if (!council) throw new Error(`No council ${args.councilCode}`);
    const existing = await ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", council._id).eq("kind", "ward")).collect();
    let wardsAdded = 0;
    let villagesAdded = 0;
    for (const w of args.wards) {
      const name = storeName(w.name);
      let ward = existing.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!ward) {
        const id = await ctx.db.insert("areas", { councilId: council._id, kind: "ward", name });
        ward = (await ctx.db.get(id))!;
        existing.push(ward);
        wardsAdded++;
      }
      const villages = await ctx.db.query("areas").withIndex("by_parent", (q) => q.eq("parentId", ward._id)).collect();
      for (const vName of w.villages) {
        const clean = storeName(vName);
        if (!clean || villages.some((x) => x.name.toLowerCase() === clean.toLowerCase())) continue;
        await ctx.db.insert("areas", { councilId: council._id, kind: "village", name: clean, parentId: ward._id });
        villagesAdded++;
      }
    }
    await writeAudit(ctx, null, {
      action: "area.bulkAdd",
      entity: "areas",
      councilId: council._id,
      after: { wardsAdded, villagesAdded },
      actorIsRootOverride: true,
    });
    return { wardsAdded, villagesAdded };
  },
});

export const setMinClientVersion = internalMutation({
  args: { version: v.string() },
  handler: async (ctx, { version }) => {
    const row = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", "minClientVersion")).unique();
    if (row) await ctx.db.patch(row._id, { value: version });
    else await ctx.db.insert("settings", { key: "minClientVersion", value: version });
    await writeAudit(ctx, null, { action: "settings.minClientVersion", entity: "settings", after: { version }, actorIsRootOverride: true });
    return null;
  },
});

/**
 * One-off: store existing names in lower case (people, councils, regions,
 * wards, villages, streets). Safe to run again; it works in pages and
 * schedules itself until every table is done.
 *   npx convex run admin:lowercaseNames
 */
export const lowercaseNames = internalMutation({
  args: {
    table: v.optional(v.union(v.literal("users"), v.literal("councils"), v.literal("areas"))),
    cursor: v.optional(v.union(v.string(), v.null())),
    changed: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<string> => {
    const order = ["users", "councils", "areas"] as const;
    const table = args.table ?? "users";
    const page = await ctx.db.query(table).paginate({ cursor: args.cursor ?? null, numItems: 400 });
    let changed = args.changed ?? 0;
    for (const row of page.page) {
      const patch: Record<string, string> = {};
      const fix = (key: string, value: string | undefined) => {
        if (value && storeName(value) !== value) patch[key] = storeName(value);
      };
      fix("name", (row as { name?: string }).name);
      if (table === "councils") {
        fix("displayName", (row as { displayName?: string }).displayName);
        fix("region", (row as { region?: string }).region);
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(row._id, patch);
        changed++;
      }
    }
    const next = page.isDone ? order[order.indexOf(table) + 1] : table;
    if (!next) return `Imekamilika: majina ${changed} yamebadilishwa.`;
    await ctx.scheduler.runAfter(0, internal.admin.lowercaseNames, { table: next, cursor: page.isDone ? null : page.continueCursor, changed });
    return `Inaendelea (${table}): ${changed} hadi sasa.`;
  },
});

/** One-off: give every council its section codes. Safe to repeat.  npx convex run admin:backfillSectionCodes */
export const backfillSectionCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    let made = 0;
    for (const c of await ctx.db.query("councils").collect()) made += await ensureSectionCodes(ctx, c._id);
    return `Misimbo ${made} ya sehemu imetengenezwa.`;
  },
});
