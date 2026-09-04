import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import PortalPayButton from "@/components/billing/PortalPayButton";

export default async function PortalBillingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "CLIENT") redirect("/login");

  const client = await prisma.client.findUnique({
    where: { userId: (session.user as any).id },
    include: { payments: { orderBy: { dueDate: "desc" } } },
  });
  if (!client) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Billing</h1>
        <p className="mb-6 text-sm text-gray-500">Your charges and payment history.</p>

        <div className="space-y-3">
          {client.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
              <div>
                <div className="text-sm font-medium text-gray-900">{p.invoiceLabel ?? "Charge"}</div>
                <div className="text-xs text-gray-500">
                  ${Number(p.amount).toLocaleString()} {p.dueDate && `— due ${new Date(p.dueDate).toLocaleDateString()}`}
                </div>
              </div>
              {p.status === "PAID" ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Paid</span>
              ) : (
                <PortalPayButton clientId={client.id} paymentId={p.id} />
              )}
            </div>
          ))}
          {client.payments.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
              No charges on your account yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
