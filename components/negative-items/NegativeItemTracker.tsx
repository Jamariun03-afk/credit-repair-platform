"use client";

import { useEffect, useState } from "react";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  IDENTIFIED: ["RESEARCHING", "CLOSED"],
  RESEARCHING: ["ELIGIBLE_FOR_DISPUTE", "DOCUMENTATION_NEEDED", "CLOSED"],
  DOCUMENTATION_NEEDED: ["ELIGIBLE_FOR_DISPUTE", "CLOSED"],
  ELIGIBLE_FOR_DISPUTE: ["READY", "CLOSED"],
  READY: ["SENT"],
  SENT: ["PENDING"],
  PENDING: ["VERIFIED", "UPDATED", "DELETED", "CORRECTED", "ESCALATED"],
  VERIFIED: ["ESCALATED", "READY", "CLOSED"],
  UPDATED: ["CLOSED", "READY"],
  ESCALATED: ["CLOSED", "READY"],
  DELETED: ["CLOSED"],
  CORRECTED: ["CLOSED"],
  CLOSED: [],
};

const STATUS_TONE: Record<string, string> = {
  DELETED: "bg-green-100 text-green-700",
  CORRECTED: "bg-blue-100 text-blue-700",
  VERIFIED: "bg-amber-100 text-amber-700",
  ESCALATED: "bg-red-100 text-red-700",
  CLOSED: "bg-gray-200 text-gray-600",
};

interface Item {
  id: string;
  category: string;
  status: string;
  furnisherName: string | null;
  bureau: string | null;
  createdAt: string;
}

export default function NegativeItemTracker({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}/negative-items`);
    if (res.ok) setItems((await res.json()).items);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function transition(itemId: string, status: string) {
    setBusyId(itemId);
    const res = await fetch(`/api/negative-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (res.ok) load();
    else {
      const err = await res.json();
      alert(err.error ?? "Could not update status");
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Furnisher</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Bureau</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Move to</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const options = ALLOWED_TRANSITIONS[item.status] ?? [];
            return (
              <tr key={item.id}>
                <td className="px-4 py-2 text-sm text-gray-800">{item.category.replaceAll("_", " ")}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{item.furnisherName ?? "—"}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{item.bureau ?? "—"}</td>
                <td className="px-4 py-2 text-sm">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {item.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm">
                  {options.length > 0 ? (
                    <select
                      disabled={busyId === item.id}
                      defaultValue=""
                      onChange={(e) => e.target.value && transition(item.id, e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="" disabled>Choose…</option>
                      {options.map((o) => (
                        <option key={o} value={o}>{o.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-400">Terminal</span>
                  )}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">No negative items identified yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
