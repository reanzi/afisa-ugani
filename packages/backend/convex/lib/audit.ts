/**
 * The audit trail. Write it in the same mutation as the change it describes:
 * Convex mutations are transactions, so the change and its audit row commit
 * together or not at all. Nothing in the codebase patches or deletes auditLog.
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { Section } from "@afisa/shared";
import type { AuthedViewer, ClientMeta, MemberViewer } from "./guards";

type AuditInput = {
  action: string;
  entity: string;
  entityId?: string;
  section?: Section;
  before?: unknown;
  after?: unknown;
  client?: ClientMeta;
  /** Device time of an offline action. */
  occurredAt?: number;
  councilId?: Id<"councils">;
  /** For auth callbacks that run before a viewer exists. */
  actorIdOverride?: Id<"users">;
  actorIsRootOverride?: boolean;
};

export async function writeAudit(
  ctx: MutationCtx,
  viewer: AuthedViewer | MemberViewer | null,
  input: AuditInput,
): Promise<void> {
  const now = Date.now();
  const member = viewer && "councilId" in viewer ? viewer : null;
  const client = input.client ?? viewer?.client;
  await ctx.db.insert("auditLog", {
    councilId: input.councilId ?? member?.councilId,
    actorId: viewer?.userId ?? input.actorIdOverride,
    actorIsRoot: viewer?.isRoot ?? input.actorIsRootOverride ?? false,
    actorRole: viewer?.isRoot ? "root" : (member?.membership?.role ?? undefined),
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    section: input.section,
    before: input.before,
    after: input.after,
    app: client?.app,
    clientVersion: client?.version,
    deviceId: client?.deviceId,
    occurredAt: input.occurredAt ?? now,
    receivedAt: now,
  });
}
