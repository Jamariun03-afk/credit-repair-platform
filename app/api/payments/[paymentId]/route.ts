import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, requireClientAccess, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { logClientActivity, writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  status: z.enum(["UNPAID", "PAID", "PARTIAL", "OVERDUE", "REFUNDED", "WAIVED"]).optional(),
  paidDate: z.string().datetime().optional(),
  method: z.string().optional(),
  notes: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { paymentId: string } }) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST", "COMPLIANCE_ADMIN"]);

    const payment = await prisma.payment.findUnique({ where: { id: params.paymentId } });
    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await requireClientAccess(payment.clientId);

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const data: any = { ...parsed.data };
    if (parsed.data.paidDate) data.paidDate = new Date(parsed.data.paidDate);
    if (parsed.data.status === "PAID" && !parsed.data.paidDate && !payment.paidDate) {
      data.paidDate = new Date();
    }

    const updated = await prisma.payment.update({ where: { id: params.paymentId }, data });

    const actorId = (session.user as any).id;

    if (parsed.data.status && parsed.data.status !== payment.status) {
      await logClientActivity({
        clientId: payment.clientId,
        actorId,
        actorType: "user",
        description: `Payment ${payment.invoiceLabel ?? "charge"} ($${payment.amount}): ${payment.status} → ${parsed.data.status}`,
      });
    }

    await writeAuditLog({
      actorId,
      action: "PAYMENT_UPDATED",
      entityType: "Payment",
      entityId: payment.id,
      previousValue: { status: payment.status },
      newValue: parsed.data,
    });

    return NextResponse.json({ payment: updated });
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
