import { v } from "convex/values";
import {
  canApproveRequest,
  canAssignRole,
  HQ_ROLES,
  canGrantSection,
  canManageMember,
  canRevokeSection,
  canViewMembership,
  type Target,
} from "@afisa/shared";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { authedMutation, fail, hiddenUserIds, hqMutation, hqQuery, type MemberViewer } from "./lib/guards";
import { writeAudit } from "./lib/audit";
import { findCouncilByCode } from "./councils";
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

async function validateAreas(ctx: MutationCtx, councilId: Id<"councils">, areaIds: Id<"areas">[]) {
  for (const id of areaIds) {
    const area = await ctx.db.get(id);
    if (!area || area.councilId !== councilId || area.archivedAt !== undefined) {
      fail("INVALID", "Eneo moja au zaidi halipo katika halmashauri hii.");
    }
  }
}

/**
 * Registration: a signed-in user asks to join a council. Starts pending.
 *
 * Officers pick a council from the open list (`councilId`). HQ staff type the
 * council code (`councilCode`) and say which HQ role they hold
 * (`requestedRole`); the code works even when the council is closed to
 * officer registration. The role is only granted on approval.
 */
export const requestJoin = authedMutation({
  args: {
    councilId: v.optional(v.id("councils")),
    councilCode: v.optional(v.string()),
    requestedRole: v.optional(vRole),
    name: v.string(),
    phone: v.optional(v.string()),
    primarySection: vSection,
    level: v.optional(vOfficerLevel),
    areaHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    let council: Doc<"councils"> | null = null;
    if (args.councilCode?.trim()) {
      council = await findCouncilByCode(ctx, args.councilCode);
      if (!council || council.status !== "active") fail("INVALID", "Msimbo wa halmashauri haupo. Hakikisha umeuandika sawasawa.");
    } else if (args.councilId) {
      council = await ctx.db.get(args.councilId);
      if (!council || council.status !== "active" || !council.registrationOpen) {
        fail("INVALID", "Halmashauri hii haipokei maombi kwa sasa.");
      }
    } else {
      fail("INVALID", "Chagua halmashauri au andika msimbo wake.");
    }
    const requestedRole = args.requestedRole && args.requestedRole !== "officer" ? args.requestedRole : undefined;
    if (requestedRole && !args.councilCode) fail("INVALID", "Cheo cha makao makuu kinaombwa kwa msimbo wa halmashauri.");
    if (requestedRole && !HQ_ROLES.includes(requestedRole)) fail("INVALID", "Cheo hiki hakiombwi.");
    if (!requestedRole && !args.level) fail("INVALID", "Chagua ngazi yako ya kazi.");

    const name = args.name.trim();
    if (name.length < 3) fail("INVALID", "Andika jina lako kamili.");

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user_council", (q) => q.eq("userId", viewer.userId).eq("councilId", council._id))
      .unique();
    if (existing && existing.status !== "rejected") {
      fail("INVALID", "Tayari umeomba kujiunga na halmashauri hii.");
    }

    await ctx.db.patch(viewer.userId, { name, phone: args.phone?.trim() || undefined });
    const doc = {
      userId: viewer.userId,
      councilId: council._id,
      role: "officer" as const,
      requestedRole,
      status: "pending" as const,
      primarySection: args.primarySection,
      sections: [args.primarySection],
      level: requestedRole ? undefined : args.level,
      areaIds: [],
      areaHint: args.areaHint?.trim() || undefined,
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
      section: args.primarySection,
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
          name: user?.name ?? "—",
          phone: user?.phone ?? null,
          role: m.role,
          requestedRole: m.requestedRole ?? null,
          status: m.status,
          primarySection: m.primarySection,
          sections: m.sections,
          level: m.level ?? null,
          areaIds: m.areaIds,
          areaHint: m.areaHint ?? null,
          requestedAt: m.requestedAt,
          decidedAt: m.decidedAt ?? null,
          decidedByName: decider?.name ?? null,
          decisionNote: m.decisionNote ?? null,
          isSelf: m.userId === viewer.userId,
        };
      }),
    );
  },
});

export const approve = hqMutation({
  args: {
    membershipId: v.id("memberships"),
    areaIds: v.array(v.id("areas")),
    level: v.optional(vOfficerLevel),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const m = await loadTarget(ctx, viewer, args.membershipId);
    if (m.status !== "pending") fail("INVALID", "Ombi hili limeshashughulikiwa.");
    const role = m.requestedRole ?? "officer";
    if (!canApproveRequest(viewer.actor, toTarget(m), role)) {
      fail("FORBIDDEN", role === "admin" ? "Mkuu wa Idara huidhinishwa na msimamizi wa mfumo." : "Huna ruhusa ya kuidhinisha ombi hili.");
    }
    if (role === "officer" && args.areaIds.length === 0) {
      fail("INVALID", "Chagua angalau eneo moja la kazi.");
    }
    await validateAreas(ctx, viewer.councilId, args.areaIds);
    const patch = {
      status: "active" as const,
      role,
      requestedRole: undefined,
      areaIds: args.areaIds,
      level: role === "officer" ? (args.level ?? m.level) : undefined,
      decidedBy: viewer.userId,
      decidedAt: Date.now(),
      decisionNote: args.note?.trim() || undefined,
    };
    await ctx.db.patch(m._id, patch);
    await writeAudit(ctx, viewer, {
      action: "membership.approve",
      entity: "memberships",
      entityId: m._id,
      section: m.primarySection,
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
    await validateAreas(ctx, viewer.councilId, args.areaIds);
    await ctx.db.patch(m._id, { areaIds: args.areaIds });
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
