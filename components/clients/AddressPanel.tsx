"use client";

import { useEffect, useState } from "react";

interface Address {
  id: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  isCurrent: boolean;
}

export default function AddressPanel({ clientId }: { clientId: string }) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [form, setForm] = useState({ line1: "", line2: "", city: "", state: "", zip: "" });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}/addresses`);
    if (res.ok) setAddresses((await res.json()).addresses);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/addresses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, isCurrent: true }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ line1: "", line2: "", city: "", state: "", zip: "" });
      setShowForm(false);
      load();
    }
  }

  const current = addresses.find((a) => a.isCurrent);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Current Address</h3>
        <button onClick={() => setShowForm((s) => !s)} className="text-xs text-blue-600 hover:underline">
          {current ? "Update" : "+ Add address"}
        </button>
      </div>

      {current && !showForm && (
        <p className="text-sm text-gray-600">
          {current.line1}{current.line2 ? `, ${current.line2}` : ""}<br />
          {current.city}, {current.state} {current.zip}
        </p>
      )}
      {!current && !showForm && (
        <p className="text-sm text-amber-600">No address on file — required before dispute letters can be generated.</p>
      )}

      {showForm && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input placeholder="Address line 1" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} className="col-span-2 rounded-md border border-gray-300 px-2 py-1 text-xs" />
          <input placeholder="Address line 2 (optional)" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} className="col-span-2 rounded-md border border-gray-300 px-2 py-1 text-xs" />
          <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1 text-xs" />
          <input placeholder="State (2-letter)" maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} className="rounded-md border border-gray-300 px-2 py-1 text-xs" />
          <input placeholder="ZIP" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1 text-xs" />
          <button onClick={save} disabled={saving} className="col-span-2 mt-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save Address"}
          </button>
        </div>
      )}
    </div>
  );
}
