import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

export type Role = "SUPER_ADMIN" | "CREDIT_SPECIALIST" | "COMPLIANCE_ADMIN" | "CLIENT";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * Returns the current session or throws. Call this first in every
 * API route / server action before touching the database.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthenticatedError();
  if ((session.user as any).mfaPending) {
    throw new ForbiddenError("MFA setup required before accessing this resource");
  }
  return session;
}

/**
 * Requires the session user to hold one of the given roles.
 * Every denial is written to audit_logs — silent 403s are not allowed here.
 */
export async function requireRole(allowed: Role[]) {
  const session = await requireSession();
  const role = (session.user as any).role as Role;

  if (!allowed.includes(role)) {
    await writeAuditLog({
      actorId: (session.user as any).id,
      action: "ACCESS_DENIED",
      entityType: "Route",
      newValue: { requiredRoles: allowed, actualRole: role },
    });
    throw new ForbiddenError(`Requires one of: ${allowed.join(", ")}`);
  }

  return session;
}

/**
 * A CREDIT_SPECIALIST may only act on clients assigned to them, unless
 * they're SUPER_ADMIN or COMPLIANCE_ADMIN. Call this on every
 * client-scoped route — never trust a clientId path param alone.
 */
export async function requireClientAccess(clientId: string) {
  const session = await requireSession();
  const role = (session.user as any).role as Role;
  const userId = (session.user as any).id as string;

  if (role === "SUPER_ADMIN" || role === "COMPLIANCE_ADMIN") {
    return session;
  }

  if (role === "CLIENT") {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (client?.userId !== userId) {
      await logDenied(userId, clientId);
      throw new ForbiddenError("Not your record");
    }
    return session;
  }

  if (role === "CREDIT_SPECIALIST") {
    const employee = await prisma.employee.findUnique({ where: { userId } });
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!employee || client?.assignedSpecialistId !== employee.id) {
      await logDenied(userId, clientId);
      throw new ForbiddenError("Client not assigned to you");
    }
    return session;
  }

  throw new ForbiddenError("Unknown role");
}

async function logDenied(actorId: string, clientId: string) {
  await writeAuditLog({
    actorId,
    action: "ACCESS_DENIED",
    entityType: "Client",
    entityId: clientId,
  });
}
