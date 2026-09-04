import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireClientAccess, requireRole, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { logClientActivity, writeAuditLog } from "@/lib/audit";

const NEGATIVE_CATEGORIES = [
  "COLLECTION", "CHARGE_OFF", "LATE_PAYMENT", "REPOSSESSION", "FORECLOSURE",
  "BANKRUPTCY", "STUDENT_LOAN_DELINQUENCY", "MEDICAL_COLLECTION", "UTILITY_COLLECTION",
  "RENTAL_DEBT", "TELECOM_DEBT", "HARD_INQUIRY", "PERSONAL_INFO_ISSUE",
  "DUPLICATE_ACCOUNT", "MIXED_FILE", "IDENTITY_THEFT_ITEM", "OTHER_ADVERSE",
] as const;

const createSchema = z.object({
  category: z.enum(NEGATIVE_CATEGORIES),
  furnisherName: z.string().optional(),
  bureau: z.enum(["EXPERIAN", "EQUIFAX", "TRANSUNION"]).optional(),
  tradelineIds: z.array(z.string().uuid()).default([]),
});

export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    await requireClientAccess(params.clientId);

    const items = await prisma.negativeItem.findMany({
      where: { clientId: params.clientId },
      include: { tradelines: { include: { tradeline: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ items });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST"]);
    await requireClientAccess(params.clientId);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await prisma.negativeItem.create({
      data: {
        clientId: params.clientId,
        category: parsed.data.category,
        furnisherName: parsed.data.furnisherName,
        bureau: parsed.data.bureau,
        status: "IDENTIFIED",
        tradelines: {
          create: parsed.data.tradelineIds.map((tradelineId) => ({ tradelineId })),
        },
      },
    });

    const actorId = (session.user as any).id;

    await logClientActivity({
      clientId: params.clientId,
      actorId,
      actorType: "user",
      description: `Negative item identified: ${parsed.data.category.replaceAll("_", " ")}${parsed.data.furnisherName ? ` — ${parsed.data.furnisherName}` : ""}`,
    });

    await writeAuditLog({
      actorId,
      action: "NEGATIVE_ITEM_CREATED",
      entityType: "NegativeItem",
      entityId: item.id,
      newValue: { category: item.category, status: item.status },
    });

    return NextResponse.json({ item }, { status: 201 });
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
