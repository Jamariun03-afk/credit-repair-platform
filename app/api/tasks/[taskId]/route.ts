import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"]).optional(),
  assignedToId: z.string().uuid().optional(),
  notes: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST", "COMPLIANCE_ADMIN"]);
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const before = await prisma.task.findUnique({ where: { id: params.taskId } });
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.task.update({
      where: { id: params.taskId },
      data: {
        ...parsed.data,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      },
    });

    await writeAuditLog({
      actorId: (session.user as any).id,
      action: "TASK_UPDATED",
      entityType: "Task",
      entityId: params.taskId,
      previousValue: { status: before.status },
      newValue: parsed.data,
    });

    return NextResponse.json({ task: updated });
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
