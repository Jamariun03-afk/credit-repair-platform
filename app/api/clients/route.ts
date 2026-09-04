import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { logClientActivity, writeAuditLog } from "@/lib/audit";

const createClientSchema = z.object({
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  assignedSpecialistId: z.string().uuid().optional(),
});

// GET /api/clients — list, staff only. Specialists see only their
// assigned clients unless they're SUPER_ADMIN / COMPLIANCE_ADMIN.
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST", "COMPLIANCE_ADMIN"]);
    const role = (session.user as any).role;
    const userId = (session.user as any).id;

    const status = req.nextUrl.searchParams.get("status") ?? undefined;

    let where: any = status ? { status } : {};

    if (role === "CREDIT_SPECIALIST") {
      const employee = await prisma.employee.findUnique({ where: { userId } });
      where.assignedSpecialistId = employee?.id ?? "__none__";
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        enrollmentDate: true,
        assignedSpecialistId: true,
      },
    });

    return NextResponse.json({ clients });
  } catch (err) {
    return handleError(err);
  }
}

// POST /api/clients — create, staff only (not COMPLIANCE_ADMIN — review role, not data-entry role).
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST"]);
    const body = await req.json();
    const parsed = createClientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const client = await prisma.client.create({
      data: {
        firstName: parsed.data.firstName,
        middleName: parsed.data.middleName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        dateOfBirth: parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : undefined,
        assignedSpecialistId: parsed.data.assignedSpecialistId,
        status: "LEAD",
      },
    });

    const actorId = (session.user as any).id;

    await logClientActivity({
      clientId: client.id,
      actorId,
      actorType: "user",
      description: `Client enrolled: ${client.firstName} ${client.lastName}`,
    });

    await writeAuditLog({
      actorId,
      action: "CLIENT_CREATED",
      entityType: "Client",
      entityId: client.id,
      newValue: { firstName: client.firstName, lastName: client.lastName, status: client.status },
    });

    // NOTE: this is the natural hook point for the CLIENT_ENROLLED
    // automation trigger (§15 of the spec) — wire it in lib/automation
    // once the automation engine lands (Phase 4). Left as a comment
    // rather than a stub call so it's not silently a no-op in prod.

    return NextResponse.json({ client }, { status: 201 });
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
