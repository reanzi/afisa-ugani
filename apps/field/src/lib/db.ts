/**
 * The phone's own database. It is the source of truth for the Field app:
 * every screen reads from here (useLiveQuery), so nothing depends on signal.
 * Records waiting to go up have syncState "pending" — that index is the outbox.
 */
import Dexie, { type EntityTable } from "dexie";
import type { Section } from "@afisa/shared";

export type Geo = {
  lat: number;
  lng: number;
  accuracy: number;
  altitude?: number;
  capturedAt: number;
};

export type SyncState = "pending" | "synced" | "rejected";

export type LocalRecord = {
  clientId: string;
  councilId: string;
  type: string;
  section: Section;
  areaId?: string;
  occurredAt: number;
  payload: Record<string, unknown>;
  payloadVersion: number;
  geo?: Geo;
  deletedAt?: number;
  clientUpdatedAt: number;
  syncState: SyncState;
  rejectReason?: string;
  serverUpdatedAt?: number;
};

export type Meta = { key: string; value: unknown };

class AfisaDB extends Dexie {
  records!: EntityTable<LocalRecord, "clientId">;
  meta!: EntityTable<Meta, "key">;

  constructor() {
    super("afisa-ugani");
    // Additive migrations only: add a new version() block, never edit an old one.
    this.version(1).stores({
      records: "&clientId, [councilId+occurredAt], syncState, [councilId+syncState]",
      meta: "&key",
    });
  }
}

export const db = new AfisaDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Ask the browser not to evict our data when storage runs low. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
