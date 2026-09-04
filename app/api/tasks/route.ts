import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/audit";

const createTaskSchema = z.object({
  clientId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  title: z.string().min(1),
  notes: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  dueDate: z.string().datetime().optional(),
});

// GET /api/tasks?mine=true — specialists see their queue by default;
// SUPER_ADMIN/COMPLIANCE_ADMIN can see everything with ?all=true.
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST", "COMPLIANCE_ADMIN"]);
    const role = (session.user as any).role;
    const userId = (session.user as any).id;
    const showAll = req.nextUrl.searchParams.get("all") === "true";

    const where: any = {};
    if (!showAll || role === "CREDIT_SPECIALIST") {
      where.assignedToId = userId;
    }
    const status = req.nextUrl.searchParams.get("status");
    if (status) where.status = status;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      include: { client: { select: { firstName: true, lastName: true } } },
    });

    return NextResponse.json({ tasks });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST", "COMPLIANCE_ADMIN"]);
    const body = await req.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        clientId: parsed.data.clientId,
        assignedToId: parsed.data.assignedToId,
        title: parsed.data.title,
        notes: parsed.data.notes,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
        status: "OPEN",
      },
    });

    await writeAuditLog({
      actorId: (session.user as any).id,
      action: "TASK_CREATED",
      entityType: "Task",
      entityId: task.id,
      newValue: { title: task.title, priority: task.priority },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthenticatedError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
