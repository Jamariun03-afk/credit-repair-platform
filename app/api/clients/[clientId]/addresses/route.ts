import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireClientAccess, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/audit";

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5),
  isCurrent: z.boolean().default(true),
});

export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    await requireClientAccess(params.clientId);
    const addresses = await prisma.clientAddress.findMany({
      where: { clientId: params.clientId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ addresses });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const session = await requireClientAccess(params.clientId);
    const body = await req.json();
    const parsed = addressSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    // If this is marked current, un-current any prior address —
    // letter generation always picks isCurrent first, so only one
    // should ever be true at a time.
    if (parsed.data.isCurrent) {
      await prisma.clientAddress.updateMany({
        where: { clientId: params.clientId, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    const address = await prisma.clientAddress.create({
      data: { ...parsed.data, clientId: params.clientId },
    });

    await writeAuditLog({
      actorId: (session.user as any).id,
      action: "CLIENT_ADDRESS_ADDED",
      entityType: "ClientAddress",
      entityId: address.id,
    });

    return NextResponse.json({ address }, { status: 201 });
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
