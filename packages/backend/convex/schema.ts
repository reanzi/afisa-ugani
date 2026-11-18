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
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  areas: defineTable({
    councilId: v.id("councils"),
    kind: vAreaKind,
    name: v.string(),
    /** The ward of a village. */
    parentId: v.optional(v.id("areas")),
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
    .index("by_council_section_occurred", ["councilId", "section", "occurredAt"]),

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
