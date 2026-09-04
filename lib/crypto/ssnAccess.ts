import { prisma } from "@/lib/db";
import { requireRole, requireClientAccess } from "@/lib/auth/rbac";
import { decryptField, encryptField, maskSsn } from "@/lib/crypto/fieldEncryption";
import { writeAuditLog } from "@/lib/audit";

/**
 * Sets a client's SSN. Always encrypted before it touches the database —
 * there is no code path in this app that writes a raw SSN to a column.
 */
export async function setClientSsn(clientId: string, rawSsn: string, actorId: string) {
  const encrypted = encryptField(rawSsn);
  await prisma.client.update({ where: { id: clientId }, data: { ssnEncrypted: encrypted } });

  // Log that an SSN was set — never log the value itself.
  await writeAuditLog({
    actorId,
    action: "CLIENT_SSN_SET",
    entityType: "Client",
    entityId: clientId,
  });
}

/**
 * The ONLY sanctioned path to read a client's real SSN. Requires
 * SUPER_ADMIN or COMPLIANCE_ADMIN — a CREDIT_SPECIALIST, even one
 * assigned to this client, cannot call this; specialists work with
 * maskSsn() output only, since the dispute workflow doesn't require
 * seeing the full number.
 *
 * Every call is audit-logged with a required `reason` string — this
 * is what makes "who looked at this client's SSN and why" answerable
 * later, per spec §24 ("Log access to sensitive client information").
 */
export async function getClientSsnForAuthorizedUse(clientId: string, reason: string) {
  const session = await requireRole(["SUPER_ADMIN", "COMPLIANCE_ADMIN"]);
  await requireClientAccess(clientId);

  if (!reason || reason.trim().length < 5) {
    throw new Error("A specific reason is required to access a client's SSN.");
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client?.ssnEncrypted) return null;

  const actorId = (session.user as any).id;
  await writeAuditLog({
    actorId,
    action: "CLIENT_SSN_ACCESSED",
    entityType: "Client",
    entityId: clientId,
    newValue: { reason },
  });

  return decryptField(client.ssnEncrypted);
}

/**
 * Safe-by-default accessor for UI display — always masked, never
 * requires elevated role, never logged (nothing sensitive is exposed).
 */
export async function getClientSsnMasked(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client?.ssnEncrypted) return null;
  const full = decryptField(client.ssnEncrypted);
  return maskSsn(full);
}
