/**
 * The permission rules, as pure functions.
 *
 * The backend enforces these inside every guarded Convex function; the apps use
 * the same functions only to hide actions a user cannot take. Changing a rule
 * here changes it in both places, and the tests in permissions.test.ts pin the
 * behaviour agreed with the department.
 */
import {
  DEPARTMENT_ROLES,
  HQ_ROLES,
  SECTION_LEAD_ROLES,
  SECTIONS,
  type MembershipStatus,
  type Role,
  type Section,
} from "./domain.ts";

/** Who is acting. `role` is null only for root acting without a membership. */
export type Actor = {
  userId: string;
  isRoot: boolean;
  role: Role | null;
  status: MembershipStatus | null;
  primarySection: Section | null;
  sections: readonly Section[];
};

/** The membership being acted on. */
export type Target = {
  userId: string;
  role: Role;
  status: MembershipStatus;
  primarySection: Section;
  sections: readonly Section[];
};

const isDepartment = (role: Role | null) =>
  role !== null && DEPARTMENT_ROLES.includes(role);
const isSectionLead = (role: Role | null) =>
  role !== null && SECTION_LEAD_ROLES.includes(role);

export function isActive(actor: Actor): boolean {
  return actor.isRoot || actor.status === "active";
}

export function isHqRole(role: Role | null): boolean {
  return role !== null && HQ_ROLES.includes(role);
}

/** Officers can never use HQ. Checked by role, never by which app is calling. */
export function canUseHq(actor: Actor): boolean {
  return actor.isRoot || (isActive(actor) && isHqRole(actor.role));
}

/** Everyone active may use the Field app (HQ users limited to their sections). */
export function canUseField(actor: Actor): boolean {
  return isActive(actor);
}

/** Sections whose data the actor may read and write records for. */
export function workingSections(actor: Actor): Section[] {
  if (actor.isRoot || isDepartment(actor.role)) return [...SECTIONS];
  if (!isActive(actor)) return [];
  return [...new Set(actor.sections)];
}

/**
 * Sections the actor has *authority* over (approving people, granting the
 * section). Section heads and vices lead only their primary section.
 */
export function authoritySections(actor: Actor): Section[] {
  if (actor.isRoot || (isActive(actor) && isDepartment(actor.role))) {
    return [...SECTIONS];
  }
  if (isActive(actor) && isSectionLead(actor.role) && actor.primarySection) {
    return [actor.primarySection];
  }
  return [];
}

const isSelf = (actor: Actor, target: Target) => actor.userId === target.userId;

/** May the actor see this membership in HQ lists? */
export function canViewMembership(actor: Actor, target: Target): boolean {
  if (actor.isRoot) return true;
  if (!canUseHq(actor)) return isSelf(actor, target);
  const authority = authoritySections(actor);
  return (
    authority.includes(target.primarySection) ||
    target.sections.some((s) => authority.includes(s))
  );
}

/**
 * Approve / reject a pending registration, suspend or reactivate a member, or
 * assign their areas. Admin and moderator: anyone below them. Section head or
 * vice: officers and guests whose primary section they lead.
 */
export function canManageMember(actor: Actor, target: Target): boolean {
  if (isSelf(actor, target) && !actor.isRoot) return false;
  if (actor.isRoot) return true;
  if (!isActive(actor)) return false;
  if (actor.role === "admin") return target.role !== "admin";
  if (actor.role === "moderator") {
    return target.role !== "admin" && target.role !== "moderator";
  }
  if (isSectionLead(actor.role)) {
    return (
      (target.role === "officer" || target.role === "guest") &&
      authoritySections(actor).includes(target.primarySection)
    );
  }
  return false;
}

/**
 * Approve a pending guest and give them `role`. The approver chooses the role;
 * the person signing up never does. Section leads approve officers of their
 * section; giving an HQ role needs the right to hand it out, so only root
 * seats a Head of Department.
 */
export function canApproveRequest(actor: Actor, target: Target, role: Role): boolean {
  if (target.status !== "pending") return false;
  if (role === "guest") return false;
  if (!canManageMember(actor, target)) return false;
  return role === "officer" || assignableRoles(actor).includes(role);
}

/** Roles the actor may give when approving this pending guest. */
export function approvableRoles(actor: Actor, target: Target): Role[] {
  const roles: Role[] = ["admin", "moderator", "section_head", "section_vice", "officer"];
  return roles.filter((r) => canApproveRequest(actor, target, r));
}

/** Roles the actor is allowed to hand out. */
export function assignableRoles(actor: Actor): Role[] {
  if (actor.isRoot) return ["admin", "moderator", "section_head", "section_vice", "officer"];
  if (!isActive(actor)) return [];
  if (actor.role === "admin") return ["moderator", "section_head", "section_vice", "officer"];
  if (actor.role === "moderator") return ["section_head", "section_vice", "officer"];
  return [];
}

/**
 * Change a member's role. Section heads are assigned by admin or moderator;
 * the section they head is the member's primary section. Only root assigns
 * admin.
 */
export function canAssignRole(actor: Actor, target: Target, role: Role): boolean {
  if (role === target.role || role === "guest") return false;
  if (!canManageMember(actor, target)) return false;
  if (target.status !== "active") return false;
  return assignableRoles(actor).includes(role);
}

/**
 * Add an extra section to a member. Only someone with authority over *that*
 * section can add it, and the primary section is never "added".
 */
export function canGrantSection(actor: Actor, target: Target, section: Section): boolean {
  if (isSelf(actor, target) && !actor.isRoot) return false;
  if (target.status !== "active") return false;
  if (section === target.primarySection) return false;
  if (target.sections.includes(section)) return false;
  return authoritySections(actor).includes(section);
}

export function canRevokeSection(actor: Actor, target: Target, section: Section): boolean {
  if (isSelf(actor, target) && !actor.isRoot) return false;
  if (section === target.primarySection) return false;
  if (!target.sections.includes(section)) return false;
  return authoritySections(actor).includes(section);
}

/**
 * Section sign-up codes the actor may see and share: every section for root
 * and the Head of Department (and vice), their own section for anyone else
 * active in it. Guests see none.
 */
export function visibleSectionCodes(actor: Actor): Section[] {
  if (actor.isRoot || (isActive(actor) && isDepartment(actor.role))) return [...SECTIONS];
  if (isActive(actor) && actor.primarySection && actor.role !== "guest") return [actor.primarySection];
  return [];
}

/** Issue a new code for a section: root and department roles for any, section leads for their own. */
export function canRenewSectionCode(actor: Actor, section: Section): boolean {
  return authoritySections(actor).includes(section);
}

/** Create and edit wards and villages. */
export function canManageAreas(actor: Actor): boolean {
  return actor.isRoot || (isActive(actor) && isDepartment(actor.role));
}

/** Read records. Officers read only their own; leads read their sections. */
export function canReadRecord(
  actor: Actor,
  record: { ownerId: string; section: Section },
): boolean {
  if (actor.isRoot) return true;
  if (!isActive(actor)) return false;
  if (record.ownerId === actor.userId) return true;
  if (!canUseHq(actor)) return false;
  return authoritySections(actor).includes(record.section);
}

/** Create or change a record of this section (always as its owner). */
export function canWriteSection(actor: Actor, section: Section): boolean {
  return workingSections(actor).includes(section);
}

/** Read the audit log of the council. */
export function canReadAudit(actor: Actor): boolean {
  return actor.isRoot || (isActive(actor) && isHqRole(actor.role));
}

/**
 * Send a sealed report back to its officer for correction. Heads and vices of
 * the report's section, the Head of Department and vice, and root.
 */
export function canReopenReport(actor: Actor, reportSection: Section): boolean {
  if (actor.isRoot) return true;
  if (!isActive(actor)) return false;
  return authoritySections(actor).includes(reportSection);
}

/**
 * Approve or reject an officer's presets and production plan for a section:
 * the same people who may send that section's reports back.
 */
export function canApprovePreset(actor: Actor, section: Section): boolean {
  return canReopenReport(actor, section);
}
