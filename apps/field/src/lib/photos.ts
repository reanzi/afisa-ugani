/**
 * Photos on the phone: shrink, store, show, and the upload queue.
 *
 * A photo is shrunk to at most 1600 px and saved as JPEG before it is stored.
 * Drawing it onto a canvas also drops the camera's hidden data (EXIF: GPS,
 * phone model). The record keeps its own location.
 */
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useConvexAuth } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { fitWithin, MEDIA_KEEP_ON_PHONE_DAYS, MEDIA_MAX_EDGE, MEDIA_THUMB_EDGE, type PhotoShot } from "@afisa/shared";
import { clientMeta, convex } from "./client";
import { db, getMeta, setMeta, type LocalMedia } from "./db";

/** Aim for about 300 KB; step the quality down for very detailed scenes. */
const TARGET_BYTES = 450_000;
const QUALITIES = [0.82, 0.72, 0.62];

export type ShrunkPhoto = { blob: Blob; thumb: Blob; width: number; height: number };

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    // Respect the camera's rotation so portrait photos stay upright.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Picha haikuweza kuhifadhiwa."))), "image/jpeg", quality),
  );
}

function draw(img: ImageBitmap, max: number): HTMLCanvasElement {
  const size = fitWithin(img.width, img.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Simu hii haiwezi kuchakata picha.");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, size.width, size.height);
  return canvas;
}

export async function shrinkPhoto(file: Blob): Promise<ShrunkPhoto> {
  const img = await decode(file);
  try {
    const big = draw(img, MEDIA_MAX_EDGE);
    let blob = await toJpeg(big, QUALITIES[0]!);
    for (const q of QUALITIES.slice(1)) {
      if (blob.size <= TARGET_BYTES) break;
      blob = await toJpeg(big, q);
    }
    const thumb = await toJpeg(draw(img, MEDIA_THUMB_EDGE), 0.7);
    return { blob, thumb, width: big.width, height: big.height };
  } finally {
    img.close();
  }
}

/** Photos of one record, oldest first, without deleted ones. */
export function useRecordPhotos(recordClientId: string | undefined): LocalMedia[] | undefined {
  return useLiveQuery(
    async () =>
      recordClientId
        ? (await db.media.where("recordClientId").equals(recordClientId).toArray())
            .filter((m) => !m.deletedAt)
            .sort((a, b) => a.takenAt - b.takenAt)
        : [],
    [recordClientId],
  );
}

/** Number of photos per record, for lists. */
export function usePhotoCounts(): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const map = new Map<string, number>();
    await db.media.each((m) => {
      if (!m.deletedAt) map.set(m.recordClientId, (map.get(m.recordClientId) ?? 0) + 1);
    });
    return map;
  });
}

/**
 * An address for showing a photo: the phone's own copy when it has one,
 * otherwise a link from the server (only with signal, only for the owner).
 */
export function usePhotoSrc(m: LocalMedia | undefined, size: "thumb" | "full"): string | null {
  const local = m ? (size === "thumb" ? (m.thumb ?? m.blob) : (m.blob ?? m.thumb)) : undefined;
  const wantServer = Boolean(m && (size === "full" ? !m.blob : !local) && m.syncState === "synced");
  const { isAuthenticated } = useConvexAuth();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!local) return;
    const url = URL.createObjectURL(local);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [local]);

  useEffect(() => {
    if (local && !wantServer) return;
    if (!m || !wantServer || !isAuthenticated || !navigator.onLine) return;
    let alive = true;
    void convex
      .query(api.media.url, { councilId: m.councilId as Id<"councils">, clientId: m.clientId })
      .then((u) => alive && u && setSrc(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [m, local, wantServer, isAuthenticated]);

  return src;
}

/** Wi-Fi only: the officer can keep photos off mobile data. */
export const WIFI_ONLY_KEY = "photos:wifiOnly";

function onMobileData(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  return c?.type === "cellular" || c?.saveData === true;
}

/**
 * Upload queued photos, one at a time, after their records have reached the
 * server. A photo is uploaded once: the storage id is saved before attaching,
 * so a retry after a dropped connection only repeats the attach.
 */
export async function pushMedia(councilId: string): Promise<void> {
  const queued = await db.media.where("[councilId+syncState]").equals([councilId, "pending"]).toArray();
  const wifiOnly = (await getMeta<boolean>(WIFI_ONLY_KEY)) ?? false;
  const cid = councilId as Id<"councils">;

  for (const m of queued.sort((a, b) => a.takenAt - b.takenAt)) {
    if (m.deletedAt) {
      // Deleted on the phone: ask the server to delete it too (if it ever got there).
      if (m.uploadedAt || m.storageId) await convex.mutation(api.media.remove, { councilId: cid, client: await clientMeta(), clientId: m.clientId });
      await db.media.delete(m.clientId);
      continue;
    }
    const record = await db.records.get(m.recordClientId);
    if (!record || record.deletedAt) {
      await db.media.delete(m.clientId);
      continue;
    }
    if (record.syncState === "rejected") {
      await db.media.update(m.clientId, { syncState: "rejected", rejectReason: "Kumbukumbu yake ilikataliwa." });
      continue;
    }
    if (record.syncState !== "synced") continue; // the record goes first
    if (!m.blob) {
      await db.media.update(m.clientId, { syncState: "rejected", rejectReason: "Picha haipo tena kwenye simu." });
      continue;
    }
    if (wifiOnly && onMobileData()) return;

    let storageId = m.storageId;
    if (!storageId) {
      const uploadUrl = await convex.mutation(api.media.generateUploadUrl, { councilId: cid, client: await clientMeta() });
      const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: m.blob });
      if (!res.ok) throw new Error(`Upakiaji wa picha umeshindwa (${res.status}).`);
      storageId = ((await res.json()) as { storageId: string }).storageId;
      await db.media.update(m.clientId, { storageId });
    }
    try {
      const out = await convex.mutation(api.media.attach, {
        councilId: cid,
        client: await clientMeta(),
        clientId: m.clientId,
        recordClientId: m.recordClientId,
        storageId: storageId as Id<"_storage">,
        shot: m.shot,
        caption: m.caption,
        width: m.width,
        height: m.height,
        takenAt: m.takenAt,
      });
      if (out.status === "rejected") {
        await db.media.update(m.clientId, { syncState: "rejected", rejectReason: out.reason ?? "Imekataliwa", storageId: undefined });
      } else {
        await db.media.update(m.clientId, { syncState: "synced", uploadedAt: Date.now(), rejectReason: undefined });
      }
    } catch (e) {
      if (e instanceof ConvexError) {
        // The file never arrived (or was cleaned up): upload it again next time.
        await db.media.update(m.clientId, { storageId: undefined });
      }
      throw e;
    }
  }
}

/** Full photos uploaded long ago leave the phone; their thumbnails stay. */
export async function pruneOldPhotos(now = Date.now()): Promise<number> {
  const cutoff = now - MEDIA_KEEP_ON_PHONE_DAYS * 86_400_000;
  const old = await db.media.filter((m) => m.syncState === "synced" && Boolean(m.blob) && (m.uploadedAt ?? now) < cutoff).toArray();
  for (const m of old) await db.media.update(m.clientId, { blob: undefined });
  return old.length;
}

/** Photos taken on another phone (or before a reinstall): their details, not the files. */
export async function pullMedia(councilId: string): Promise<void> {
  const key = `mediaCursor:${councilId}`;
  let since = (await getMeta<number>(key)) ?? 0;
  for (let i = 0; i < 50; i++) {
    const page = await convex.query(api.media.changesSince, { councilId: councilId as Id<"councils">, since });
    await db.transaction("rw", db.media, async () => {
      for (const r of page.media) {
        const local = await db.media.get(r.clientId);
        if (r.deletedAt) {
          if (local && local.syncState !== "pending") await db.media.delete(r.clientId);
          continue;
        }
        if (local) continue; // ours already, with its files
        await db.media.put({
          clientId: r.clientId,
          councilId,
          recordClientId: r.recordClientId,
          section: r.section,
          shot: r.shot,
          caption: r.caption ?? undefined,
          width: r.width,
          height: r.height,
          bytes: r.bytes,
          takenAt: r.takenAt,
          syncState: "synced",
          uploadedAt: r.takenAt,
        });
      }
    });
    since = page.cursor;
    await setMeta(key, since);
    if (!page.hasMore) break;
  }
}

/** A photo chosen in the form, before the record is saved. */
export type PhotoDraft = ShrunkPhoto & { clientId: string; shot: PhotoShot; takenAt: number; caption?: string };

/** The usual pair: the whole plant or animal first, then a close-up. */
export function nextShot(existing: number): PhotoShot {
  return existing === 0 ? "nzima" : existing === 1 ? "karibu" : "nyingine";
}
