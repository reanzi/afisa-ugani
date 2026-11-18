import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vApp,
  vAreaKind,
  vGeo,
  vMembershipStatus,
  vOfficerLevel,
  vRole,
  vSection,
} from "./lib/validators";

/**
 * Multi-council from day one: every business row carries `councilId`.
 * Identity (`users`) is global; role, sections and areas live on the
 * per-council `memberships` row.
 *
 * Additive changes only: phones run old app versions for weeks, so fields are
 * deprecated, never removed while a supported client still sends them.
 */
export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    /** Public-service check number; it is also the sign-in name (copied from it at sign-in). */
    checkNumber: v.optional(v.string()),
    /** The usage policy version this person agreed to, and when. */
    policyVersion: v.optional(v.string()),
    policyAcceptedAt: v.optional(v.number()),
    /** Global, hidden super-user. Never exposed to anyone but root. */
    isRoot: v.optional(v.boolean()),
    createdAt: v.number(),
    lastSignInAt: v.optional(v.number()),
  }),

  councils: defineTable({
    name: v.string(),
    /** Short unique code, e.g. "MVOMERO-DC". */
    code: v.string(),
    region: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled")),
    /** Open for officers to register into. */
    registrationOpen: v.boolean(),
    /** Reports that send themselves when due, switched on by the Head of Department. */
    autoSend: v.optional(v.object({ food: v.boolean(), monthly: v.boolean() })),
    /** Last NaPA address import: report date and totals. */
    addressImport: v.optional(
      v.object({
        reportDate: v.optional(v.string()),
        importedAt: v.number(),
        wards: v.number(),
        villages: v.number(),
        streets: v.number(),
        addresses: v.number(),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  areas: defineTable({
    councilId: v.id("councils"),
    kind: vAreaKind,
    name: v.string(),
    /** The ward of a village; the village of a street. */
    parentId: v.optional(v.id("areas")),
    /** Streets only (NaPA): ROAD, STREET, HAMLET…, EARTH/GRAVEL/PAVED, number of addresses. */
    streetKind: v.optional(v.string()),
    surface: v.optional(v.string()),
    addresses: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
  })
    .index("by_council_kind", ["councilId", "kind"])
    .index("by_parent", ["parentId"]),

  memberships: defineTable({
    userId: v.id("users"),
    councilId: v.id("councils"),
    role: vRole,
    status: vMembershipStatus,
    /** Chosen at registration. Leads head this section. */
    primarySection: vSection,
    /** Always contains primarySection; extra sections are granted by their leads. */
    sections: v.array(vSection),
    level: v.optional(vOfficerLevel),
    areaIds: v.array(v.id("areas")),
    /** HQ role asked for when registering with the council code; set on approval. */
    requestedRole: v.optional(vRole),
    /** Free text from registration ("Kata ya Mzumbe"), until HQ assigns areas. */
    areaHint: v.optional(v.string()),
    requestedAt: v.number(),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_council", ["userId", "councilId"])
    .index("by_council_status", ["councilId", "status"])
    .index("by_council_primary_status", ["councilId", "primarySection", "status"]),

  /** Field records (quick logs). Written only through sync.pushRecords. */
  records: defineTable({
    councilId: v.id("councils"),
    ownerId: v.id("users"),
    /** UUIDv7 made on the phone; makes pushes idempotent. */
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
    serverUpdatedAt: v.number(),
    clientVersion: v.string(),
  })
    .index("by_clientId", ["clientId"])
    .index("by_owner_council_updated", ["ownerId", "councilId", "serverUpdatedAt"])
    .index("by_owner_council_occurred", ["ownerId", "councilId", "occurredAt"])
    .index("by_council_section_occurred", ["councilId", "section", "occurredAt"]),

  /**
   * Reports an officer chose to send. This is all HQ ever sees of an
   * officer's work: field records stay private to their author.
   * One report per officer, kind and period: once sent it is sealed.
   */
  submissions: defineTable({
    councilId: v.id("councils"),
    ownerId: v.id("users"),
    /** UUIDv7 made on the phone; makes the send idempotent. */
    clientId: v.string(),
    kind: v.union(v.literal("food_prices"), v.literal("monthly")),
    /** "2026-11": the reporting period. */
    period: v.string(),
    /** 1 when first sent; +1 each time it is corrected and sent again after being reopened. */
    revision: v.number(),
    /** Present while a section lead has sent the report back for correction. */
    reopened: v.optional(v.object({ at: v.number(), byId: v.id("users"), byName: v.string(), note: v.string() })),
    /** Every reopening, kept so the corrections stay visible. */
    corrections: v.optional(
      v.array(v.object({ reopenedAt: v.number(), byName: v.string(), note: v.string(), resubmittedAt: v.optional(v.number()) })),
    ),
    /** Sent by the server on the due date (auto-send), not by the officer. */
    auto: v.optional(v.boolean()),
    /** Sent after the due date. */
    late: v.optional(v.boolean()),
    /** Snapshots at the time of sending, so the report reads the same later. */
    officerName: v.string(),
    areaLabel: v.string(),
    areaIds: v.array(v.id("areas")),
    primarySection: vSection,
    payload: v.any(),
    payloadVersion: v.number(),
    clientSubmittedAt: v.number(),
    submittedAt: v.number(),
  })
    .index("by_clientId", ["clientId"])
    .index("by_council_kind_period", ["councilId", "kind", "period"])
    .index("by_owner_kind_period", ["ownerId", "kind", "period"]),

  /**
   * Photos, each attached to one of the officer's records. Like records they
   * belong to the officer: HQ does not read them directly.
   */
  media: defineTable({
    councilId: v.id("councils"),
    ownerId: v.id("users"),
    /** UUIDv7 made on the phone; makes the upload idempotent. */
    clientId: v.string(),
    recordClientId: v.string(),
    section: vSection,
    storageId: v.id("_storage"),
    contentType: v.string(),
    width: v.number(),
    height: v.number(),
    bytes: v.number(),
    shot: v.union(v.literal("nzima"), v.literal("karibu"), v.literal("nyingine")),
    caption: v.optional(v.string()),
    takenAt: v.number(),
    createdAt: v.number(),
    /** Server time of the last change; the phone's pull cursor. */
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_clientId", ["clientId"])
    .index("by_record", ["recordClientId"])
    .index("by_owner_council_updated", ["ownerId", "councilId", "updatedAt"]),

  /** Append-only. No function patches or deletes these rows. */
  auditLog: defineTable({
    councilId: v.optional(v.id("councils")),
    actorId: v.optional(v.id("users")),
    /** Lets every audit query hide root's actions from everyone but root. */
    actorIsRoot: v.boolean(),
    actorRole: v.optional(v.string()),
    action: v.string(),
    entity: v.string(),
    entityId: v.optional(v.string()),
    /** Section the change belongs to, so leads see their section's history. */
    section: v.optional(vSection),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    app: v.optional(vApp),
    clientVersion: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    /** Device time for offline actions; equals receivedAt otherwise. */
    occurredAt: v.number(),
    receivedAt: v.number(),
  })
    .index("by_council_received", ["councilId", "receivedAt"])
    .index("by_entity", ["entity", "entityId"])
    .index("by_actor", ["actorId", "receivedAt"]),

  settings: defineTable({
    key: v.string(),
    value: v.any(),
  }).index("by_key", ["key"]),
});
