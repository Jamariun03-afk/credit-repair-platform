import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireClientAccess, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { logClientActivity, writeAuditLog } from "@/lib/audit";

const CLIENT_STATUSES = [
  "LEAD", "ONBOARDING", "DOCUMENTS_NEEDED", "REPORTS_NEEDED", "AUDIT_PENDING",
  "STRATEGY_PENDING", "READY_FOR_ROUND_1", "ROUND_1_PENDING", "ROUND_2_PENDING",
  "ROUND_3_PENDING", "ESCALATION", "MONITORING", "COMPLETED", "PAUSED", "CANCELLED",
] as const;

const updateClientSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  assignedSpecialistId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    await requireClientAccess(params.clientId);

    const client = await prisma.client.findUnique({
      where: { id: params.clientId },
      include: {
        addresses: true,
        assignedSpecialist: { select: { firstName: true, lastName: true } },
        activityLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ client });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const session = await requireClientAccess(params.clientId);
    const role = (session.user as any).role;

    if (role === "CLIENT") {
      // Clients may only update their own contact info, never status or assignment.
      const body = await req.json();
      const parsed = z.object({ email: z.string().email().optional(), phone: z.string().optional() }).safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

      const updated = await prisma.client.update({
        where: { id: params.clientId },
        data: parsed.data,
      });
      return NextResponse.json({ client: updated });
    }

    const body = await req.json();
    const parsed = updateClientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const before = await prisma.client.findUnique({ where: { id: params.clientId } });
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.client.update({
      where: { id: params.clientId },
      data: parsed.data,
    });

    const actorId = (session.user as any).id;

    if (parsed.data.status && parsed.data.status !== before.status) {
      await logClientActivity({
        clientId: params.clientId,
        actorId,
        actorType: "user",
        description: `Status changed: ${before.status} → ${parsed.data.status}`,
      });
    }

    await writeAuditLog({
      actorId,
      action: "CLIENT_UPDATED",
      entityType: "Client",
      entityId: params.clientId,
      previousValue: before,
      newValue: parsed.data,
    });

    return NextResponse.json({ client: updated });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
