import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireClientAccess, requireRole, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { logClientActivity, writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  amount: z.number().positive(),
  status: z.enum(["UNPAID", "PAID", "PARTIAL", "OVERDUE", "REFUNDED", "WAIVED"]).default("UNPAID"),
  dueDate: z.string().datetime().optional(),
  paidDate: z.string().datetime().optional(),
  method: z.string().optional(),
  invoiceLabel: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    await requireClientAccess(params.clientId);
    const payments = await prisma.payment.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ payments });
  } catch (err) {
    return handleError(err);
  }
}

// Staff only — clients can view their own billing via a separate portal
// route later, but never create/edit payment records themselves.
export async function POST(req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST", "COMPLIANCE_ADMIN"]);
    await requireClientAccess(params.clientId);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const actorId = (session.user as any).id;

    const payment = await prisma.payment.create({
      data: {
        clientId: params.clientId,
        amount: parsed.data.amount,
        status: parsed.data.status,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
        paidDate: parsed.data.paidDate ? new Date(parsed.data.paidDate) : (parsed.data.status === "PAID" ? new Date() : undefined),
        method: parsed.data.method,
        invoiceLabel: parsed.data.invoiceLabel,
        notes: parsed.data.notes,
        recordedById: actorId,
      },
    });

    await logClientActivity({
      clientId: params.clientId,
      actorId,
      actorType: "user",
      description: `Payment recorded: ${parsed.data.invoiceLabel ?? "Charge"} — $${parsed.data.amount} (${parsed.data.status})`,
    });

    await writeAuditLog({
      actorId,
      action: "PAYMENT_RECORDED",
      entityType: "Payment",
      entityId: payment.id,
      newValue: { amount: parsed.data.amount, status: parsed.data.status },
    });

    return NextResponse.json({ payment }, { status: 201 });
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
