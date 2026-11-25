import { describe, expect, it } from "vitest";
import {
  approvableRoles,
  assignableRoles,
  authoritySections,
  canApproveRequest,
  canAssignRole,
  canReopenReport,
  canGrantSection,
  canManageMember,
  canReadRecord,
  canRevokeSection,
  canUseHq,
  canViewMembership,
  canWriteSection,
  workingSections,
  type Actor,
  type Target,
} from "./permissions.ts";
import type { Role, Section } from "./domain.ts";
import { actionsFor, compareVersions } from "./index.ts";

let n = 0;
function actor(role: Role | null, primary: Section | null = "kilimo", extra: Section[] = [], opts: Partial<Actor> = {}): Actor {
  return {
    userId: `u${++n}`,
    isRoot: false,
    role,
    status: "active",
    primarySection: primary,
    sections: primary ? [primary, ...extra] : extra,
    ...opts,
  };
}
function target(role: Role, primary: Section = "kilimo", extra: Section[] = [], opts: Partial<Target> = {}): Target {
  return { userId: `t${++n}`, role, status: "active", primarySection: primary, sections: [primary, ...extra], ...opts };
}
const root = actor(null, null, [], { isRoot: true, status: null });

describe("app access", () => {
  it("officers cannot use HQ; HQ roles and root can", () => {
    expect(canUseHq(actor("officer"))).toBe(false);
    for (const r of ["admin", "moderator", "section_head", "section_vice"] as Role[]) {
      expect(canUseHq(actor(r))).toBe(true);
    }
    expect(canUseHq(root)).toBe(true);
  });
  it("pending or suspended HQ members cannot use HQ", () => {
    expect(canUseHq(actor("admin", "kilimo", [], { status: "pending" }))).toBe(false);
    expect(canUseHq(actor("section_head", "kilimo", [], { status: "suspended" }))).toBe(false);
  });
});

describe("sections", () => {
  it("department roles and root work in every section", () => {
    expect(workingSections(actor("admin"))).toEqual(["kilimo", "mifugo", "uvuvi"]);
    expect(workingSections(actor("moderator", "uvuvi"))).toEqual(["kilimo", "mifugo", "uvuvi"]);
    expect(workingSections(root)).toHaveLength(3);
  });
  it("section heads in the Field app are confined to their sections", () => {
    const head = actor("section_head", "mifugo");
    expect(workingSections(head)).toEqual(["mifugo"]);
    expect(canWriteSection(head, "kilimo")).toBe(false);
    expect(canWriteSection(head, "mifugo")).toBe(true);
  });
  it("officers work in primary plus granted sections", () => {
    const o = actor("officer", "kilimo", ["mifugo"]);
    expect(workingSections(o)).toEqual(["kilimo", "mifugo"]);
    expect(canWriteSection(o, "uvuvi")).toBe(false);
  });
  it("a lead's authority is only their primary section, even if granted more", () => {
    expect(authoritySections(actor("section_vice", "uvuvi", ["kilimo"]))).toEqual(["uvuvi"]);
  });
});

describe("approving and managing members", () => {
  it("section head and vice manage officers of their own section only", () => {
    for (const r of ["section_head", "section_vice"] as Role[]) {
      const lead = actor(r, "kilimo");
      expect(canManageMember(lead, target("officer", "kilimo", [], { status: "pending" }))).toBe(true);
      expect(canManageMember(lead, target("officer", "mifugo", [], { status: "pending" }))).toBe(false);
      expect(canManageMember(lead, target("section_vice", "kilimo"))).toBe(false);
    }
  });
  it("admin manages everyone except admins; moderator everyone below moderator", () => {
    expect(canManageMember(actor("admin"), target("moderator"))).toBe(true);
    expect(canManageMember(actor("admin"), target("admin"))).toBe(false);
    expect(canManageMember(actor("moderator"), target("section_head", "uvuvi"))).toBe(true);
    expect(canManageMember(actor("moderator"), target("moderator"))).toBe(false);
  });
  it("nobody manages themselves except root", () => {
    const a = actor("admin");
    expect(canManageMember(a, { ...target("admin"), userId: a.userId })).toBe(false);
    expect(canManageMember(root, { ...target("officer"), userId: root.userId })).toBe(true);
  });
  it("officers manage nobody", () => {
    expect(canManageMember(actor("officer"), target("officer"))).toBe(false);
  });
});

describe("assigning roles", () => {
  it("only root assigns admin", () => {
    expect(assignableRoles(actor("admin"))).not.toContain("admin");
    expect(canAssignRole(root, target("moderator"), "admin")).toBe(true);
  });
  it("admin assigns moderator and section heads", () => {
    expect(canAssignRole(actor("admin"), target("officer"), "moderator")).toBe(true);
    expect(canAssignRole(actor("admin"), target("officer", "uvuvi"), "section_head")).toBe(true);
  });
  it("moderator assigns section heads and vices but not moderator", () => {
    const m = actor("moderator");
    expect(canAssignRole(m, target("officer"), "section_head")).toBe(true);
    expect(canAssignRole(m, target("officer"), "section_vice")).toBe(true);
    expect(canAssignRole(m, target("officer"), "moderator")).toBe(false);
  });
  it("section heads cannot assign roles", () => {
    expect(canAssignRole(actor("section_head"), target("officer"), "section_vice")).toBe(false);
  });
  it("roles are only assigned to active members", () => {
    expect(canAssignRole(actor("admin"), target("officer", "kilimo", [], { status: "pending" }), "section_head")).toBe(false);
  });
});

describe("approving guests: the approver chooses the role", () => {
  const pending = (primary: Section = "kilimo") => target("guest", primary, [], { status: "pending" });
  it("only root approves a Head of Department request", () => {
    expect(canApproveRequest(root, pending(), "admin")).toBe(true);
    expect(canApproveRequest(actor("admin"), pending(), "admin")).toBe(false);
    expect(canApproveRequest(actor("moderator"), pending(), "admin")).toBe(false);
  });
  it("HoD approves moderator and section heads; moderator approves section heads only", () => {
    expect(canApproveRequest(actor("admin"), pending(), "moderator")).toBe(true);
    expect(canApproveRequest(actor("admin"), pending("uvuvi"), "section_head")).toBe(true);
    expect(canApproveRequest(actor("moderator"), pending(), "moderator")).toBe(false);
    expect(canApproveRequest(actor("moderator"), pending(), "section_vice")).toBe(true);
  });
  it("section heads approve officers of their section but never HQ roles", () => {
    expect(canApproveRequest(actor("section_head", "kilimo"), pending("kilimo"), "officer")).toBe(true);
    expect(canApproveRequest(actor("section_head", "kilimo"), pending("mifugo"), "officer")).toBe(false);
    expect(canApproveRequest(actor("section_head", "kilimo"), pending("kilimo"), "section_vice")).toBe(false);
  });
  it("nobody approves someone as a guest, and approvable roles follow the approver", () => {
    expect(canApproveRequest(root, pending(), "guest")).toBe(false);
    expect(approvableRoles(root, pending())).toEqual(["admin", "moderator", "section_head", "section_vice", "officer"]);
    expect(approvableRoles(actor("admin"), pending())).toEqual(["moderator", "section_head", "section_vice", "officer"]);
    expect(approvableRoles(actor("section_vice", "uvuvi"), pending("uvuvi"))).toEqual(["officer"]);
    expect(approvableRoles(actor("officer"), pending())).toEqual([]);
  });
  it("guest is never handed out with a role change", () => {
    expect(canAssignRole(root, target("officer"), "guest")).toBe(false);
  });
});

describe("granting extra sections", () => {
  it("only the lead of the section being added can add it", () => {
    const o = target("officer", "kilimo");
    expect(canGrantSection(actor("section_head", "mifugo"), o, "mifugo")).toBe(true);
    expect(canGrantSection(actor("section_head", "kilimo"), o, "mifugo")).toBe(false);
    expect(canGrantSection(actor("admin"), o, "uvuvi")).toBe(true);
  });
  it("the primary section is never granted or revoked", () => {
    const o = target("officer", "kilimo", ["mifugo"]);
    expect(canGrantSection(actor("admin"), o, "kilimo")).toBe(false);
    expect(canRevokeSection(actor("admin"), o, "kilimo")).toBe(false);
    expect(canRevokeSection(actor("section_vice", "mifugo"), o, "mifugo")).toBe(true);
  });
});

describe("reading", () => {
  it("officers read only their own records", () => {
    const o = actor("officer", "kilimo");
    expect(canReadRecord(o, { ownerId: o.userId, section: "kilimo" })).toBe(true);
    expect(canReadRecord(o, { ownerId: "someone", section: "kilimo" })).toBe(false);
  });
  it("leads read their section; department reads all", () => {
    expect(canReadRecord(actor("section_head", "uvuvi"), { ownerId: "x", section: "uvuvi" })).toBe(true);
    expect(canReadRecord(actor("section_head", "uvuvi"), { ownerId: "x", section: "kilimo" })).toBe(false);
    expect(canReadRecord(actor("moderator"), { ownerId: "x", section: "kilimo" })).toBe(true);
  });
  it("leads see members of their section in HQ lists", () => {
    expect(canViewMembership(actor("section_head", "mifugo"), target("officer", "kilimo", ["mifugo"]))).toBe(true);
    expect(canViewMembership(actor("section_head", "mifugo"), target("officer", "kilimo"))).toBe(false);
  });
});

describe("helpers", () => {
  it("home actions follow sections and shared actions appear once", () => {
    const crops = actionsFor(["kilimo"]).map((a) => a.type);
    expect(crops).not.toContain("livestock_treatment");
    expect(crops).toContain("pest_outbreak");
    const both = actionsFor(["kilimo", "mifugo"]).map((a) => a.type);
    expect(both.filter((t) => t === "price")).toHaveLength(1);
  });
  it("compares versions numerically", () => {
    expect(compareVersions("1.2.10", "1.2.9")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBe(-1);
  });
});

describe("reopening sent reports", () => {
  it("lets the report's section leads, the department and root reopen; nobody else", () => {
    expect(canReopenReport(actor("section_head", "mifugo"), "mifugo")).toBe(true);
    expect(canReopenReport(actor("section_vice", "mifugo"), "mifugo")).toBe(true);
    expect(canReopenReport(actor("section_head", "kilimo"), "mifugo")).toBe(false);
    expect(canReopenReport(actor("admin"), "uvuvi")).toBe(true);
    expect(canReopenReport(actor("moderator"), "uvuvi")).toBe(true);
    expect(canReopenReport(actor("officer", "mifugo"), "mifugo")).toBe(false);
    expect(canReopenReport(actor("section_head", "mifugo", [], { status: "suspended" }), "mifugo")).toBe(false);
    expect(canReopenReport(root, "kilimo")).toBe(true);
  });
});
