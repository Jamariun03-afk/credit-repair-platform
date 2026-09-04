"use client";

import { useEffect, useState } from "react";

interface Payment {
  id: string;
  amount: string;
  status: string;
  dueDate: string | null;
  paidDate: string | null;
  method: string | null;
  invoiceLabel: string | null;
}

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-green-100 text-green-700",
  UNPAID: "bg-amber-100 text-amber-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-red-100 text-red-700",
  REFUNDED: "bg-gray-100 text-gray-500",
  WAIVED: "bg-blue-100 text-blue-600",
};

export default function BillingPanel({ clientId }: { clientId: string }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [form, setForm] = useState({ amount: "", invoiceLabel: "", dueDate: "", method: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}/payments`);
    if (res.ok) setPayments((await res.json()).payments);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function addCharge() {
    if (!form.amount) return;
    setSaving(true);
    await fetch(`/api/clients/${clientId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: parseFloat(form.amount),
        invoiceLabel: form.invoiceLabel || undefined,
        method: form.method || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        status: "UNPAID",
      }),
    });
    setSaving(false);
    setForm({ amount: "", invoiceLabel: "", dueDate: "", method: "" });
    load();
  }

  async function markPaid(id: string) {
    await fetch(`/api/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID" }),
    });
    load();
  }

  async function sendPaymentLink(id: string) {
    const res = await fetch(`/api/clients/${clientId}/payments/${id}/checkout`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "Could not create payment link");
      return;
    }
    const { checkoutUrl } = await res.json();
    await navigator.clipboard.writeText(checkoutUrl).catch(() => {});
    alert(`Payment link copied to clipboard:\n${checkoutUrl}`);
  }

  const totalOwed = payments.filter((p) => ["UNPAID", "PARTIAL", "OVERDUE"].includes(p.status)).reduce((s, p) => s + parseFloat(p.amount), 0);

  return (
    <div>
      {totalOwed > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          ${totalOwed.toLocaleString()} outstanding
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Charge</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Amount</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Due</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 text-sm text-gray-800">{p.invoiceLabel ?? "Charge"}</td>
                <td className="px-4 py-2 text-sm text-gray-700">${parseFloat(p.amount).toLocaleString()}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2 text-sm">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[p.status]}`}>{p.status}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  {p.status !== "PAID" && (
                    <div className="flex justify-end gap-3">
                      <button onClick={() => sendPaymentLink(p.id)} className="text-xs text-blue-600 hover:underline">Send Payment Link</button>
                      <button onClick={() => markPaid(p.id)} className="text-xs text-gray-500 hover:underline">Mark Paid Manually</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">No charges recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Add Charge</h3>
        <div className="flex flex-wrap gap-2">
          <input placeholder="Label (e.g. Month 1)" value={form.invoiceLabel} onChange={(e) => setForm({ ...form, invoiceLabel: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
          <input placeholder="Amount" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
          <input placeholder="Method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
          <button onClick={addCharge} disabled={saving || !form.amount} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
