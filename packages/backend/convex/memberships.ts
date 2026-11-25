import { v } from "convex/values";
import {
  canApproveRequest,
  canAssignRole,
  canGrantSection,
  canManageMember,
  canRevokeSection,
  canViewMembership,
  DEFAULT_ROLE,
  levelForAreas,
  type AreaKind,
  type Target,
  cleanName,
  isFullName,
  isValidPhone,
  normalizePhone,
  presentMaybe,
  presentName,
  storeName,
} from "@afisa/shared";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { authedMutation, fail, hiddenUserIds, hqMutation, hqQuery, type MemberViewer } from "./lib/guards";
import { writeAudit } from "./lib/audit";
import { joinBlocker, resolveCode } from "./councils";
import { vMembershipStatus, vOfficerLevel, vRole, vSection } from "./lib/validators";

const toTarget = (m: Doc<"memberships">): Target => ({
  userId: m.userId,
  role: m.role,
  status: m.status,
  primarySection: m.primarySection,
  sections: m.sections,
});

const snapshot = (m: Doc<"memberships">) => ({
  role: m.role,
  requestedRole: m.requestedRole,
  status: m.status,
  primarySection: m.primarySection,
  sections: m.sections,
  level: m.level,
  areaIds: m.areaIds,
});

/**
 * Load a membership the viewer is allowed to act on. Root's own memberships
 * look exactly like missing ones to everyone else.
 */
async function loadTarget(
  ctx: MutationCtx,
  viewer: MemberViewer,
  membershipId: Id<"memberships">,
): Promise<Doc<"memberships">> {
  const m = await ctx.db.get(membershipId);
  if (!m || m.councilId !== viewer.councilId) fail("NOT_FOUND", "Mwanachama hayupo.");
  if (!viewer.isRoot) {
    const user = await ctx.db.get(m.userId);
    if (user?.isRoot) fail("NOT_FOUND", "Mwanachama hayupo.");
  }
  return m;
}

/** Checks the areas belong to the council and returns their kinds. */
async function validateAreas(ctx: MutationCtx, councilId: Id<"councils">, areaIds: Id<"areas">[]): Promise<AreaKind[]> {
  const kinds: AreaKind[] = [];
  for (const id of areaIds) {
    const area = await ctx.db.get(id);
    if (!area || area.councilId !== councilId || area.archivedAt !== undefined) {
      fail("INVALID", "Eneo moja au zaidi halipo katika halmashauri hii.");
    }
    kinds.push(area.kind);
  }
  return kinds;
}

/**
 * Registration: a signed-in user asks to join a council with its code. Every
 * request starts as a pending guest; HQ gives the role and designation when
 * approving. Nobody picks their own role.
 *
 * The section, level and area are hints for whoever approves. `councilId`
 * and `requestedRole` are still accepted from phones running the older Join
 * screen: the council must still be ready, and the role is ignored.
 */
export const requestJoin = authedMutation({
  args: {
    councilCode: v.optional(v.string()),
    /** @deprecated older Join screen (pick from a list). */
    councilId: v.optional(v.id("councils")),
    /** @deprecated ignored: HQ chooses the role. */
    requestedRole: v.optional(vRole),
    name: v.string(),
    phone: v.optional(v.string()),
    primarySection: vSection,
    /** @deprecated ignored: the level follows the areas HQ assigns. */
    level: v.optional(vOfficerLevel),
    /** Ward or village where they work, from the council's own list. */
    requestedAreaId: v.optional(v.id("areas")),
    areaHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    let council: Doc<"councils"> | null = null;
    /** Set when they typed a section code: it decides their section. */
    let codeSection: Doc<"memberships">["primarySection"] | null = null;
    if (args.councilCode?.trim()) {
      const hit = await resolveCode(ctx, args.councilCode);
      council = hit?.council ?? null;
      codeSection = hit?.section ?? null;
      if (!council || council.status !== "active") fail("INVALID", "Msimbo huu haupo. Hakikisha umeuandika sawasawa.");
    } else if (args.councilId) {
      council = await ctx.db.get(args.councilId);
      if (!council) fail("INVALID", "Halmashauri haipo.");
    } else {
      fail("INVALID", "Andika msimbo wa halmashauri.");
    }
    const blocked = await joinBlocker(ctx, council);
    if (blocked) fail("INVALID", blocked);

    if (args.requestedAreaId) {
      const area = await ctx.db.get(args.requestedAreaId);
      if (!area || area.councilId !== council._id || area.archivedAt !== undefined || (area.kind !== "ward" && area.kind !== "village")) {
        fail("INVALID", "Eneo ulilochagua halipo katika halmashauri hii.");
      }
    }

    const name = cleanName(args.name);
    if (!isFullName(name)) fail("INVALID", "Andika jina lako kamili: majina mawili au zaidi.");
    const phone = args.phone?.trim() ? normalizePhone(args.phone) : undefined;
    if (phone && !isValidPhone(phone)) fail("INVALID", "Namba ya simu si sahihi. Mfano 0712345678.");

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user_council", (q) => q.eq("userId", viewer.userId).eq("councilId", council._id))
      .unique();
    if (existing && existing.status !== "rejected") {
      fail("INVALID", "Tayari umeomba kujiunga na halmashauri hii.");
    }

    await ctx.db.patch(viewer.userId, { name: storeName(name), phone });
    const doc = {
      userId: viewer.userId,
      councilId: council._id,
      role: DEFAULT_ROLE,
      requestedRole: undefined,
      status: "pending" as const,
      primarySection: codeSection ?? args.primarySection,
      sections: [codeSection ?? args.primarySection],
      level: undefined,
      areaIds: [],
      areaHint: args.areaHint?.trim() || undefined,
      requestedAreaId: args.requestedAreaId,
      requestedAt: Date.now(),
      decidedBy: undefined,
      decidedAt: undefined,
      decisionNote: undefined,
    };
    let id: Id<"memberships">;
    if (existing) {
      id = existing._id;
      await ctx.db.replace(id, doc);
    } else {
      id = await ctx.db.insert("memberships", doc);
    }
    await writeAudit(ctx, viewer, {
      action: existing ? "membership.reRequest" : "membership.request",
      entity: "memberships",
      entityId: id,
      councilId: council._id,
      section: codeSection ?? args.primarySection,
      before: existing ? snapshot(existing) : undefined,
      after: snapshot({ ...doc, _id: id, _creationTime: 0 }),
    });
    return id;
  },
});

/** HQ list of members the viewer may see, optionally by status. */
export const listForHq = hqQuery({
  args: { status: v.optional(vMembershipStatus) },
  handler: async (ctx, { status }) => {
    const { viewer } = ctx;
    const rows = status
      ? await ctx.db
          .query("memberships")
          .withIndex("by_council_status", (q) => q.eq("councilId", viewer.councilId).eq("status", status))
          .collect()
      : await ctx.db
          .query("memberships")
          .withIndex("by_council_status", (q) => q.eq("councilId", viewer.councilId))
          .collect();
    const hidden = await hiddenUserIds(ctx, viewer);
    const visible = rows.filter((m) => !hidden.has(m.userId) && canViewMembership(viewer.actor, toTarget(m)));
    return Promise.all(
      visible.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        const decider = m.decidedBy && !hidden.has(m.decidedBy) ? await ctx.db.get(m.decidedBy) : null;
        return {
          _id: m._id,
          userId: m.userId,
          name: presentName(user?.name) || "—",
          phone: user?.phone ?? null,
          checkNumber: user?.checkNumber ?? null,
          role: m.role,
          requestedRole: m.requestedRole ?? null,
          status: m.status,
          primarySection: m.primarySection,
          sections: m.sections,
          level: m.level ?? null,
          areaIds: m.areaIds,
          areaHint: m.areaHint ?? null,
          requestedAreaId: m.requestedAreaId ?? null,
          requestedAt: m.requestedAt,
          decidedAt: m.decidedAt ?? null,
          decidedByName: presentMaybe(decider?.name),
          decisionNote: m.decisionNote ?? null,
          isSelf: m.userId === viewer.userId,
        };
      }),
    );
  },
});

/**
 * Approve a pending guest: the approver gives the role and the designation
 * (section, plus level and work areas for officers). Root seats the Head of
 * Department; after that the HoD and section leads approve the rest.
 */
export const approve = hqMutation({
  args: {
    membershipId: v.id("memberships"),
    role: vRole,
    /** Defaults to the section the guest picked. */
    primarySection: v.optional(vSection),
    areaIds: v.array(v.id("areas")),
    /** @deprecated ignored: the level follows the assigned areas. */
    level: v.optional(vOfficerLevel),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const m = await loadTarget(ctx, viewer, args.membershipId);
    if (m.status !== "pending") fail("INVALID", "Ombi hili limeshashughulikiwa.");
    const role = args.role;
    if (role === "guest") fail("INVALID", "Chagua cheo cha kumpa.");
    const primarySection = args.primarySection ?? m.primarySection;
    // Section leads judge the request by the section the guest asked for, and
    // may not move them into a section they do not lead.
    const asTarget = toTarget(m);
    if (!canApproveRequest(viewer.actor, asTarget, role) || !canApproveRequest(viewer.actor, { ...asTarget, primarySection }, role)) {
      fail("FORBIDDEN", role === "admin" ? "Mkuu wa Idara huidhinishwa na msimamizi wa mfumo." : "Huna ruhusa ya kutoa cheo hiki.");
    }
    if (role === "officer" && args.areaIds.length === 0) fail("INVALID", "Chagua angalau eneo moja la kazi.");
    const kinds = await validateAreas(ctx, viewer.councilId, args.areaIds);
    const level = role === "officer" ? levelForAreas(kinds) : undefined;
    const patch = {
      status: "active" as const,
      role,
      requestedRole: undefined,
      primarySection,
      sections: primarySection === m.primarySection ? m.sections : [primarySection],
      areaIds: args.areaIds,
      level,
      decidedBy: viewer.userId,
      decidedAt: Date.now(),
      decisionNote: args.note?.trim() || undefined,
    };
    await ctx.db.patch(m._id, patch);
    await writeAudit(ctx, viewer, {
      action: "membership.approve",
      entity: "memberships",
      entityId: m._id,
      section: primarySection,
      before: snapshot(m),
      after: { ...snapshot(m), ...patch },
    });
    return null;
  },
});

export const reject = hqMutation({
  args: { membershipId: v.id("memberships"), note: v.string() },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const m = await loadTarget(ctx, viewer, args.membershipId);
    if (m.status !== "pending") fail("INVALID", "Ombi hili limeshashughulikiwa.");
    if (!canManageMember(viewer.actor, toTarget(m))) fail("FORBIDDEN", "Huna ruhusa ya kukataa ombi hili.");
    const note = args.note.trim();
    if (note.length < 3) fail("INVALID", "Eleza sababu ya kukataa.");
    await ctx.db.patch(m._id, { status: "rejected", decidedBy: viewer.userId, decidedAt: Date.now(), decisionNote: note });
    await writeAudit(ctx, viewer, {
      action: "membership.reject",
      entity: "memberships",
      entityId: m._id,
      section: m.primarySection,
      before: snapshot(m),
      after: { status: "rejected", note },
    });
    return null;
  },
});

export const setActive = hqMutation({
  args: { membershipId: v.id("memberships"), active: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const m = await loadTarget(ctx, viewer, args.membershipId);
    if (!canManageMember(viewer.actor, toTarget(m))) fail("FORBIDDEN", "Huna ruhusa juu ya mwanachama huyu.");
    const from = args.active ? "suspended" : "active";
    if (m.status !== from) fail("INVALID", "Hali ya mwanachama hairuhusu hatua hii.");
    const status = args.active ? ("active" as const) : ("suspended" as const);
    await ctx.db.patch(m._id, { status, decisionNote: args.note?.trim() || undefined });
    await writeAudit(ctx, viewer, {
      action: args.active ? "membership.reactivate" : "membership.suspend",
      entity: "memberships",
      entityId: m._id,
      section: m.primarySection,
      before: { status: m.status },
      after: { status, note: args.note },
    });
    return null;
  },
});

export const assignRole = hqMutation({
  args: { membershipId: v.id("memberships"), role: vRole },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const m = await loadTarget(ctx, viewer, args.membershipId);
    if (!canAssignRole(viewer.actor, toTarget(m), args.role)) {
      fail("FORBIDDEN", "Huna ruhusa ya kutoa cheo hiki.");
    }
    await ctx.db.patch(m._id, { role: args.role });
    await writeAudit(ctx, viewer, {
      action: "membership.assignRole",
      entity: "memberships",
      entityId: m._id,
      section: m.primarySection,
      before: { role: m.role },
      after: { role: args.role },
    });
    return null;
  },
});

export const grantSection = hqMutation({
  args: { membershipId: v.id("memberships"), section: vSection },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const m = await loadTarget(ctx, viewer, args.membershipId);
    if (!canGrantSection(viewer.actor, toTarget(m), args.section)) {
      fail("FORBIDDEN", "Ni mkuu wa sehemu hiyo pekee anayeweza kuiongeza.");
    }
    const sections = [...m.sections, args.section];
    await ctx.db.patch(m._id, { sections });
    await writeAudit(ctx, viewer, {
      action: "membership.grantSection",
      entity: "memberships",
      entityId: m._id,
      section: args.section,
      before: { sections: m.sections },
      after: { sections },
    });
    return null;
  },
});

export const revokeSection = hqMutation({
  args: { membershipId: v.id("memberships"), section: vSection },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const m = await loadTarget(ctx, viewer, args.membershipId);
    if (!canRevokeSection(viewer.actor, toTarget(m), args.section)) {
      fail("FORBIDDEN", "Huna ruhusa ya kuondoa sehemu hii.");
    }
    const sections = m.sections.filter((s) => s !== args.section);
    await ctx.db.patch(m._id, { sections });
    await writeAudit(ctx, viewer, {
      action: "membership.revokeSection",
      entity: "memberships",
      entityId: m._id,
      section: args.section,
      before: { sections: m.sections },
      after: { sections },
    });
    return null;
  },
});

export const assignAreas = hqMutation({
  args: { membershipId: v.id("memberships"), areaIds: v.array(v.id("areas")) },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const m = await loadTarget(ctx, viewer, args.membershipId);
    if (!canManageMember(viewer.actor, toTarget(m))) fail("FORBIDDEN", "Huna ruhusa juu ya mwanachama huyu.");
    const kinds = await validateAreas(ctx, viewer.councilId, args.areaIds);
    const level = m.role === "officer" && kinds.length > 0 ? levelForAreas(kinds) : m.level;
    await ctx.db.patch(m._id, { areaIds: args.areaIds, level });
    await writeAudit(ctx, viewer, {
      action: "membership.assignAreas",
      entity: "memberships",
      entityId: m._id,
      section: m.primarySection,
      before: { areaIds: m.areaIds },
      after: { areaIds: args.areaIds },
    });
    return null;
  },
});
