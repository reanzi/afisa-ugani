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
  const { councilId, code }: { councilId: Id<"councils">; code: string } = await t.mutation(internal.admin.createCouncil, {
    name: "Halmashauri ya Majaribio",
    region: "Morogoro",
  });
  const ward = await t.run((ctx) => ctx.db.insert("areas", { councilId, kind: "ward", name: "Mzumbe" }));
  const village = await t.run((ctx) =>
    ctx.db.insert("areas", { councilId, kind: "village", name: "Changarawe", parentId: ward }),
  );

  const hod = await signUp(t, "hod_test");
  await t.mutation(internal.admin.seatMember, {
    username: "hod_test", councilCode: code, role: "admin", primarySection: "kilimo", name: "Mkuu wa Idara",
  });

  const root = await signUp(t, "root_test");
  await t.mutation(internal.admin.makeRoot, { username: "root_test" });

  return { t, councilId, code, ward, village, hod, root };
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
    const { councilId, code } = await t.mutation(internal.admin.createCouncil, { name: "Halmashauri ya Mji ya Bagamoyo", region: "Pwani" });
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const rootRes = await t.mutation(api.auth.signInWithUsernamePassword, { username: "900000009", password: "Mzizi-Imara-2026" });
    if (rootRes.status !== "complete") throw new Error("root sign-in failed");
    const root = t.withIdentity(sessionIdentity(rootRes.tokens));
    await root.mutation(api.councils.update, { councilId, registrationOpen: false });

    const hod = await signUp(t, "100000001");
    // Typed in lower case, with or without the dash.
    expect(await t.query(api.councils.lookupByCode, { code: code.toLowerCase() })).toMatchObject({ name: "Halmashauri ya Mji ya Bagamoyo" });
    expect(await t.query(api.councils.lookupByCode, { code: code.replace("-", "") })).not.toBeNull();
    const membershipId = await hod.mutation(api.memberships.requestJoin, {
      councilCode: code.toLowerCase(), requestedRole: "admin", name: "Mkuu Idara Kilimo", primarySection: "kilimo", client: hq,
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
    const { t, councilId, code, hod } = await world();
    const asksAdmin = await signUp(t, "anaomba_hod");
    const m1 = await asksAdmin.mutation(api.memberships.requestJoin, { councilCode: code, requestedRole: "admin", name: "Mtu Mwingine", primarySection: "mifugo", client: hq });
    await expect(hod.mutation(api.memberships.approve, { councilId, membershipId: m1, areaIds: [], client: hq })).rejects.toThrow(/msimamizi wa mfumo/);
    const asksHead = await signUp(t, "anaomba_head");
    const m2 = await asksHead.mutation(api.memberships.requestJoin, { councilCode: code, requestedRole: "section_head", name: "Mkuu Mifugo", primarySection: "mifugo", client: hq });
    await hod.mutation(api.memberships.approve, { councilId, membershipId: m2, areaIds: [], client: hq });
    const me = await asksHead.query(api.users.me, {});
    expect(me.memberships[0]).toMatchObject({ role: "section_head", status: "active" });
  });
});

describe("council codes and NaPA addresses", () => {
  async function rootOf(t: T) {
    const res = await t.mutation(api.auth.signInWithUsernamePassword, { username: "root_test", password: "Shamba-la-Mahindi-2026" });
    if (res.status !== "complete") throw new Error("root sign-in failed");
    return t.withIdentity(sessionIdentity(res.tokens));
  }
  const ward = {
    name: "Dunda",
    villages: [
      { name: "Benki", streets: [{ name: "Bagamoyo Rd.", kind: "ROAD", surface: "PAVED", addresses: 7 }, { name: "Fuko St.", kind: "STREET", surface: "EARTH", addresses: 2 }] },
      { name: "Majani Mapana", streets: [{ name: "Kihabu St.", kind: "STREET", surface: "EARTH", addresses: 30 }] },
    ],
  };

  it("root creates a council with a unique generated code and can replace it", async () => {
    const { t } = await world();
    const root = await rootOf(t);
    const a = await root.mutation(api.councils.create, { name: "Halmashauri ya Wilaya ya Bagamoyo", region: "Pwani" });
    const b = await root.mutation(api.councils.create, { name: "Halmashauri ya Mji wa Kibaha", region: "Pwani" });
    expect(a.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(a.code).not.toBe(b.code);
    const fresh = await root.mutation(api.councils.regenerateCode, { councilId: a.councilId });
    expect(fresh).not.toBe(a.code);
    expect(await t.query(api.councils.lookupByCode, { code: a.code })).toBeNull();
    expect(await t.query(api.councils.lookupByCode, { code: fresh })).not.toBeNull();
  });

  it("an old-format code still works until it is replaced", async () => {
    const { t, councilId } = await world();
    await t.run((ctx) => ctx.db.patch(councilId, { code: "BAMOYO" }));
    expect(await t.query(api.councils.lookupByCode, { code: "bamoyo" })).not.toBeNull();
  });

  it("imports a NaPA ward once, updates counts on re-import, and keeps streets out of officers' lists", async () => {
    const { t, councilId, hod } = await world();
    const root = await rootOf(t);
    const first = await root.mutation(api.areas.importNapaWard, { councilId, ward });
    expect(first).toEqual({ wardsAdded: 1, villagesAdded: 2, streetsAdded: 3, streetsUpdated: 0 });
    const updated = { ...ward, villages: [{ ...ward.villages[0]!, streets: [{ ...ward.villages[0]!.streets[0]!, addresses: 9 }] }] };
    const again = await root.mutation(api.areas.importNapaWard, { councilId, ward: updated });
    expect(again).toEqual({ wardsAdded: 0, villagesAdded: 0, streetsAdded: 0, streetsUpdated: 1 });

    const list = await hod.query(api.areas.list, { councilId });
    expect(list.some((a) => a.kind === "street")).toBe(false);
    const benki = list.find((a) => a.name === "Benki")!;
    const streets = await hod.query(api.areas.streets, { councilId, villageId: benki._id });
    expect(streets.find((s) => s.name === "Bagamoyo Rd.")?.addresses).toBe(9);

    await expect(hod.mutation(api.areas.importNapaWard, { councilId, ward, client: hq })).rejects.toThrow(/ruhusa/);
    await root.mutation(api.areas.finishNapaImport, { councilId, reportDate: "01/07/2026", totals: { wards: 1, villages: 2, streets: 3, addresses: 39 } });
    const all = await root.query(api.councils.listAll, {});
    expect(all.find((c) => c._id === councilId)?.addressImport).toMatchObject({ reportDate: "01/07/2026", streets: 3 });
  });
});

describe("accounts", () => {
  it("the check number used to sign up is kept on the user; name and phone are checked", async () => {
    const t = setup();
    const user = await signUp(t, "111234567");
    expect(await user.query(api.users.me, {})).toMatchObject({ checkNumber: "111234567", name: null });
    await expect(user.mutation(api.users.updateProfile, { name: "Neema", phone: "0712345678" })).rejects.toThrow(/jina kamili/);
    await expect(user.mutation(api.users.updateProfile, { name: "Neema Mwakalinga", phone: "12345" })).rejects.toThrow(/simu/);
    await user.mutation(api.users.updateProfile, { name: "  Neema   Mwakalinga ", phone: "+255 712 345 678" });
    expect(await user.query(api.users.me, {})).toMatchObject({ name: "Neema Mwakalinga", phone: "0712345678" });
  });
});

describe("HQ sees sent reports only, and a sent report is sealed", () => {
  const report = (avg: number) => ({
    rows: [{ commodity: "Sukari", unit: "kg", average: avg, min: avg - 100, max: avg + 100, count: 3, availability: "haba" }],
    note: "Sukari imepanda bei.",
  });
  const uuid = (n: number) => `0192f3a0-7c1e-7d2a-9b3c-${String(n).padStart(12, "0")}`;
  type Rows = { rows: { average: number }[] };

  async function officer(name: string) {
    const w = await world();
    const o = await join(w.t, name, w.councilId, "kilimo");
    await w.hod.mutation(api.memberships.approve, { councilId: w.councilId, membershipId: o.membershipId, areaIds: [w.village], client: hq });
    return { ...w, user: o.user, membershipId: o.membershipId };
  }
  const priceRecord = (n: number, occurredAt: number, payload: Record<string, unknown>) => ({
    clientId: uuid(n), type: "price", section: "kilimo" as const, occurredAt, payload, payloadVersion: 1, clientUpdatedAt: occurredAt,
  });

  it("prices stay private until sent; a sent report cannot be sent again", async () => {
    const { councilId, hod, user } = await officer("afisa_bei");
    await user.mutation(api.sync.pushRecords, {
      councilId, client, records: [priceRecord(1, Date.now() - 1000, { commodity: "Sukari", unit: "kg", price: 3200, priceType: "rejareja" })],
    });
    expect(await hod.query(api.submissions.forHq, { councilId, kind: "food_prices", period: "2026-11" })).toEqual([]);
    expect((await hod.query(api.auditLog.recent, { councilId })).some((a) => a.entity === "records")).toBe(false);

    const send = (n: number, avg: number) =>
      user.mutation(api.submissions.submit, {
        councilId, client, clientId: uuid(100 + n), kind: "food_prices", period: "2026-11", areaLabel: "Kijiji cha Changarawe",
        payload: report(avg), payloadVersion: 1, clientSubmittedAt: Date.now(),
      });
    await send(1, 3200);
    await send(1, 3200); // a retry after a lost response is fine
    await expect(send(2, 3300)).rejects.toThrow(/imefungwa/);

    const seen = await hod.query(api.submissions.forHq, { councilId, kind: "food_prices", period: "2026-11" });
    expect(seen).toHaveLength(1);
    expect((seen[0]!.payload as Rows).rows[0]!.average).toBe(3200);
    expect(seen[0]).toMatchObject({ officerName: "Afisa afisa_bei", auto: false });
    const mine = await user.query(api.submissions.mine, { councilId, kind: "food_prices" });
    expect(mine[0]).toMatchObject({ period: "2026-11", auto: false });
  });

  it("a section lead reopens a report with a note; the officer corrects and sends it again", async () => {
    const { t, councilId, hod, village } = await world();
    const o = await join(t, "afisa_rek", councilId, "kilimo");
    const lead = await join(t, "mkuu_kilimo", councilId, "kilimo");
    const other = await join(t, "mkuu_mif", councilId, "mifugo");
    for (const m of [o, lead, other]) await hod.mutation(api.memberships.approve, { councilId, membershipId: m.membershipId, areaIds: [village], client: hq });
    await hod.mutation(api.memberships.assignRole, { councilId, membershipId: lead.membershipId, role: "section_head", client: hq });
    await hod.mutation(api.memberships.assignRole, { councilId, membershipId: other.membershipId, role: "section_head", client: hq });
    const send = (n: number, avg: number) =>
      o.user.mutation(api.submissions.submit, {
        councilId, client, clientId: uuid(600 + n), kind: "food_prices", period: "2026-11", areaLabel: "Changarawe",
        payload: report(avg), payloadVersion: 1, clientSubmittedAt: Date.now(),
      });
    await send(1, 3200);
    const [sent] = await lead.user.query(api.submissions.forHq, { councilId, kind: "food_prices", period: "2026-11" });
    expect(sent).toMatchObject({ revision: 1, reopened: null, canReopen: true });

    // Another section's head cannot see or reopen it; an officer cannot reopen.
    await expect(other.user.mutation(api.submissions.reopen, { councilId, submissionId: sent!._id, note: "Rekebisha bei.", client: hq })).rejects.toThrow(/mamlaka/);
    await expect(o.user.mutation(api.submissions.reopen, { councilId, submissionId: sent!._id, note: "Rekebisha bei.", client: hq })).rejects.toThrow(/makao makuu/);
    await expect(lead.user.mutation(api.submissions.reopen, { councilId, submissionId: sent!._id, note: "x", client: hq })).rejects.toThrow(/rekebisha nini/);

    await lead.user.mutation(api.submissions.reopen, { councilId, submissionId: sent!._id, note: "Bei ya sukari si sahihi; angalia tena.", client: hq });
    const mine = await o.user.query(api.submissions.mine, { councilId, kind: "food_prices" });
    expect(mine[0]!.reopened).toMatchObject({ byName: "Afisa mkuu_kilimo", note: "Bei ya sukari si sahihi; angalia tena." });

    await send(2, 3000);
    const [fixed] = await hod.query(api.submissions.forHq, { councilId, kind: "food_prices", period: "2026-11" });
    expect(fixed).toMatchObject({ revision: 2, reopened: null, corrections: 1 });
    expect((fixed!.payload as Rows).rows[0]!.average).toBe(3000);
    // Sealed again.
    await expect(send(3, 2900)).rejects.toThrow(/imefungwa/);
    const actions = (await hod.query(api.auditLog.recent, { councilId })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["submission.reopen", "submission.resubmit"]));
  });

  it("section leads see only their section's reports; officers cannot read HQ reports", async () => {
    const { t, councilId, hod, village } = await world();
    const o = await join(t, "afisa_k", councilId, "kilimo");
    const head = await join(t, "mkuu_mifugo", councilId, "mifugo");
    for (const m of [o, head]) await hod.mutation(api.memberships.approve, { councilId, membershipId: m.membershipId, areaIds: [village], client: hq });
    await hod.mutation(api.memberships.assignRole, { councilId, membershipId: head.membershipId, role: "section_head", client: hq });
    await o.user.mutation(api.submissions.submit, {
      councilId, client, clientId: uuid(201), kind: "food_prices", period: "2026-11", areaLabel: "Changarawe",
      payload: report(3000), payloadVersion: 1, clientSubmittedAt: Date.now(),
    });
    expect(await head.user.query(api.submissions.forHq, { councilId, kind: "food_prices", period: "2026-11" })).toEqual([]);
    expect(await hod.query(api.submissions.forHq, { councilId, kind: "food_prices", period: "2026-11" })).toHaveLength(1);
    await expect(o.user.query(api.submissions.forHq, { councilId, kind: "food_prices", period: "2026-11" })).rejects.toThrow(/makao makuu/);
  });

  it("rejects an empty report, and a monthly report before the month ends", async () => {
    const { councilId, user } = await officer("afisa_tupu");
    await expect(user.mutation(api.submissions.submit, {
      councilId, client, clientId: uuid(301), kind: "food_prices", period: "2026-11", areaLabel: "x",
      payload: { rows: [] }, payloadVersion: 1, clientSubmittedAt: Date.now(),
    })).rejects.toThrow(/NO_ROWS/);
    await expect(user.mutation(api.submissions.submit, {
      councilId, client, clientId: uuid(302), kind: "monthly", period: "2099-01", areaLabel: "x",
      payload: { kind: "monthly", month: "2099-01", header: {}, parts: [{}] }, payloadVersion: 1, clientSubmittedAt: Date.now(),
    })).rejects.toThrow(/mwezi kuisha/);
  });

  it("only the Head of Department or vice switches auto-send", async () => {
    const { t, councilId, hod, village } = await world();
    const head = await join(t, "mkuu_k", councilId, "kilimo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId: head.membershipId, areaIds: [village], client: hq });
    await hod.mutation(api.memberships.assignRole, { councilId, membershipId: head.membershipId, role: "section_head", client: hq });
    await expect(head.user.mutation(api.councils.setAutoSend, { councilId, food: true, monthly: true, client: hq })).rejects.toThrow(/Mkuu wa Idara/);
    await hod.mutation(api.councils.setAutoSend, { councilId, food: true, monthly: false, client: hq });
    expect(await hod.query(api.councils.settings, { councilId })).toMatchObject({ autoSend: { food: true, monthly: false }, canEdit: true });
    const me = await head.user.query(api.users.me, {});
    expect(me.memberships[0]!.autoSend).toEqual({ food: true, monthly: false });
  });

  it("auto-send sends what was entered on the due date, and nothing for an officer who entered nothing", async () => {
    const { t, councilId, hod, village, user, membershipId } = await officer("afisa_auto");
    const idle = await join(t, "afisa_kimya", councilId, "kilimo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId: idle.membershipId, areaIds: [village], client: hq });
    await hod.mutation(api.councils.setAutoSend, { councilId, food: true, monthly: true, client: hq });

    await user.mutation(api.sync.pushRecords, {
      councilId, client,
      records: [
        priceRecord(401, Date.now() - 5000, { commodity: "Sukari", unit: "kg", price: 3000, priceType: "sokoni", foodPeriod: "2026-11" }),
        priceRecord(402, Date.now() - 4000, { commodity: "sukari", unit: "kg", price: 3400, priceType: "rejareja", foodPeriod: "2026-11" }),
      ],
    });
    const queued = await t.mutation(internal.autoSend.runFood, { period: "2026-11" });
    expect(queued).toMatchObject({ councils: 1, queued: 2 }); // officers only, not the Head of Department
    expect(await t.mutation(internal.autoSend.foodForOfficer, { membershipId, period: "2026-11" })).toBe("sent");
    expect(await t.mutation(internal.autoSend.foodForOfficer, { membershipId, period: "2026-11" })).toBe("already-sent");
    expect(await t.mutation(internal.autoSend.foodForOfficer, { membershipId: idle.membershipId, period: "2026-11" })).toBe("nothing-entered");

    const seen = await hod.query(api.submissions.forHq, { councilId, kind: "food_prices", period: "2026-11" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ auto: true });
    expect((seen[0]!.payload as Rows).rows[0]!.average).toBe(3200);
    const missing = await hod.query(api.submissions.missingForHq, { councilId, kind: "food_prices", period: "2026-11" });
    expect(missing.map((x) => x.name)).toContain("Afisa afisa_kimya");
    expect(missing.map((x) => x.name)).not.toContain("Afisa afisa_auto");
    // The officer's phone learns the report is sealed.
    expect((await user.query(api.submissions.mine, { councilId, kind: "food_prices" }))[0]).toMatchObject({ auto: true, period: "2026-11" });
  });

  it("auto-send builds the monthly ARDS report on the server from synced entries and the review", async () => {
    const { t, councilId, hod, user, membershipId } = await officer("afisa_mwezi");
    // 15 October 2026, 10:00 in Tanzania.
    const oct15 = Date.UTC(2026, 9, 15, 7, 0);
    await user.mutation(api.sync.pushRecords, {
      councilId, client,
      records: [
        { clientId: uuid(502), type: "training", section: "kilimo", occurredAt: oct15, payload: { topic: "Kupanda kwa mistari", method: "shamba_darasa", men: 10, women: 12 }, payloadVersion: 1, clientUpdatedAt: oct15 },
        { clientId: uuid(503), type: "monthly_review", section: "kilimo", occurredAt: oct15, payload: { month: "2026-10", achievements: "Wakulima 22 wamefundishwa." }, payloadVersion: 1, clientUpdatedAt: oct15 },
      ],
    });
    expect(await t.mutation(internal.autoSend.monthlyForOfficer, { membershipId, period: "2026-10" })).toBe("sent");
    const seen = await hod.query(api.submissions.forHq, { councilId, kind: "monthly", period: "2026-10" });
    const rep = seen[0]!.payload as { kind: string; month: string; parts: { blocks: { id: string; text?: string }[] }[] };
    expect(rep).toMatchObject({ kind: "monthly", month: "2026-10" });
    const achievements = rep.parts.flatMap((p) => p.blocks).find((b) => b.id === "1.3a");
    expect(achievements?.text).toContain("Wakulima 22");
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

    // The officer's entries are theirs: HQ does not see them, not even in the audit log.
    const audit = await hod.query(api.auditLog.recent, { councilId });
    expect(audit.some((a) => a.entity === "records")).toBe(false);
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

describe("photos", () => {
  const recordId = "0192f3a0-7c1e-7d2a-9b3c-4d5e6f708200";
  const photoId = (n: number) => `0192f3a0-7c1e-7d2a-9b3c-4d5e6f7083${String(n).padStart(2, "0")}`;
  const jpeg = (bytes = 2000) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
  const meta = { shot: "karibu" as const, width: 1600, height: 1200, takenAt: Date.now() - 500 };

  async function officerWithRecord() {
    const w = await world();
    const { user, membershipId } = await join(w.t, "afisa_picha", w.councilId, "kilimo");
    await w.hod.mutation(api.memberships.approve, { councilId: w.councilId, membershipId, areaIds: [w.village], client: hq });
    await user.mutation(api.sync.pushRecords, {
      councilId: w.councilId,
      client,
      records: [{
        clientId: recordId, type: "activity", section: "kilimo", occurredAt: Date.now() - 1000,
        payload: { text: "Shamba la mahindi lenye viwavijeshi" }, payloadVersion: 1, clientUpdatedAt: Date.now() - 1000,
      }],
    });
    const store = (blob: Blob) => w.t.run((ctx) => ctx.storage.store(blob));
    return { ...w, user, store };
  }

  it("attaches a photo once, even when the phone repeats the call", async () => {
    const { t, councilId, user, hod, store } = await officerWithRecord();
    const storageId = await store(jpeg());
    const first = await user.mutation(api.media.attach, { councilId, client, clientId: photoId(1), recordClientId: recordId, storageId, ...meta });
    expect(first.status).toBe("attached");
    // Retried after a lost reply, with a second upload of the same photo.
    const dup = await store(jpeg());
    const again = await user.mutation(api.media.attach, { councilId, client, clientId: photoId(1), recordClientId: recordId, storageId: dup, ...meta });
    expect(again.status).toBe("exists");
    expect(await t.run(async (ctx) => (await ctx.storage.get(dup)) === null)).toBe(true);

    const pulled = await user.query(api.media.changesSince, { councilId, since: 0 });
    expect(pulled.media).toHaveLength(1);
    expect(await user.query(api.media.url, { councilId, clientId: photoId(1) })).toMatch(/^https?:/);

    // The photo is the officer's: HQ gets no link and sees nothing in the audit log.
    await expect(hod.query(api.media.url, { councilId, clientId: photoId(1) })).resolves.toBeNull();
    const audit = await hod.query(api.auditLog.recent, { councilId });
    expect(audit.some((a) => a.entity === "media")).toBe(false);
  });

  it("refuses photos for someone else's record, wrong file types and too many photos", async () => {
    const { t, councilId, user, hod, village, store } = await officerWithRecord();
    const other = await join(t, "afisa_mwingine", councilId, "kilimo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId: other.membershipId, areaIds: [village], client: hq });
    const s1 = await store(jpeg());
    const notMine = await other.user.mutation(api.media.attach, { councilId, client, clientId: photoId(2), recordClientId: recordId, storageId: s1, ...meta });
    expect(notMine).toMatchObject({ status: "rejected", reason: expect.stringMatching(/haipo/) });
    expect(await t.run(async (ctx) => (await ctx.storage.get(s1)) === null)).toBe(true);

    const png = await store(new Blob([new Uint8Array(100)], { type: "image/png" }));
    const wrongType = await user.mutation(api.media.attach, { councilId, client, clientId: photoId(3), recordClientId: recordId, storageId: png, ...meta });
    expect(wrongType).toMatchObject({ status: "rejected", reason: expect.stringMatching(/JPEG/) });
    expect(await t.run(async (ctx) => (await ctx.storage.get(png)) === null)).toBe(true);

    for (let i = 10; i < 16; i++) {
      const s = await store(jpeg());
      await user.mutation(api.media.attach, { councilId, client, clientId: photoId(i), recordClientId: recordId, storageId: s, ...meta });
    }
    const seventh = await store(jpeg());
    const tooMany = await user.mutation(api.media.attach, { councilId, client, clientId: photoId(20), recordClientId: recordId, storageId: seventh, ...meta });
    expect(tooMany).toMatchObject({ status: "rejected", reason: expect.stringMatching(/picha 6/) });
  });

  it("deleting a photo or its record deletes the file", async () => {
    const { t, councilId, user, store } = await officerWithRecord();
    const a = await store(jpeg());
    const b = await store(jpeg());
    await user.mutation(api.media.attach, { councilId, client, clientId: photoId(30), recordClientId: recordId, storageId: a, ...meta });
    await user.mutation(api.media.attach, { councilId, client, clientId: photoId(31), recordClientId: recordId, storageId: b, ...meta });

    await user.mutation(api.media.remove, { councilId, client, clientId: photoId(30) });
    expect(await t.run(async (ctx) => (await ctx.storage.get(a)) === null)).toBe(true);

    await user.mutation(api.sync.pushRecords, {
      councilId, client,
      records: [{
        clientId: recordId, type: "activity", section: "kilimo", occurredAt: Date.now() - 1000,
        payload: { text: "Shamba la mahindi lenye viwavijeshi" }, payloadVersion: 1, clientUpdatedAt: Date.now(), deletedAt: Date.now(),
      }],
    });
    expect(await t.run(async (ctx) => (await ctx.storage.get(b)) === null)).toBe(true);
    const pulled = await user.query(api.media.changesSince, { councilId, since: 0 });
    expect(pulled.media.every((m) => m.deletedAt !== null)).toBe(true);
  });
});

describe("usage policy", () => {
  it("an officer agrees once to the current version; old versions are refused", async () => {
    const { t, councilId } = await world();
    const { user } = await join(t, "afisa_sera", councilId, "kilimo");
    expect((await user.query(api.users.me, {})).policyVersion).toBeNull();
    await expect(user.mutation(api.users.acceptPolicy, { version: "2020-01", acceptedAt: Date.now(), client })).rejects.toThrow(/Toleo/);
    const { POLICY_VERSION } = await import("@afisa/shared");
    await user.mutation(api.users.acceptPolicy, { version: POLICY_VERSION, acceptedAt: Date.now() - 60_000, client });
    expect((await user.query(api.users.me, {})).policyVersion).toBe(POLICY_VERSION);
  });
});

describe("presets and production plans", () => {
  const id = (n: number) => `0192f3a0-7c1e-7d2a-9b3c-4d5e6f7084${String(n).padStart(2, "0")}`;

  async function setup() {
    const w = await world();
    const officer = await join(w.t, "afisa_tija", w.councilId, "kilimo");
    await w.hod.mutation(api.memberships.approve, { councilId: w.councilId, membershipId: officer.membershipId, areaIds: [w.village], client: hq });
    const head = await join(w.t, "mkuu_mifugo", w.councilId, "mifugo");
    await w.hod.mutation(api.memberships.approve, { councilId: w.councilId, membershipId: head.membershipId, areaIds: [w.village], client: hq });
    await w.hod.mutation(api.memberships.assignRole, { councilId: w.councilId, membershipId: head.membershipId, role: "section_head", client: hq });
    return { ...w, officer: officer.user, livestockHead: head.user };
  }

  it("a yield waits for approval by the section's lead; HQ sees it with the council average", async () => {
    const { councilId, officer, hod, livestockHead } = await setup();
    const res = await officer.mutation(api.presets.propose, { councilId, client, clientId: id(1), key: "tija:mahindi", value: 2.5, proposedAt: Date.now() });
    expect(res.status).toBe("pending");
    // Repeating the same proposal changes nothing.
    await officer.mutation(api.presets.propose, { councilId, client, clientId: id(1), key: "tija:mahindi", value: 2.5, proposedAt: Date.now() });

    const forHod = await hod.query(api.presets.forHq, { councilId, status: "pending" });
    expect(forHod).toHaveLength(1);
    expect(forHod[0]).toMatchObject({ key: "tija:mahindi", value: 2.5, canDecide: true, officerName: "Afisa afisa_tija" });

    // The livestock head cannot see or approve a crop officer's settings.
    expect(await livestockHead.query(api.presets.forHq, { councilId })).toHaveLength(0);

    await expect(hod.mutation(api.presets.decide, { councilId, client: hq, presetId: forHod[0]!._id, approve: false })).rejects.toThrow(/sababu/);
    await hod.mutation(api.presets.decide, { councilId, client: hq, presetId: forHod[0]!._id, approve: true });
    const mine = await officer.query(api.presets.mine, { councilId });
    expect(mine[0]).toMatchObject({ status: "approved", approvedValue: 2.5 });

    // A change waits again while the approved value stays in use.
    await officer.mutation(api.presets.propose, { councilId, client, clientId: id(2), key: "tija:mahindi", value: 3, proposedAt: Date.now() });
    const after = await officer.query(api.presets.mine, { councilId });
    expect(after[0]).toMatchObject({ status: "pending", value: 3, approvedValue: 2.5 });
  });

  it("refuses bad values and other sections' plans", async () => {
    const { councilId, officer } = await setup();
    await expect(
      officer.mutation(api.presets.propose, { councilId, client, clientId: id(3), key: "tija:mahindi", value: 500, proposedAt: Date.now() }),
    ).rejects.toThrow(/OUT_OF_RANGE/);
    await expect(
      officer.mutation(api.presets.propose, { councilId, client, clientId: id(4), key: "mpango:2026/27:mifugo", value: { targets: { maziwa: 100 } }, proposedAt: Date.now() }),
    ).rejects.toThrow(/si yako/);
    const ok = await officer.mutation(api.presets.propose, {
      councilId, client, clientId: id(5), key: "mpango:2026/27:kilimo", value: { crops: { mahindi: { area: 500 } } }, proposedAt: Date.now(),
    });
    expect(ok.status).toBe("pending");
  });
});

describe("council defaults and display name", () => {
  it("HQ sets a council-wide yield that officers see; officers cannot set it", async () => {
    const { t, councilId, hod, village } = await world();
    const o = await join(t, "afisa_default", councilId, "kilimo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId: o.membershipId, areaIds: [village], client: hq });
    await hod.mutation(api.presets.setCouncilDefault, { councilId, client: hq, key: "tija:mahindi", value: 2.2 });
    expect(await o.user.query(api.presets.councilDefaults, { councilId })).toMatchObject([{ key: "tija:mahindi", value: 2.2 }]);
    await expect(o.user.mutation(api.presets.setCouncilDefault, { councilId, client, key: "tija:mahindi", value: 3 })).rejects.toThrow();
    await expect(hod.mutation(api.presets.setCouncilDefault, { councilId, client: hq, key: "eneo:kilimo", value: 300 })).rejects.toThrow(/halmashauri nzima/);
    await hod.mutation(api.presets.setCouncilDefault, { councilId, client: hq, key: "tija:mahindi", value: null });
    expect(await o.user.query(api.presets.councilDefaults, { councilId })).toHaveLength(0);
  });

  it("the HoD sets a short display name; the full name stays", async () => {
    const { councilId, hod } = await world();
    await hod.mutation(api.councils.setDisplayName, { councilId, client: hq, displayName: "  Majaribio  DC " });
    const me = await hod.query(api.users.me, {});
    expect(me.memberships[0]).toMatchObject({ councilName: "Halmashauri ya Majaribio", councilDisplayName: "Majaribio DC" });
  });
});

describe("photos with sent reports", () => {
  const rid = "0192f3a0-7c1e-7d2a-9b3c-4d5e6f708500";
  const pid = "0192f3a0-7c1e-7d2a-9b3c-4d5e6f708501";

  it("HQ sees the photos of a sent report's period, never before it is sent; research data names nobody", async () => {
    const { t, councilId, hod, root, village } = await world();
    const { user, membershipId } = await join(t, "afisa_ripoti_picha", councilId, "kilimo");
    await hod.mutation(api.memberships.approve, { councilId, membershipId, areaIds: [village], client: hq });
    // A record in October (council time), with a photo.
    const occurredAt = Date.UTC(2026, 9, 14, 7);
    await user.mutation(api.sync.pushRecords, {
      councilId, client,
      records: [{
        clientId: rid, type: "photo", section: "kilimo", areaId: village, occurredAt,
        payload: { category: "wadudu", subject: "Mahindi", observation: "Viwavijeshi kwenye majani", suspected: "Viwavijeshi vamizi" },
        payloadVersion: 1, clientUpdatedAt: occurredAt, geo: { lat: -6.8234, lng: 37.6612, accuracy: 8, capturedAt: occurredAt },
      }],
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(3000)], { type: "image/jpeg" })));
    await user.mutation(api.media.attach, { councilId, client, clientId: pid, recordClientId: rid, storageId, shot: "karibu", width: 1600, height: 1200, takenAt: occurredAt });

    const { report } = await import("@afisa/shared").then((s) => ({
      report: s.buildMonthlyReport({ month: "2026-10", records: [], areaLabel: "Kijiji cha Changarawe", officerName: "Afisa" }),
    }));
    await user.mutation(api.submissions.submit, {
      councilId, client, clientId: "0192f3a0-7c1e-7d2a-9b3c-4d5e6f708502", kind: "monthly", period: "2026-10",
      areaLabel: "Kijiji cha Changarawe", payload: report as unknown as Record<string, unknown>, payloadVersion: 1, clientSubmittedAt: Date.now(),
    });
    const [sent] = await hod.query(api.submissions.forHq, { councilId, kind: "monthly", period: "2026-10" });
    const photos = await hod.query(api.submissions.photosForHq, { councilId, submissionId: sent!._id });
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ shot: "karibu", record: { type: "photo", labels: { category: "Wadudu waharibifu", subject: "Mahindi" } } });

    const data = await root.query(api.research.photoDataset, {});
    expect(data.items[0]).toMatchObject({ month: "2026-10", ward: "Mzumbe", geo: { lat: -6.8, lng: 37.7 } });
    expect(JSON.stringify(data.items[0])).not.toMatch(/Afisa|afisa_ripoti_picha/);
    await expect(hod.query(api.research.photoDataset, {})).rejects.toThrow(/ruhusa/);
  });
});
