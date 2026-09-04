import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireClientAccess, requireRole, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { logClientActivity, writeAuditLog } from "@/lib/audit";

const DISPUTE_REASONS = [
  "INACCURATE_INFO", "INCOMPLETE_REPORTING", "DUPLICATE_REPORTING", "OBSOLETE_REPORTING",
  "MIXED_FILE", "UNAUTHORIZED_INQUIRY", "IDENTITY_THEFT", "INCORRECT_BALANCE",
  "INCORRECT_STATUS", "INCORRECT_PAYMENT_HISTORY", "INCORRECT_DATES", "INCORRECT_OWNERSHIP",
  "FURNISHER_VERIFICATION", "REINSERTION_REVIEW",
] as const;

const createDisputeSchema = z.object({
  bureau: z.enum(["EXPERIAN", "EQUIFAX", "TRANSUNION"]),
  items: z.array(z.object({
    negativeItemId: z.string().uuid(),
    reasonType: z.enum(DISPUTE_REASONS),
    supportingFacts: z.string().optional(),
  })).min(1, "A dispute round needs at least one item"),
});

// GET — all disputes (across bureaus) for a client, with their rounds.
export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    await requireClientAccess(params.clientId);

    const disputes = await prisma.dispute.findMany({
      where: { clientId: params.clientId },
      include: {
        rounds: {
          orderBy: { roundNumber: "asc" },
          include: { items: { include: { negativeItem: true } }, letters: true, packages: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ disputes });
  } catch (err) {
    return handleError(err);
  }
}

// POST — creates (or reuses) a Dispute for this client+bureau, then
// creates the next round number and attaches the given items. Every
// item must currently be ELIGIBLE_FOR_DISPUTE or VERIFIED (i.e. eligible
// for a next round) — this is the business-rule gate that keeps a
// round from being built out of items that were never actually audited.
export async function POST(req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST"]);
    await requireClientAccess(params.clientId);

    const body = await req.json();
    const parsed = createDisputeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const negativeItemIds = parsed.data.items.map((i) => i.negativeItemId);
    const items = await prisma.negativeItem.findMany({ where: { id: { in: negativeItemIds } } });

    if (items.length !== negativeItemIds.length) {
      return NextResponse.json({ error: "One or more negative items not found" }, { status: 400 });
    }
    const notOwned = items.filter((i) => i.clientId !== params.clientId);
    if (notOwned.length > 0) {
      return NextResponse.json({ error: "Negative items must belong to this client" }, { status: 400 });
    }
    const notEligible = items.filter((i) => !["ELIGIBLE_FOR_DISPUTE", "VERIFIED", "READY"].includes(i.status));
    if (notEligible.length > 0) {
      return NextResponse.json(
        { error: `Not eligible for a dispute round: ${notEligible.map((i) => `${i.category} (${i.status})`).join(", ")}` },
        { status: 400 }
      );
    }

    let dispute = await prisma.dispute.findFirst({ where: { clientId: params.clientId, bureau: parsed.data.bureau } });
    if (!dispute) {
      dispute = await prisma.dispute.create({ data: { clientId: params.clientId, bureau: parsed.data.bureau } });
    }

    const lastRound = await prisma.disputeRound.findFirst({
      where: { disputeId: dispute.id },
      orderBy: { roundNumber: "desc" },
    });
    const roundNumber = (lastRound?.roundNumber ?? 0) + 1;

    const round = await prisma.disputeRound.create({
      data: {
        disputeId: dispute.id,
        roundNumber,
        items: {
          create: parsed.data.items.map((i) => ({
            negativeItemId: i.negativeItemId,
            reasonType: i.reasonType,
            supportingFacts: i.supportingFacts,
          })),
        },
      },
      include: { items: true },
    });

    // Move items to READY — they're staged in a round but not yet mailed.
    await prisma.negativeItem.updateMany({
      where: { id: { in: negativeItemIds } },
      data: { status: "READY", disputeRoundCount: { increment: 1 } },
    });

    const actorId = (session.user as any).id;

    await logClientActivity({
      clientId: params.clientId,
      actorId,
      actorType: "user",
      description: `${parsed.data.bureau} Round ${roundNumber} created with ${items.length} item(s)`,
    });

    await writeAuditLog({
      actorId,
      action: "DISPUTE_ROUND_CREATED",
      entityType: "DisputeRound",
      entityId: round.id,
      newValue: { bureau: parsed.data.bureau, roundNumber, itemCount: items.length },
    });

    return NextResponse.json({ dispute, round }, { status: 201 });
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
