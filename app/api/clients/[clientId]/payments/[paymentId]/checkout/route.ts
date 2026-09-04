import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClientAccess, ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
import { stripe } from "@/lib/payments/stripe";
import { writeAuditLog } from "@/lib/audit";

// POST /api/clients/[clientId]/payments/[paymentId]/checkout
// Creates a Stripe Checkout session for one specific charge. Staff can
// call this to generate a link to send the client; the client can also
// call it themselves from the portal (requireClientAccess allows both,
// scoped to their own record).
export async function POST(req: NextRequest, { params }: { params: { clientId: string; paymentId: string } }) {
  try {
    const session = await requireClientAccess(params.clientId);

    const payment = await prisma.payment.findUnique({ where: { id: params.paymentId } });
    if (!payment || payment.clientId !== params.clientId) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (payment.status === "PAID") {
      return NextResponse.json({ error: "This charge is already paid" }, { status: 400 });
    }

    const client = await prisma.client.findUnique({ where: { id: params.clientId } });
    const baseUrl = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: client?.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(payment.amount) * 100),
            product_data: {
              name: payment.invoiceLabel ?? "Credit Repair Services",
              description: `${client?.firstName} ${client?.lastName}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentId: payment.id,
        clientId: params.clientId,
      },
      success_url: `${baseUrl}/portal/billing?paid=1`,
      cancel_url: `${baseUrl}/portal/billing?cancelled=1`,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { stripeCheckoutSessionId: checkoutSession.id },
    });

    await writeAuditLog({
      actorId: (session.user as any).id,
      action: "PAYMENT_CHECKOUT_CREATED",
      entityType: "Payment",
      entityId: payment.id,
      newValue: { checkoutSessionId: checkoutSession.id },
    });

    return NextResponse.json({ checkoutUrl: checkoutSession.url });
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
