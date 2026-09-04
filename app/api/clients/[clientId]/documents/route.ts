import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireClientAccess, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { logClientActivity, writeAuditLog } from "@/lib/audit";
import { buildStorageKey, getUploadUrl, getDownloadUrl } from "@/lib/storage/s3";

const DOCUMENT_CATEGORIES = [
  "DRIVER_LICENSE", "STATE_ID", "SSN_CARD", "PROOF_OF_ADDRESS", "UTILITY_BILL",
  "BANK_STATEMENT", "CREDIT_REPORT", "FTC_IDENTITY_THEFT_REPORT", "POLICE_REPORT",
  "AFFIDAVIT", "BUREAU_LETTER", "CREDITOR_LETTER", "FURNISHER_CORRESPONDENCE",
  "CFPB_COMPLAINT", "SUPPORTING_EVIDENCE", "MAILING_RECEIPT", "CERTIFIED_MAIL_TRACKING",
  "BUREAU_RESPONSE", "UPDATED_CREDIT_REPORT", "SIGNED_AGREEMENT", "OTHER",
] as const;

const requestUploadSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

// GET — list documents with short-lived signed view URLs (never a durable public link)
export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    await requireClientAccess(params.clientId);

    const docs = await prisma.clientDocument.findMany({
      where: { clientId: params.clientId },
      orderBy: { createdAt: "desc" },
    });

    const withUrls = await Promise.all(
      docs.map(async (d) => ({
        ...d,
        viewUrl: await getDownloadUrl(d.storageKey),
      }))
    );

    return NextResponse.json({ documents: withUrls });
  } catch (err) {
    return handleError(err);
  }
}

// POST — Step 1 of upload: create the document record + return a
// presigned PUT URL. The client uploads the actual bytes directly to
// S3 with that URL; the file never passes through our server.
export async function POST(req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const session = await requireClientAccess(params.clientId);
    const role = (session.user as any).role;
    if (role === "CLIENT") {
      // clients may upload but only to categories a client would reasonably supply
      const allowedForClient = ["DRIVER_LICENSE", "STATE_ID", "SSN_CARD", "PROOF_OF_ADDRESS", "UTILITY_BILL", "BANK_STATEMENT", "SUPPORTING_EVIDENCE"];
      const body = await req.json();
      if (!allowedForClient.includes(body.category)) {
        throw new ForbiddenError("Clients cannot upload documents in this category");
      }
    }

    const body = await req.json();
    const parsed = requestUploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const storageKey = buildStorageKey(params.clientId, parsed.data.category, parsed.data.fileName);
    const uploadUrl = await getUploadUrl(storageKey, parsed.data.mimeType);

    const doc = await prisma.clientDocument.create({
      data: {
        clientId: params.clientId,
        category: parsed.data.category,
        storageKey,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType,
        uploadedById: (session.user as any).id,
      },
    });

    await logClientActivity({
      clientId: params.clientId,
      actorId: (session.user as any).id,
      actorType: "user",
      description: `Document uploaded: ${parsed.data.category.replaceAll("_", " ")} (${parsed.data.fileName})`,
    });

    await writeAuditLog({
      actorId: (session.user as any).id,
      action: "DOCUMENT_UPLOADED",
      entityType: "ClientDocument",
      entityId: doc.id,
      newValue: { category: doc.category, fileName: doc.fileName },
    });

    return NextResponse.json({ document: doc, uploadUrl }, { status: 201 });
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
