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
    /** Shorter name for screens, e.g. "Bagamoyo DC"; the full name stays on reports. */
    displayName: v.optional(v.string()),
    /** Short unique code, e.g. "MVOMERO-DC". */
    code: v.string(),
    region: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled")),
    /** Open for officers to register into. */
    registrationOpen: v.boolean(),
    /** Reports that send themselves when due, switched on by the Head of Department. */
    autoSend: v.optional(v.object({ food: v.boolean(), monthly: v.boolean() })),
    /**
     * Weekly reports, per section. `on`: officers of that section send the
     * week's report by Monday 05:00, and any not sent then sends itself
     * (`auto` always equals `on`). Off by default; officers can still build
     * weekly reports for themselves.
     */
    weekly: v.optional(
      v.object({
        mifugo: v.object({ on: v.boolean(), auto: v.boolean() }),
        kilimo: v.object({ on: v.boolean(), auto: v.boolean() }),
      }),
    ),
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

  /**
   * One sign-up code per section of a council. Typed at sign-up instead of
   * the council code, it also fixes the section. Shared by the people of
   * that section (and the Head of Department) from their side menu.
   */
  sectionCodes: defineTable({
    councilId: v.id("councils"),
    section: vSection,
    code: v.string(),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_council", ["councilId"]),

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
    /** Ward or village picked at registration; HQ starts from it when assigning areas. */
    requestedAreaId: v.optional(v.id("areas")),
    requestedAt: v.number(),
    decidedBy: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    decisionNote: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_council", ["userId", "councilId"])
    .index("by_council_status", ["councilId", "status"])
    .index("by_council_primary_status", ["councilId", "primarySection", "status"]),

  /**
   * Registered slaughterhouses of a council. Officers are offered those in
   * their areas, those that serve their areas, and those open to the whole council.
   */
  slaughterhouses: defineTable({
    councilId: v.id("councils"),
    /** Stored lowercase (storeName), shown with presentName. */
    name: v.string(),
    kind: v.union(v.literal("machinjio"), v.literal("slab"), v.literal("kuku"), v.literal("nyingine")),
    /** Ward or village where it is. */
    areaId: v.id("areas"),
    /** Other wards or villages it serves. */
    servesAreaIds: v.array(v.id("areas")),
    /** Open to officers of the whole council. */
    servesAll: v.boolean(),
    geo: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    licence: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("closed")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_council", ["councilId"]),

  /**
   * Places officers recorded slaughter at that are not registered: name,
   * village and GPS only (never the counts), for HQ to register or dismiss.
   */
  slaughterPlaces: defineTable({
    councilId: v.id("councils"),
    /** placeKey(name, areaId): the same place written in any case. */
    key: v.string(),
    name: v.string(),
    areaId: v.optional(v.id("areas")),
    geo: v.optional(v.object({ lat: v.number(), lng: v.number(), accuracy: v.number() })),
    reportedBy: v.id("users"),
    uses: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    status: v.union(v.literal("open"), v.literal("registered"), v.literal("dismissed")),
    slaughterhouseId: v.optional(v.id("slaughterhouses")),
  })
    .index("by_council_key", ["councilId", "key"])
    .index("by_council_status", ["councilId", "status"]),

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
    kind: v.union(v.literal("food_prices"), v.literal("monthly"), v.literal("weekly_mifugo"), v.literal("weekly_kilimo"), v.literal("quarterly"), v.literal("annual")),
    /** "2026-11": the reporting period; weekly reports use the week's Monday, "2026-11-16"; quarterly "2026-27-Q2"; annual "2026-27". */
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

  /**
   * An officer's presets (e.g. "tija:mahindi" = 2.5 tani/ha) and yearly plans
   * ("mpango:2026/27:kilimo"). One row per officer, council and key. A change
   * waits for approval; until then the last approved value stays in use.
   */
  presets: defineTable({
    councilId: v.id("councils"),
    ownerId: v.id("users"),
    key: v.string(),
    section: vSection,
    /** The latest proposal (number or plan). */
    value: v.any(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    /** The value in use; absent until the first approval. */
    approvedValue: v.optional(v.any()),
    approvedAt: v.optional(v.number()),
    approvedByName: v.optional(v.string()),
    /** Reason given when the latest proposal was rejected. */
    note: v.optional(v.string()),
    /** Client id of the latest proposal: repeats of it are ignored. */
    clientId: v.string(),
    proposedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_council_key", ["ownerId", "councilId", "key"])
    .index("by_council_status", ["councilId", "status"])
    .index("by_council_key", ["councilId", "key"]),

  /**
   * Council-wide defaults set in HQ (e.g. "tija:mahindi" = 2.2). An officer's
   * own approved value, when present, takes their place.
   */
  councilPresets: defineTable({
    councilId: v.id("councils"),
    key: v.string(),
    value: v.number(),
    setById: v.id("users"),
    setByName: v.string(),
    updatedAt: v.number(),
  }).index("by_council_key", ["councilId", "key"]),

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
