import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { statsOf } from "./lib/stats";
import type { Doc, Id } from "./_generated/dataModel";
import {
  canRenewSectionCode,
  DEPARTMENT_ROLES,
  canReopenReport,
  generateCouncilCode,
  isValidCouncilCode,
  normalizeCouncilCode,
  presentMaybe,
  presentName,
  SECTIONS,
  storeName,
  visibleSectionCodes,
  type Section,
} from "@afisa/shared";
import { authedQuery, fail, hqMutation, hqQuery, memberMutation, memberQuery, rootMutation, rootQuery } from "./lib/guards";
import { writeAudit } from "./lib/audit";
import { weeklyOf } from "./submissions";
import { vSection } from "./lib/validators";

/** Crypto-backed random integer in [0, n). */
function randomInt(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]! % n;
}

/** A fresh 8-character code that no council or section uses yet. */
export async function newCouncilCode(ctx: QueryCtx): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateCouncilCode(randomInt);
    const council = await ctx.db.query("councils").withIndex("by_code", (q) => q.eq("code", code)).unique();
    const section = await ctx.db.query("sectionCodes").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (!council && !section) return code;
  }
  throw new Error("Could not find a free code");
}

/** Give each section of the council a sign-up code, where it has none yet. Returns how many were made. */
export async function ensureSectionCodes(ctx: MutationCtx, councilId: Id<"councils">): Promise<number> {
  const have = await ctx.db.query("sectionCodes").withIndex("by_council", (q) => q.eq("councilId", councilId)).collect();
  let made = 0;
  for (const section of SECTIONS) {
    if (have.some((h) => h.section === section)) continue;
    await ctx.db.insert("sectionCodes", { councilId, section, code: await newCouncilCode(ctx), createdAt: Date.now() });
    made++;
  }
  return made;
}

/**
 * What a typed code opens: a council (council code) or a council and one of
 * its sections (section code).
 */
export async function resolveCode(ctx: QueryCtx | MutationCtx, typed: string): Promise<{ council: Doc<"councils">; section: Section | null } | null> {
  const council = await findCouncilByCode(ctx, typed);
  if (council) return { council, section: null };
  const code = normalizeCouncilCode(typed);
  if (code.length !== 8) return null;
  const hit = await ctx.db.query("sectionCodes").withIndex("by_code", (q) => q.eq("code", code)).unique();
  if (!hit) return null;
  const c = await ctx.db.get(hit.councilId);
  return c ? { council: c, section: hit.section } : null;
}

/**
 * Find a council by what someone typed: "abcd-ef12", "ABCDEF12"… Older codes
 * made before the 8-character format (e.g. "BAMOYO") still match exactly.
 */
export async function findCouncilByCode(ctx: QueryCtx | MutationCtx, typed: string): Promise<Doc<"councils"> | null> {
  const code = normalizeCouncilCode(typed);
  if (code.length < 3) return null;
  const hit = await ctx.db.query("councils").withIndex("by_code", (q) => q.eq("code", code)).unique();
  if (hit) return hit;
  const legacy = typed.trim().toUpperCase();
  return legacy === code ? null : await ctx.db.query("councils").withIndex("by_code", (q) => q.eq("code", legacy)).unique();
}

/**
 * A council takes sign-ups only once its addresses are in: at least one
 * village under a ward, so whoever approves can assign work areas.
 */
export async function hasAddresses(ctx: QueryCtx, councilId: Id<"councils">): Promise<boolean> {
  const village = await ctx.db
    .query("areas")
    .withIndex("by_council_kind", (q) => q.eq("councilId", councilId).eq("kind", "village"))
    .filter((q) => q.eq(q.field("archivedAt"), undefined))
    .first();
  return village !== null;
}

/** Why a council cannot take a sign-up right now, or null when it can. */
export async function joinBlocker(ctx: QueryCtx, council: Doc<"councils">): Promise<string | null> {
  if (council.status !== "active") return "Halmashauri hii imesitishwa.";
  if (!council.registrationOpen) return "Halmashauri hii haipokei maombi kwa sasa.";
  if (!(await hasAddresses(ctx, council._id))) {
    return "Halmashauri hii bado haijaweka anwani zake (kata na vijiji). Jaribu tena baadaye.";
  }
  return null;
}

/**
 * @deprecated Sign-up is by council code only. Kept for phones still running
 * the older Join screen; lists only councils that can take a sign-up.
 */
export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    const councils = await ctx.db
      .query("councils")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const ready = [];
    for (const c of councils) {
      if ((await joinBlocker(ctx, c)) === null) ready.push({ _id: c._id, name: presentName(c.name), region: presentName(c.region) });
    }
    return ready.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Councils the viewer can open in HQ: their memberships, or all for root. */
export const listMine = authedQuery({
  args: {},
  handler: async (ctx) => {
    const { viewer } = ctx;
    if (viewer.isRoot) {
      const all = await ctx.db.query("councils").collect();
      return all.map((c) => ({ _id: c._id, name: presentName(c.name), displayName: presentMaybe(c.displayName), region: presentName(c.region), status: c.status }));
    }
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
      .collect();
    const councils = await Promise.all(memberships.map((m) => ctx.db.get(m.councilId)));
    return councils
      .filter((c) => c !== null)
      .map((c) => ({ _id: c._id, name: presentName(c.name), displayName: presentMaybe(c.displayName), region: presentName(c.region), status: c.status }));
  },
});

/** Inviting a new council is a root action. The code is generated: 8 characters, unique. */
export const create = rootMutation({
  args: {
    name: v.string(),
    displayName: v.optional(v.string()),
    region: v.string(),
    registrationOpen: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const name = storeName(args.name);
    const displayName = args.displayName?.trim() ? storeName(args.displayName) : undefined;
    if (name.length < 3) fail("INVALID", "Andika jina kamili la halmashauri.");
    if (args.region.trim().length < 2) fail("INVALID", "Andika mkoa.");
    const code = await newCouncilCode(ctx);
    const doc = {
      name,
      ...(displayName ? { displayName } : {}),
      code,
      region: storeName(args.region),
      status: "active" as const,
      registrationOpen: args.registrationOpen ?? true,
      createdAt: Date.now(),
    };
    const id = await ctx.db.insert("councils", doc);
    await ensureSectionCodes(ctx, id);
    await writeAudit(ctx, ctx.viewer, {
      action: "council.create",
      entity: "councils",
      entityId: id,
      councilId: id,
      after: doc,
    });
    return { councilId: id, code };
  },
});

/** Issue a new code (e.g. to replace an old-format one, or one that leaked). The old code stops working. */
export const regenerateCode = rootMutation({
  args: { councilId: v.id("councils") },
  handler: async (ctx, { councilId }) => {
    const c = await ctx.db.get(councilId);
    if (!c) fail("NOT_FOUND", "Halmashauri haipo.");
    const code = await newCouncilCode(ctx);
    await ctx.db.patch(councilId, { code });
    await writeAudit(ctx, ctx.viewer, {
      action: "council.regenerateCode",
      entity: "councils",
      entityId: councilId,
      councilId,
      before: { code: c.code },
      after: { code },
    });
    return code;
  },
});

/**
 * Council name for a code, so the sign-up form can confirm it before sending.
 * `blocked` explains why it cannot take sign-ups yet (no addresses, closed).
 */
export const lookupByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    if (code.length > 40) return null;
    const hit = await resolveCode(ctx, code);
    if (!hit || hit.council.status !== "active") return null;
    const c = hit.council;
    return { name: presentName(c.name), region: presentName(c.region), section: hit.section, blocked: await joinBlocker(ctx, c) };
  },
});

/**
 * Wards and villages of the council with this code, for the "where do you
 * work" step of sign-up. Empty unless the council can take sign-ups.
 */
export const joinAreas = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    if (code.length > 40) return [];
    const c = (await resolveCode(ctx, code))?.council;
    if (!c || (await joinBlocker(ctx, c)) !== null) return [];
    const [wards, villages] = await Promise.all([
      ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", c._id).eq("kind", "ward")).collect(),
      ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", c._id).eq("kind", "village")).collect(),
    ]);
    return [...wards, ...villages]
      .filter((a) => a.archivedAt === undefined)
      .map((a) => ({ _id: a._id, kind: a.kind as "ward" | "village", name: presentName(a.name), parentId: a.parentId ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * One council in full, for root's council page: settings, code, people in
 * charge, members by status and the wards with their village counts.
 */
export const detail = rootQuery({
  args: { councilId: v.id("councils") },
  handler: async (ctx, { councilId }) => {
    const c = await ctx.db.get(councilId);
    if (!c) return null;
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_council_status", (q) => q.eq("councilId", councilId))
      .collect();
    const byStatus = { active: 0, pending: 0, suspended: 0, rejected: 0 };
    const byRole: Record<string, number> = {};
    const leads: { name: string; role: string; section: string }[] = [];
    for (const m of memberships) {
      byStatus[m.status]++;
      if (m.status !== "active") continue;
      byRole[m.role] = (byRole[m.role] ?? 0) + 1;
      if (m.role !== "officer") {
        const user = await ctx.db.get(m.userId);
        if (user?.isRoot) continue;
        leads.push({ name: presentName(user?.name) || "—", role: m.role, section: m.primarySection });
      }
    }
    // Wards and villages are listed (a few hundred rows); streets, thousands, only counted, so from the stored totals.
    const [wards, villages] = await Promise.all(
      (["ward", "village"] as const).map((kind) =>
        ctx.db.query("areas").withIndex("by_council_kind", (q) => q.eq("councilId", councilId).eq("kind", kind)).collect(),
      ),
    );
    const stats = await statsOf(ctx, c);
    const liveVillages = villages!.filter((a) => a.archivedAt === undefined);
    const wardList = wards!
      .filter((w) => w.archivedAt === undefined)
      .map((w) => ({ _id: w._id, name: presentName(w.name), villages: liveVillages.filter((x) => x.parentId === w._id).length }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      _id: c._id,
      name: presentName(c.name),
      displayName: presentMaybe(c.displayName),
      code: c.code,
      validCode: isValidCouncilCode(c.code),
      region: presentName(c.region),
      status: c.status,
      registrationOpen: c.registrationOpen,
      createdAt: c.createdAt,
      addressImport: c.addressImport ?? null,
      areas: { wards: wardList.length, villages: liveVillages.length, streets: stats.streets },
      wards: wardList,
      members: byStatus,
      byRole,
      leads,
      sectionCodes: (await ctx.db.query("sectionCodes").withIndex("by_council", (q) => q.eq("councilId", councilId)).collect())
        .map((x) => ({ section: x.section, code: x.code }))
        .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section)),
    };
  },
});

/** Every council with member counts (root only). Reads the stored totals: one row per council. */
export const listAll = rootQuery({
  args: {},
  handler: async (ctx) => {
    const councils = await ctx.db.query("councils").collect();
    return Promise.all(
      councils.map(async (c) => {
        const stats = await statsOf(ctx, c);
        const head = stats.headUserId ? await ctx.db.get(stats.headUserId) : null;
        return {
          _id: c._id,
          name: presentName(c.name),
          displayName: presentMaybe(c.displayName),
          code: c.code,
          region: presentName(c.region),
          status: c.status,
          registrationOpen: c.registrationOpen,
          validCode: isValidCouncilCode(c.code),
          addressImport: c.addressImport ?? null,
          hasAddresses: stats.villages > 0,
          head: head ? presentName(head.name) || "—" : null,
          active: stats.active,
          pending: stats.pending,
          areas: { wards: stats.wards, villages: stats.villages, streets: stats.streets },
          createdAt: c.createdAt,
        };
      }),
    );
  },
});

export const update = rootMutation({
  args: {
    councilId: v.id("councils"),
    name: v.optional(v.string()),
    displayName: v.optional(v.string()),
    region: v.optional(v.string()),
    registrationOpen: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
  },
  handler: async (ctx, { councilId, ...changes }) => {
    const c = await ctx.db.get(councilId);
    if (!c) fail("NOT_FOUND", "Halmashauri haipo.");
    if (changes.registrationOpen === true && !(await hasAddresses(ctx, councilId))) {
      fail("INVALID", "Weka anwani za halmashauri (kata na vijiji) kabla ya kufungua usajili.");
    }
    const patch = Object.fromEntries(
      Object.entries(changes)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, typeof v === "string" ? storeName(v) || (k === "displayName" ? undefined : storeName(v)) : v]),
    );
    await ctx.db.patch(councilId, patch);
    await writeAudit(ctx, ctx.viewer, {
      action: "council.update",
      entity: "councils",
      entityId: councilId,
      councilId,
      before: Object.fromEntries(Object.keys(patch).map((k) => [k, (c as Record<string, unknown>)[k]])),
      after: patch,
    });
    return null;
  },
});

/** Council settings shown in HQ. */
export const settings = hqQuery({
  args: {},
  handler: async (ctx) => {
    const c = await ctx.db.get(ctx.viewer.councilId);
    const { actor } = ctx.viewer;
    return {
      name: presentName(c?.name),
      displayName: presentMaybe(c?.displayName),
      autoSend: { food: c?.autoSend?.food ?? false, monthly: c?.autoSend?.monthly ?? false },
      weekly: weeklyOf(c),
      /** Weekly reports: the department, or the section's own lead. */
      canEditWeekly: { mifugo: canReopenReport(actor, "mifugo"), kilimo: canReopenReport(actor, "kilimo") },
      canEdit: actor.isRoot || (actor.role !== null && DEPARTMENT_ROLES.includes(actor.role)),
    };
  },
});

/**
 * Weekly reports for one section: asked of its officers for the Monday
 * morning meeting; any report not sent by Monday 05:00 sends itself.
 */
export const setWeekly = hqMutation({
  args: { section: v.union(v.literal("mifugo"), v.literal("kilimo")), on: v.boolean() },
  handler: async (ctx, { section, on }) => {
    const { viewer } = ctx;
    if (!canReopenReport(viewer.actor, section)) fail("FORBIDDEN", "Ni Mkuu wa Idara au mkuu wa sehemu hii tu wanaoweza kubadili mpangilio huu.");
    const c = await ctx.db.get(viewer.councilId);
    const before = weeklyOf(c);
    // When on, a report the officer has not sent always sends itself on Monday at 05:00.
    const weekly = { ...before, [section]: { on, auto: on } };
    await ctx.db.patch(viewer.councilId, { weekly });
    await writeAudit(ctx, viewer, {
      action: "council.weekly",
      entity: "councils",
      entityId: viewer.councilId,
      section,
      before: before[section],
      after: weekly[section],
    });
    return null;
  },
});

/** Head of Department (or vice HoD, or root): reports send themselves on their due dates. */
export const setAutoSend = hqMutation({
  args: { food: v.boolean(), monthly: v.boolean() },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const { actor } = viewer;
    if (!(actor.isRoot || (actor.role !== null && DEPARTMENT_ROLES.includes(actor.role)))) {
      fail("FORBIDDEN", "Ni Mkuu wa Idara au Naibu wake tu wanaoweza kubadili mpangilio huu.");
    }
    const c = await ctx.db.get(viewer.councilId);
    const autoSend = { food: args.food, monthly: args.monthly };
    await ctx.db.patch(viewer.councilId, { autoSend });
    await writeAudit(ctx, viewer, {
      action: "council.autoSend",
      entity: "councils",
      entityId: viewer.councilId,
      before: c?.autoSend ?? { food: false, monthly: false },
      after: autoSend,
    });
    return null;
  },
});

/** A shorter name for screens (Head of Department, vice, or root). Empty clears it. */
export const setDisplayName = hqMutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const { viewer } = ctx;
    const { actor } = viewer;
    if (!(actor.isRoot || (actor.role !== null && DEPARTMENT_ROLES.includes(actor.role)))) {
      fail("FORBIDDEN", "Ni Mkuu wa Idara au Naibu wake tu wanaoweza kubadili jina fupi.");
    }
    const clean = storeName(displayName);
    if (clean.length > 40) fail("INVALID", "Jina fupi lisizidi herufi 40.");
    const c = await ctx.db.get(viewer.councilId);
    await ctx.db.patch(viewer.councilId, { displayName: clean || undefined });
    await writeAudit(ctx, viewer, {
      action: "council.displayName",
      entity: "councils",
      entityId: viewer.councilId,
      before: { displayName: c?.displayName },
      after: { displayName: clean || undefined },
    });
    return null;
  },
});

/**
 * The section sign-up codes this member may share: every section for the
 * Head of Department (and vice) and root, their own section for others.
 * `missing` says some sections have no code yet (councils made before codes).
 */
export const myCodes = memberQuery({
  args: {},
  handler: async (ctx) => {
    const { viewer } = ctx;
    const sections = visibleSectionCodes(viewer.actor);
    if (sections.length === 0) return { codes: [], missing: false, canRenew: [] as Section[] };
    const rows = await ctx.db.query("sectionCodes").withIndex("by_council", (q) => q.eq("councilId", viewer.councilId)).collect();
    const codes = sections.flatMap((section) => {
      const row = rows.find((r) => r.section === section);
      return row ? [{ section, code: row.code }] : [];
    });
    return { codes, missing: codes.length < sections.length, canRenew: sections.filter((s) => canRenewSectionCode(viewer.actor, s)) };
  },
});

/** Make the missing section codes of a council (older councils). Any member who may see codes can trigger it. */
export const prepareSectionCodes = memberMutation({
  args: {},
  handler: async (ctx) => {
    if (visibleSectionCodes(ctx.viewer.actor).length === 0) fail("FORBIDDEN", "Huna ruhusa.");
    const made = await ensureSectionCodes(ctx, ctx.viewer.councilId);
    if (made > 0) {
      await writeAudit(ctx, ctx.viewer, { action: "council.sectionCodes", entity: "councils", entityId: ctx.viewer.councilId, after: { made } });
    }
    return made;
  },
});

/** A new code for a section (e.g. it leaked). The old one stops working. Root, HoD and vice, or that section's lead. */
export const renewSectionCode = hqMutation({
  args: { section: vSection },
  handler: async (ctx, { section }) => {
    const { viewer } = ctx;
    if (!canRenewSectionCode(viewer.actor, section)) fail("FORBIDDEN", "Huna ruhusa ya kubadili msimbo wa sehemu hii.");
    const row = await ctx.db
      .query("sectionCodes")
      .withIndex("by_council", (q) => q.eq("councilId", viewer.councilId))
      .filter((q) => q.eq(q.field("section"), section))
      .unique();
    const code = await newCouncilCode(ctx);
    if (row) await ctx.db.patch(row._id, { code, createdAt: Date.now() });
    else await ctx.db.insert("sectionCodes", { councilId: viewer.councilId, section, code, createdAt: Date.now() });
    await writeAudit(ctx, viewer, { action: "council.renewSectionCode", entity: "councils", entityId: viewer.councilId, section, before: row ? { code: row.code } : undefined, after: { code } });
    return code;
  },
});
