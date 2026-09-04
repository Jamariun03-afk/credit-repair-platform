"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REASONS = [
  "INACCURATE_INFO", "INCOMPLETE_REPORTING", "DUPLICATE_REPORTING", "OBSOLETE_REPORTING",
  "MIXED_FILE", "UNAUTHORIZED_INQUIRY", "IDENTITY_THEFT", "INCORRECT_BALANCE",
  "INCORRECT_STATUS", "INCORRECT_PAYMENT_HISTORY", "INCORRECT_DATES", "INCORRECT_OWNERSHIP",
  "FURNISHER_VERIFICATION", "REINSERTION_REVIEW",
];

interface NegItem {
  id: string;
  category: string;
  status: string;
  bureau: string | null;
}

export default function NewDisputeRoundForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<NegItem[]>([]);
  const [bureau, setBureau] = useState("EXPERIAN");
  const [selected, setSelected] = useState<Record<string, { checked: boolean; reason: string; facts: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/negative-items`)
      .then((r) => r.json())
      .then((d) => setItems(d.items.filter((i: NegItem) => ["ELIGIBLE_FOR_DISPUTE", "VERIFIED", "READY"].includes(i.status))));
  }, [clientId]);

  function toggle(id: string) {
    setSelected((prev) => ({
      ...prev,
      [id]: prev[id]
        ? { ...prev[id], checked: !prev[id].checked }
        : { checked: true, reason: REASONS[0], facts: "" },
    }));
  }

  async function handleSubmit() {
    const chosen = Object.entries(selected).filter(([, v]) => v.checked);
    if (chosen.length === 0) {
      setError("Select at least one item");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/clients/${clientId}/disputes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bureau,
        items: chosen.map(([negativeItemId, v]) => ({
          negativeItemId,
          reasonType: v.reason,
          supportingFacts: v.facts || undefined,
        })),
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const err = await res.json();
      setError(err.error?.toString() ?? "Could not create round");
      return;
    }
    const { round } = await res.json();
    router.push(`/dispute-rounds/${round.id}`);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-gray-600">Bureau</label>
        <select value={bureau} onChange={(e) => setBureau(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="EXPERIAN">Experian</option>
          <option value="EQUIFAX">Equifax</option>
          <option value="TRANSUNION">TransUnion</option>
        </select>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const sel = selected[item.id];
          return (
            <div key={item.id} className="rounded-md border border-gray-200 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <input type="checkbox" checked={!!sel?.checked} onChange={() => toggle(item.id)} />
                {item.category.replaceAll("_", " ")} <span className="text-xs text-gray-400">({item.status})</span>
              </label>
              {sel?.checked && (
                <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                  <select
                    value={sel.reason}
                    onChange={(e) => setSelected((p) => ({ ...p, [item.id]: { ...p[item.id], reason: e.target.value } }))}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                  >
                    {REASONS.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Supporting facts (optional)"
                    value={sel.facts}
                    onChange={(e) => setSelected((p) => ({ ...p, [item.id]: { ...p[item.id], facts: e.target.value } }))}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                  />
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-sm text-gray-400">No items currently eligible for dispute. Items must be marked ELIGIBLE_FOR_DISPUTE on the Negative Items tab first.</p>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting || items.length === 0}
        className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create Round"}
      </button>
    </div>
  );
}
