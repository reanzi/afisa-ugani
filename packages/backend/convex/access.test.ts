/// <reference types="vite/client" />
/**
 * End-to-end access tests against an in-memory Convex (convex-test) with the
 * real convex-auth components: sign-up → join → approval chain → sync → audit.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import core, { sessionIdentity } from "@convex-dev/auth/test";
import { registerPassword } from "@convex-dev/auth/components/password/test";
import { registerUsername } from "@convex-dev/auth/components/username/test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const client = { app: "field" as const, version: "0.1.0" };
const hq = { app: "hq" as const, version: "0.1.0" };

function setup() {
  const t = convexTest(schema, modules);
  core.registerCore(t);
  registerPassword(t);
  registerUsername(t);
  return t;
}
type T = ReturnType<typeof setup>;

async function signUp(t: T, username: string) {
  const res = await t.mutation(api.auth.signUpWithUsernamePassword, {
    username,
    password: "Shamba-la-Mahindi-2026",
  });
  if (res.status !== "complete") throw new Error(`sign-up failed: ${JSON.stringify(res)}`);
  return t.withIdentity(sessionIdentity(res.tokens));
}

async function world() {
  const t = setup();
  const councilId: Id<"councils"> = await t.mutation(internal.admin.createCouncil, {
    name: "Halmashauri ya Majaribio",
    code: "TEST-DC",
    region: "Morogoro",
  });
  const ward = await t.run((ctx) => ctx.db.insert("areas", { councilId, kind: "ward", name: "Mzumbe" }));
  const village = await t.run((ctx) =>
    ctx.db.insert("areas", { councilId, kind: "village", name: "Changarawe", parentId: ward }),
  );

  const hod = await signUp(t, "hod_test");
  await t.mutation(internal.admin.seatMember, {
    username: "hod_test", councilCode: "TEST-DC", role: "admin", primarySection: "kilimo", name: "Mkuu wa Idara",
  });

  const root = await signUp(t, "root_test");
  await t.mutation(internal.admin.makeRoot, { username: "root_test" });

  return { t, councilId, ward, village, hod, root };
}

async function join(t: T, username: string, councilId: Id<"councils">, section: "kilimo" | "mifugo" | "uvuvi") {
  const user = await signUp(t, username);
  const membershipId = await user.mutation(api.memberships.requestJoin, {
    councilId, name: `Afisa ${username}`, primarySection: section, level: "vaeo", client,
  });
  return { user, membershipId };
}

describe("registration and approval chain", () => {
  it("a new officer starts pending and cannot use data functions", async () => {
    const { t, councilId } = await world();
    const { user } = await join(t, "afisa1", councilId, "kilimo");
    const me = await user.query(api.users.me, {});
    expect(me.memberships[0]?.status).toBe("pending");
    await expect(user.query(api.areas.list, { councilId })).rejects.toThrow(/haijaidhinishwa/);
  });

  it("officers can never call HQ functions, even when active", async () => {
    const { t, councilId, hod, village } = await world();
    const { user, membershipId } = await join(t, "afisa2", councilId, "kilimo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId, areaIds: [village], client: hq });
    await expect(user.query(api.memberships.listForHq, { councilId })).rejects.toThrow(/makao makuu/);
  });

  it("section heads approve only their own section; admin approves anyone", async () => {
    const { t, councilId, hod, village } = await world();
    const head = await join(t, "head_mifugo", councilId, "mifugo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId: head.membershipId, areaIds: [village], client: hq });
    await hod.mutation(api.memberships.assignRole, { councilId, membershipId: head.membershipId, role: "section_head", client: hq });

    const cropOfficer = await join(t, "afisa_kilimo", councilId, "kilimo");
    const livestockOfficer = await join(t, "afisa_mifugo", councilId, "mifugo");

    await expect(
      head.user.mutation(api.memberships.approve, { councilId, membershipId: cropOfficer.membershipId, areaIds: [village], client: hq }),
    ).rejects.toThrow(/ruhusa/);
    await head.user.mutation(api.memberships.approve, {
      councilId, membershipId: livestockOfficer.membershipId, areaIds: [village], client: hq,
    });

    const pendingSeenByHead = await head.user.query(api.memberships.listForHq, { councilId, status: "pending" });
    expect(pendingSeenByHead.map((m) => m.name)).not.toContain("Afisa afisa_kilimo");
  });

  it("an extra section is granted only by that section's lead", async () => {
    const { t, councilId, hod, village } = await world();
    const head = await join(t, "head_uvuvi", councilId, "uvuvi");
    await hod.mutation(api.memberships.approve, { councilId, membershipId: head.membershipId, areaIds: [village], client: hq });
    await hod.mutation(api.memberships.assignRole, { councilId, membershipId: head.membershipId, role: "section_vice", client: hq });
    const officer = await join(t, "afisa_mchanganyiko", councilId, "kilimo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId: officer.membershipId, areaIds: [village], client: hq });

    await expect(
      head.user.mutation(api.memberships.grantSection, { councilId, membershipId: officer.membershipId, section: "mifugo", client: hq }),
    ).rejects.toThrow();
    await head.user.mutation(api.memberships.grantSection, { councilId, membershipId: officer.membershipId, section: "uvuvi", client: hq });
    const me = await officer.user.query(api.users.me, {});
    expect(me.memberships[0]?.sections).toEqual(["kilimo", "uvuvi"]);
  });
});

describe("first deployment and council code sign-up", () => {
  it("bootstrapRoot creates the account and makes it root, and is safe to repeat", async () => {
    const t = setup();
    const msg = await t.action(internal.admin.bootstrapRoot, { username: "900000009", password: "Mzizi-Imara-2026", name: "Msimamizi" });
    expect(msg).toContain("now root");
    const again = await t.action(internal.admin.bootstrapRoot, { username: "900000009", password: "Mzizi-Imara-2026" });
    expect(again).toContain("Found");
    const res = await t.mutation(api.auth.signInWithUsernamePassword, { username: "900000009", password: "Mzizi-Imara-2026" });
    expect(res.status).toBe("complete");
  });

  it("a Head of Department joins with the council code and only root can approve", async () => {
    const t = setup();
    await t.action(internal.admin.bootstrapRoot, { username: "900000009", password: "Mzizi-Imara-2026" });
    const councilId = await t.mutation(internal.admin.createCouncil, { name: "Halmashauri ya Mji ya Bagamoyo", code: "BAGAMOYO-TC", region: "Pwani" });
    const rootRes = await t.mutation(api.auth.signInWithUsernamePassword, { username: "900000009", password: "Mzizi-Imara-2026" });
    if (rootRes.status !== "complete") throw new Error("root sign-in failed");
    const root = t.withIdentity(sessionIdentity(rootRes.tokens));
    await root.mutation(api.councils.update, { councilId, registrationOpen: false });

    const hod = await signUp(t, "100000001");
    expect(await t.query(api.councils.lookupByCode, { code: "bagamoyo-tc" })).toMatchObject({ name: "Halmashauri ya Mji ya Bagamoyo" });
    const membershipId = await hod.mutation(api.memberships.requestJoin, {
      councilCode: "bagamoyo-tc", requestedRole: "admin", name: "Mkuu Idara Kilimo", primarySection: "kilimo", client: hq,
    });
    const me = await hod.query(api.users.me, {});
    expect(me.memberships[0]).toMatchObject({ status: "pending", requestedRole: "admin", role: "officer" });

    // A council closed to officers still rejects the officer list path.
    const officer = await signUp(t, "afisa_closed");
    await expect(officer.mutation(api.memberships.requestJoin, { councilId, name: "Afisa Mmoja", primarySection: "kilimo", level: "vaeo", client })).rejects.toThrow(/haipokei/);

    await root.mutation(api.memberships.approve, { councilId, membershipId, areaIds: [], client: hq });
    const after = await hod.query(api.users.me, {});
    expect(after.memberships[0]).toMatchObject({ status: "active", role: "admin", requestedRole: null });
    // The new HoD can now use HQ.
    expect(await hod.query(api.memberships.listForHq, { councilId })).toBeDefined();
  });

  it("a HoD cannot approve another HoD request, but approves a section head request", async () => {
    const { t, councilId, hod } = await world();
    await t.run((ctx) => ctx.db.patch(councilId, { code: "TEST-DC" }));
    const asksAdmin = await signUp(t, "anaomba_hod");
    const m1 = await asksAdmin.mutation(api.memberships.requestJoin, { councilCode: "TEST-DC", requestedRole: "admin", name: "Mtu Mwingine", primarySection: "mifugo", client: hq });
    await expect(hod.mutation(api.memberships.approve, { councilId, membershipId: m1, areaIds: [], client: hq })).rejects.toThrow(/msimamizi wa mfumo/);
    const asksHead = await signUp(t, "anaomba_head");
    const m2 = await asksHead.mutation(api.memberships.requestJoin, { councilCode: "TEST-DC", requestedRole: "section_head", name: "Mkuu Mifugo", primarySection: "mifugo", client: hq });
    await hod.mutation(api.memberships.approve, { councilId, membershipId: m2, areaIds: [], client: hq });
    const me = await asksHead.query(api.users.me, {});
    expect(me.memberships[0]).toMatchObject({ role: "section_head", status: "active" });
  });
});

describe("root stays hidden", () => {
  it("root's actions and identity never show to the HoD", async () => {
    const { t, councilId, root, village } = await world();
    const officer = await join(t, "afisa_root_test", councilId, "kilimo");
    await root.mutation(api.memberships.approve, { councilId, membershipId: officer.membershipId, areaIds: [village], client: hq });

    const hod = await t.withIdentity(await (async () => {
      const res = await t.mutation(api.auth.signInWithUsernamePassword, { username: "hod_test", password: "Shamba-la-Mahindi-2026" });
      if (res.status !== "complete") throw new Error("sign-in failed");
      return sessionIdentity(res.tokens);
    })());
    const members = await hod.query(api.memberships.listForHq, { councilId });
    const approved = members.find((m) => m._id === officer.membershipId);
    expect(approved?.status).toBe("active");
    expect(approved?.decidedByName).toBeNull();

    const audit = await hod.query(api.auditLog.recent, { councilId });
    expect(audit.some((a) => a.actorRole === "root")).toBe(false);
    expect(audit.some((a) => a.action === "membership.approve")).toBe(false);

    const rootAudit = await root.query(api.auditLog.recent, { councilId });
    expect(rootAudit.some((a) => a.action === "membership.approve" && a.actorRole === "root")).toBe(true);

    const meHod = await hod.query(api.users.me, {});
    expect("isRoot" in meHod).toBe(false);
  });
});

describe("sync", () => {
  const rec = (over: Record<string, unknown> = {}) => ({
    clientId: "0192f3a0-7c1e-7d2a-9b3c-4d5e6f708192",
    type: "activity",
    section: "kilimo" as const,
    occurredAt: Date.now() - 1000,
    payload: { text: "Nimetembelea shamba darasa" },
    payloadVersion: 1,
    clientUpdatedAt: Date.now() - 1000,
    ...over,
  });

  it("push is idempotent, enforces sections and is audited", async () => {
    const { t, councilId, hod, village } = await world();
    const { user, membershipId } = await join(t, "afisa_sync", councilId, "kilimo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId, areaIds: [village], client: hq });

    const record = rec({ areaId: village });
    const first = await user.mutation(api.sync.pushRecords, { councilId, client, records: [record] });
    expect(first.results[0]?.status).toBe("accepted");
    // The same push retried after a lost response.
    const again = await user.mutation(api.sync.pushRecords, { councilId, client, records: [record] });
    expect(again.results[0]?.status).toBe("stale");

    const wrong = await user.mutation(api.sync.pushRecords, {
      councilId, client,
      records: [rec({ clientId: "0192f3a0-7c1e-7d2a-9b3c-4d5e6f708193", section: "mifugo" })],
    });
    expect(wrong.results[0]).toMatchObject({ status: "rejected", reason: "SECTION_NOT_ALLOWED" });

    const pulled = await user.query(api.sync.pullChanges, { councilId, since: 0 });
    expect(pulled.records).toHaveLength(1);

    const audit = await hod.query(api.auditLog.recent, { councilId });
    expect(audit.some((a) => a.action === "record.create")).toBe(true);
  });

  it("rejects payloads that do not match their form", async () => {
    const { t, councilId, hod, village } = await world();
    const { user, membershipId } = await join(t, "afisa_payload", councilId, "kilimo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId, areaIds: [village], client: hq });
    const res = await user.mutation(api.sync.pushRecords, {
      councilId, client,
      records: [
        rec({ clientId: "0192f3a0-7c1e-7d2a-9b3c-4d5e6f708194", type: "pest_outbreak", payload: { pest: "Nzige", crop: "mahindi", severity: "kubwa" } }),
        rec({ clientId: "0192f3a0-7c1e-7d2a-9b3c-4d5e6f708195", type: "pest_outbreak", payload: { pest: "Nzige", crop: "mahindi", severity: "kubwa", areaAffectedHa: 4 } }),
      ],
    });
    expect(res.results[0]).toMatchObject({ status: "rejected", reason: "INVALID_PAYLOAD:MISSING:areaAffectedHa" });
    expect(res.results[1]?.status).toBe("accepted");
  });

  it("an officer cannot overwrite another officer's record", async () => {
    const { t, councilId, hod, village } = await world();
    const a = await join(t, "afisa_a", councilId, "kilimo");
    const b = await join(t, "afisa_b", councilId, "kilimo");
    for (const m of [a, b]) {
      await hod.mutation(api.memberships.approve, { councilId, membershipId: m.membershipId, areaIds: [village], client: hq });
    }
    await a.user.mutation(api.sync.pushRecords, { councilId, client, records: [rec()] });
    const res = await b.user.mutation(api.sync.pushRecords, {
      councilId, client, records: [rec({ clientUpdatedAt: Date.now(), payload: { text: "imebadilishwa" } })],
    });
    expect(res.results[0]).toMatchObject({ status: "rejected", reason: "NOT_OWNER" });
  });
});
