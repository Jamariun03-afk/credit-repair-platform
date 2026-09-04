import { prisma } from "@/lib/db";

interface AuditLogInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}

/**
 * Writes an immutable audit_logs row. Never awaited-and-ignored on
 * failure — if this throws, the caller should decide whether the
 * triggering action is still safe to complete (it usually is; a
 * failed audit write shouldn't silently block a legitimate action,
 * but it should be surfaced to monitoring).
 */
export async function writeAuditLog(input: AuditLogInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      previousValue: input.previousValue as any,
      newValue: input.newValue as any,
      ipAddress: input.ipAddress,
    },
  });
}

/**
 * Writes a client-facing timeline entry (activity_logs) — this is
 * what powers the "permanent chronological timeline" from the spec.
 * Distinct from AuditLog: this is human-readable and client-visible-
 * adjacent; AuditLog is the security/compliance trail.
 */
export async function logClientActivity(input: {
  clientId: string;
  actorId?: string | null;
  actorType: "user" | "automation";
  description: string;
}) {
  return prisma.activityLog.create({
    data: {
      clientId: input.clientId,
      actorId: input.actorId ?? null,
      actorType: input.actorType,
      description: input.description,
    },
  });
}
