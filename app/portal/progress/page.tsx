import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function PortalProgressPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "CLIENT") {
    redirect("/login");
  }

  const client = await prisma.client.findUnique({
    where: { userId: (session.user as any).id },
    include: { negativeItems: true },
  });
  if (!client) redirect("/login");

  const disputes = await prisma.dispute.findMany({
    where: { clientId: client.id },
    include: { rounds: { orderBy: { roundNumber: "asc" } } },
  });

  const deleted = client.negativeItems.filter((i) => i.status === "DELETED").length;
  const corrected = client.negativeItems.filter((i) => i.status === "CORRECTED").length;
  const pending = client.negativeItems.filter((i) => !["DELETED", "CORRECTED", "CLOSED"].includes(i.status)).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Your Credit Repair Progress</h1>
        <p className="mb-6 text-sm text-gray-500">Welcome back, {client.firstName}.</p>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
            <div className="text-2xl font-semibold text-green-600">{deleted}</div>
            <div className="text-xs text-gray-500">Accounts Deleted</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
            <div className="text-2xl font-semibold text-blue-600">{corrected}</div>
            <div className="text-xs text-gray-500">Accounts Corrected</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
            <div className="text-2xl font-semibold text-amber-600">{pending}</div>
            <div className="text-xs text-gray-500">In Progress</div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Dispute Rounds</h2>
          <div className="space-y-3">
            {disputes.flatMap((d) => d.rounds).map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <span className="text-sm text-gray-700">
                  {disputes.find((d) => d.rounds.some((x) => x.id === r.id))?.bureau} — Round {r.roundNumber}
                </span>
                <span className="text-xs text-gray-500">
                  {r.bureauResponse ? "Response Received" : r.sentDate ? "Pending" : "Preparing"}
                </span>
              </div>
            ))}
            {disputes.length === 0 && <p className="text-sm text-gray-400">No dispute rounds yet — your specialist will update this once your audit is complete.</p>}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Results vary by individual circumstances. We do not guarantee deletions or a specific score increase.
        </p>
      </div>
    </div>
  );
}
