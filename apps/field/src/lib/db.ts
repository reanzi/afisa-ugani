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

/** A report the officer chose to send. Queued here until it reaches the server. */
export type LocalSubmission = {
  clientId: string;
  councilId: string;
  kind: "food_prices" | "monthly";
  period: string;
  areaLabel: string;
  payload: Record<string, unknown>;
  payloadVersion: number;
  clientSubmittedAt: number;
  syncState: SyncState;
  revision?: number;
  submittedAt?: number;
  error?: string;
  /** Sent by the server on the due date. */
  auto?: boolean;
  late?: boolean;
  /** Sent back by a section lead for correction: the officer corrects it and sends it again. */
  reopened?: { at: number; byName: string; note: string } | null;
};

class AfisaDB extends Dexie {
  records!: EntityTable<LocalRecord, "clientId">;
  meta!: EntityTable<Meta, "key">;
  submissions!: EntityTable<LocalSubmission, "clientId">;

  constructor() {
    super("afisa-ugani");
    // Additive migrations only: add a new version() block, never edit an old one.
    this.version(1).stores({
      records: "&clientId, [councilId+occurredAt], syncState, [councilId+syncState]",
      meta: "&key",
    });
    this.version(2).stores({
      submissions: "&clientId, [councilId+kind+period], [councilId+syncState]",
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
