/**
 * Offline sync for the Field app.
 *
 * Push: the phone's outbox sends records keyed by a client UUIDv7, so a retry
 * after a dropped connection never duplicates anything. Each record is
 * accepted or rejected on its own; one bad record never blocks the rest.
 *
 * Pull: the phone asks for its own records changed on the server since a
 * cursor (serverUpdatedAt), e.g. after a reinstall or a correction from HQ.
 */
import { v } from "convex/values";
import {
  canWriteSection,
  compareVersions,
  SUPPORTED_PAYLOAD_VERSIONS,
  SYNC_PULL_PAGE,
  SYNC_PUSH_BATCH,
  validatePayload,
} from "@afisa/shared";
import { fail, memberMutation, memberQuery } from "./lib/guards";
import { writeAudit } from "./lib/audit";
import { deleteMediaOfRecord } from "./media";
import { vGeo, vSection } from "./lib/validators";

const vIncomingRecord = v.object({
  clientId: v.string(),
  type: v.string(),
  section: vSection,
  areaId: v.optional(v.id("areas")),
  occurredAt: v.number(),
  payload: v.any(),
  payloadVersion: v.number(),
  geo: v.optional(vGeo),
  deletedAt: v.optional(v.number()),
  clientUpdatedAt: v.number(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FUTURE_MS = 10 * 60 * 1000;

type PushResult =
  | { clientId: string; status: "accepted"; serverUpdatedAt: number }
  | { clientId: string; status: "stale" }
  | { clientId: string; status: "rejected"; reason: string };

export const pushRecords = memberMutation({
  args: { records: v.array(vIncomingRecord) },
  handler: async (ctx, { records }) => {
    const { viewer } = ctx;
    if (!viewer.client) fail("INVALID", "Taarifa za programu zinakosekana.");
    if (records.length > SYNC_PUSH_BATCH) fail("INVALID", `Tuma rekodi zisizozidi ${SYNC_PUSH_BATCH} kwa mara moja.`);

    const minSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "minClientVersion"))
      .unique();
    const minClientVersion = typeof minSetting?.value === "string" ? minSetting.value : "0.0.0";
    const updateRequired = compareVersions(viewer.client.version, minClientVersion) < 0;

    const allowedAreas = new Set<string>(viewer.membership?.areaIds ?? []);
    const restrictAreas = viewer.membership?.role === "officer";
    const now = Date.now();
    const results: PushResult[] = [];

    for (const r of records) {
      const reject = (reason: string) => results.push({ clientId: r.clientId, status: "rejected", reason });
      if (!UUID_RE.test(r.clientId)) { reject("INVALID_ID"); continue; }
      if (!SUPPORTED_PAYLOAD_VERSIONS.includes(r.payloadVersion)) { reject("PAYLOAD_VERSION"); continue; }
      if (!canWriteSection(viewer.actor, r.section)) { reject("SECTION_NOT_ALLOWED"); continue; }
      if (r.occurredAt > now + MAX_FUTURE_MS) { reject("FUTURE_DATE"); continue; }
      // A deletion only needs to identify the record; anything else must match its form.
      if (!r.deletedAt) {
        const problem = validatePayload(r.type, r.payload);
        if (problem) { reject(`INVALID_PAYLOAD:${problem}`); continue; }
      }
      if (r.areaId) {
        const area = await ctx.db.get(r.areaId);
        if (!area || area.councilId !== viewer.councilId) { reject("AREA_UNKNOWN"); continue; }
        if (restrictAreas && !allowedAreas.has(r.areaId) && !(area.parentId && allowedAreas.has(area.parentId))) {
          reject("AREA_NOT_ASSIGNED");
          continue;
        }
      }

      const existing = await ctx.db
        .query("records")
        .withIndex("by_clientId", (q) => q.eq("clientId", r.clientId))
        .unique();

      if (existing) {
        if (existing.ownerId !== viewer.userId || existing.councilId !== viewer.councilId) {
          reject("NOT_OWNER");
          continue;
        }
        // Last write wins on the device's edit time. An older edit arriving
        // late (e.g. from a second phone) is acknowledged but not applied.
        if (r.clientUpdatedAt <= existing.clientUpdatedAt) {
          results.push({ clientId: r.clientId, status: "stale" });
          continue;
        }
        const patch = {
          type: r.type,
          section: r.section,
          areaId: r.areaId,
          occurredAt: r.occurredAt,
          payload: r.payload,
          payloadVersion: r.payloadVersion,
          geo: r.geo,
          deletedAt: r.deletedAt,
          clientUpdatedAt: r.clientUpdatedAt,
          serverUpdatedAt: now,
          clientVersion: viewer.client.version,
        };
        await ctx.db.patch(existing._id, patch);
        // Deleting a record deletes its photos and their files.
        const photosDeleted = r.deletedAt && !existing.deletedAt ? await deleteMediaOfRecord(ctx, r.clientId) : 0;
        await writeAudit(ctx, viewer, {
          action: r.deletedAt && !existing.deletedAt ? "record.delete" : "record.update",
          entity: "records",
          entityId: existing._id,
          section: r.section,
          before: { payload: existing.payload, occurredAt: existing.occurredAt, areaId: existing.areaId, deletedAt: existing.deletedAt },
          after: { payload: r.payload, occurredAt: r.occurredAt, areaId: r.areaId, deletedAt: r.deletedAt, ...(photosDeleted ? { photosDeleted } : {}) },
          occurredAt: r.clientUpdatedAt,
        });
      } else {
        const id = await ctx.db.insert("records", {
          councilId: viewer.councilId,
          ownerId: viewer.userId,
          clientId: r.clientId,
          type: r.type,
          section: r.section,
          areaId: r.areaId,
          occurredAt: r.occurredAt,
          payload: r.payload,
          payloadVersion: r.payloadVersion,
          geo: r.geo,
          deletedAt: r.deletedAt,
          clientUpdatedAt: r.clientUpdatedAt,
          serverUpdatedAt: now,
          clientVersion: viewer.client.version,
        });
        await writeAudit(ctx, viewer, {
          action: "record.create",
          entity: "records",
          entityId: id,
          section: r.section,
          after: { type: r.type, occurredAt: r.occurredAt, areaId: r.areaId },
          occurredAt: r.clientUpdatedAt,
        });
      }
      results.push({ clientId: r.clientId, status: "accepted", serverUpdatedAt: now });
    }

    return { results, minClientVersion, updateRequired };
  },
});

/** The viewer's own records changed after `since`, oldest first. */
export const pullChanges = memberQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const { viewer } = ctx;
    const page = await ctx.db
      .query("records")
      .withIndex("by_owner_council_updated", (q) =>
        q.eq("ownerId", viewer.userId).eq("councilId", viewer.councilId).gt("serverUpdatedAt", since),
      )
      .order("asc")
      .take(SYNC_PULL_PAGE + 1);
    const hasMore = page.length > SYNC_PULL_PAGE;
    let rows = page.slice(0, SYNC_PULL_PAGE);
    if (hasMore) {
      // Records written by one push share a timestamp. Never split such a
      // group across pages, or the `gt` cursor would skip its tail.
      const boundary = page[SYNC_PULL_PAGE]!.serverUpdatedAt;
      const trimmed = rows.filter((r) => r.serverUpdatedAt !== boundary);
      if (trimmed.length > 0) rows = trimmed;
    }
    return {
      records: rows.map((r) => ({
        clientId: r.clientId,
        type: r.type,
        section: r.section,
        areaId: r.areaId ?? null,
        occurredAt: r.occurredAt,
        payload: r.payload,
        payloadVersion: r.payloadVersion,
        geo: r.geo ?? null,
        deletedAt: r.deletedAt ?? null,
        clientUpdatedAt: r.clientUpdatedAt,
        serverUpdatedAt: r.serverUpdatedAt,
      })),
      cursor: rows.length ? rows[rows.length - 1]!.serverUpdatedAt : since,
      hasMore,
    };
  },
});
