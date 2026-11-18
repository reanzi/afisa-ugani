/**
 * Photos attached to an officer's records.
 *
 * Upload in two steps so a dropped connection never leaves a half-made row:
 * the phone asks for an upload URL, posts the JPEG to Convex storage, then
 * calls `attach` with the storage id. `attach` is idempotent on the photo's
 * client id, so the phone can repeat it until it hears back.
 *
 * Photos belong to the officer, like records: only the owner (and root) can
 * list them or get their URLs. Deleting a photo deletes the file.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { MEDIA_MAX_BYTES, MEDIA_PER_RECORD, SYNC_PULL_PAGE, validateMediaMeta } from "@afisa/shared";
import { fail, memberMutation, memberQuery } from "./lib/guards";
import { writeAudit } from "./lib/audit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(["image/jpeg", "image/webp"]);
const vShot = v.union(v.literal("nzima"), v.literal("karibu"), v.literal("nyingine"));

export const generateUploadUrl = memberMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Throw away an uploaded file that will not be attached, and say why. This
 * returns rather than throws: a thrown error would roll back the delete too.
 */
async function refuse(ctx: MutationCtx, storageId: Id<"_storage">, reason: string) {
  await ctx.storage.delete(storageId);
  return { status: "rejected" as const, reason };
}

export const attach = memberMutation({
  args: {
    clientId: v.string(),
    recordClientId: v.string(),
    storageId: v.id("_storage"),
    shot: vShot,
    caption: v.optional(v.string()),
    width: v.number(),
    height: v.number(),
    takenAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    if (!UUID_RE.test(args.clientId)) return refuse(ctx, args.storageId, "Kitambulisho cha picha si sahihi.");

    const existing = await ctx.db
      .query("media")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (existing) {
      if (existing.ownerId !== viewer.userId) return refuse(ctx, args.storageId, "Picha hii si yako.");
      // A repeat after a lost reply: keep the first file, drop the duplicate upload.
      if (existing.storageId !== args.storageId) await ctx.storage.delete(args.storageId);
      return { status: "exists" as const, reason: null };
    }

    const record = await ctx.db
      .query("records")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.recordClientId))
      .unique();
    if (!record || record.ownerId !== viewer.userId || record.councilId !== viewer.councilId) {
      return refuse(ctx, args.storageId, "Kumbukumbu ya picha hii haipo.");
    }
    if (record.deletedAt) return refuse(ctx, args.storageId, "Kumbukumbu ya picha hii imefutwa.");

    const file = await ctx.db.system.get(args.storageId);
    if (!file) fail("INVALID", "Faili la picha halikufika. Jaribu tena."); // nothing stored, nothing to clean up
    if (!file.contentType || !TYPES.has(file.contentType)) return refuse(ctx, args.storageId, "Picha lazima iwe JPEG.");
    if (file.size > MEDIA_MAX_BYTES) return refuse(ctx, args.storageId, "Picha ni kubwa mno.");

    const caption = args.caption?.trim() || undefined;
    const problem = validateMediaMeta({
      clientId: args.clientId,
      recordClientId: args.recordClientId,
      width: args.width,
      height: args.height,
      bytes: file.size,
      shot: args.shot,
      caption,
      takenAt: args.takenAt,
    });
    if (problem) return refuse(ctx, args.storageId, `Taarifa za picha si sahihi (${problem}).`);

    const siblings = await ctx.db
      .query("media")
      .withIndex("by_record", (q) => q.eq("recordClientId", args.recordClientId))
      .collect();
    if (siblings.filter((m) => !m.deletedAt).length >= MEDIA_PER_RECORD) {
      return refuse(ctx, args.storageId, `Kumbukumbu moja inaweza kuwa na picha ${MEDIA_PER_RECORD} tu.`);
    }

    const now = Date.now();
    const id = await ctx.db.insert("media", {
      councilId: viewer.councilId,
      ownerId: viewer.userId,
      clientId: args.clientId,
      recordClientId: args.recordClientId,
      section: record.section,
      storageId: args.storageId,
      contentType: file.contentType,
      width: args.width,
      height: args.height,
      bytes: file.size,
      shot: args.shot,
      caption,
      takenAt: args.takenAt,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, viewer, {
      action: "media.attach",
      entity: "media",
      entityId: id,
      section: record.section,
      after: { recordClientId: args.recordClientId, shot: args.shot, bytes: file.size },
      occurredAt: args.takenAt,
    });
    return { status: "attached" as const, reason: null };
  },
});

/** Delete a photo and its file. Repeating it is harmless. */
export const remove = memberMutation({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const { viewer } = ctx;
    const m = await ctx.db
      .query("media")
      .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
      .unique();
    if (!m) return { status: "missing" as const };
    if (m.ownerId !== viewer.userId) fail("FORBIDDEN", "Picha hii si yako.");
    if (m.deletedAt) return { status: "deleted" as const };
    await deleteMedia(ctx, m._id, m.storageId);
    await writeAudit(ctx, viewer, { action: "media.delete", entity: "media", entityId: m._id, section: m.section });
    return { status: "deleted" as const };
  },
});

/** Mark deleted and remove the file. Used when a photo or its record is deleted. */
export async function deleteMedia(ctx: MutationCtx, id: Id<"media">, storageId: Id<"_storage">): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(id, { deletedAt: now, updatedAt: now });
  try {
    await ctx.storage.delete(storageId);
  } catch {
    /* already gone */
  }
}

/** When a record is deleted its photos go with it. */
export async function deleteMediaOfRecord(ctx: MutationCtx, recordClientId: string): Promise<number> {
  const rows = await ctx.db
    .query("media")
    .withIndex("by_record", (q) => q.eq("recordClientId", recordClientId))
    .collect();
  let n = 0;
  for (const m of rows) {
    if (m.deletedAt) continue;
    await deleteMedia(ctx, m._id, m.storageId);
    n++;
  }
  return n;
}

/**
 * The viewer's own photos changed after `since` (for a second phone or a
 * reinstall). Files are fetched separately, only when shown.
 */
export const changesSince = memberQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const { viewer } = ctx;
    const page = await ctx.db
      .query("media")
      .withIndex("by_owner_council_updated", (q) => q.eq("ownerId", viewer.userId).eq("councilId", viewer.councilId).gt("updatedAt", since))
      .order("asc")
      .take(SYNC_PULL_PAGE + 1);
    const hasMore = page.length > SYNC_PULL_PAGE;
    let rows = page.slice(0, SYNC_PULL_PAGE);
    if (hasMore) {
      const boundary = page[SYNC_PULL_PAGE]!.updatedAt;
      const trimmed = rows.filter((r) => r.updatedAt !== boundary);
      if (trimmed.length > 0) rows = trimmed;
    }
    return {
      media: rows.map((m) => ({
        clientId: m.clientId,
        recordClientId: m.recordClientId,
        section: m.section,
        shot: m.shot,
        caption: m.caption ?? null,
        width: m.width,
        height: m.height,
        bytes: m.bytes,
        takenAt: m.takenAt,
        deletedAt: m.deletedAt ?? null,
      })),
      cursor: rows.length ? rows[rows.length - 1]!.updatedAt : since,
      hasMore,
    };
  },
});

/** A short-lived link to one of the viewer's own photos. */
export const url = memberQuery({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const m = await ctx.db
      .query("media")
      .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
      .unique();
    if (!m || m.deletedAt) return null;
    if (m.ownerId !== ctx.viewer.userId && !ctx.viewer.isRoot) return null;
    return await ctx.storage.getUrl(m.storageId);
  },
});
