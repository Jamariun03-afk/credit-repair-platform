import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireClientAccess, requireRole, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { logClientActivity, writeAuditLog } from "@/lib/audit";

const tradelineSchema = z.object({
  creditorName: z.string().min(1),
  furnisherName: z.string().optional(),
  accountName: z.string().min(1),
  accountNumberMasked: z.string().optional(),
  accountType: z.string().optional(),
  accountStatus: z.string().optional(),
  balance: z.number().optional(),
  creditLimit: z.number().optional(),
  pastDueAmount: z.number().optional(),
  paymentStatus: z.string().optional(),
  remarks: z.string().optional(),
});

const createReportSchema = z.object({
  bureau: z.enum(["EXPERIAN", "EQUIFAX", "TRANSUNION"]),
  reportDate: z.string().datetime(),
  tradelines: z.array(tradelineSchema).default([]),
});

// GET — full report history for this client, all bureaus, newest first.
export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    await requireClientAccess(params.clientId);

    const reports = await prisma.creditReport.findMany({
      where: { clientId: params.clientId },
      orderBy: { reportDate: "desc" },
      include: { tradelines: true },
    });

    return NextResponse.json({ reports });
  } catch (err) {
    return handleError(err);
  }
}

// POST — creates a new report snapshot for one bureau and, if a prior
// report exists for the same client+bureau, computes a CHANGE REPORT
// (§31 of the spec) by diffing tradelines on accountName+creditorName.
export async function POST(req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const session = await requireRole(["SUPER_ADMIN", "CREDIT_SPECIALIST"]);
    await requireClientAccess(params.clientId);

    const body = await req.json();
    const parsed = createReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const previousReport = await prisma.creditReport.findFirst({
      where: { clientId: params.clientId, bureau: parsed.data.bureau },
      orderBy: { reportDate: "desc" },
      include: { tradelines: true },
    });

    const report = await prisma.creditReport.create({
      data: {
        clientId: params.clientId,
        bureau: parsed.data.bureau,
        reportDate: new Date(parsed.data.reportDate),
        tradelines: {
          create: parsed.data.tradelines.map((t) => ({
            ...t,
            balance: t.balance ?? undefined,
            creditLimit: t.creditLimit ?? undefined,
            pastDueAmount: t.pastDueAmount ?? undefined,
          })),
        },
      },
      include: { tradelines: true },
    });

    const changeReport = previousReport ? diffTradelines(previousReport.tradelines, report.tradelines) : null;

    const actorId = (session.user as any).id;

    await logClientActivity({
      clientId: params.clientId,
      actorId,
      actorType: "user",
      description: previousReport
        ? `${parsed.data.bureau} report re-uploaded — ${changeReport!.deleted} deleted, ${changeReport!.added} added, ${changeReport!.balanceChanged} balance changes`
        : `${parsed.data.bureau} report uploaded (${report.tradelines.length} tradelines)`,
    });

    await writeAuditLog({
      actorId,
      action: "CREDIT_REPORT_UPLOADED",
      entityType: "CreditReport",
      entityId: report.id,
      newValue: { bureau: report.bureau, tradelineCount: report.tradelines.length },
    });

    return NextResponse.json({ report, changeReport }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function diffTradelines(prev: any[], curr: any[]) {
  const key = (t: any) => `${t.creditorName}::${t.accountName}`;
  const prevMap = new Map(prev.map((t) => [key(t), t]));
  const currMap = new Map(curr.map((t) => [key(t), t]));

  let added = 0, deleted = 0, balanceChanged = 0, statusChanged = 0;

  for (const [k, t] of currMap) {
    if (!prevMap.has(k)) { added++; continue; }
    const p = prevMap.get(k);
    if (String(p.balance) !== String(t.balance)) balanceChanged++;
    if (p.accountStatus !== t.accountStatus) statusChanged++;
  }
  for (const k of prevMap.keys()) {
    if (!currMap.has(k)) deleted++;
  }

  return { added, deleted, balanceChanged, statusChanged };
}

function handleError(err: unknown) {
  if (err instanceof UnauthenticatedError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
