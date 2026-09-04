"use client";

import { useState } from "react";

export default function PortalPayButton({ clientId, paymentId }: { clientId: string; paymentId: string }) {
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/payments/${paymentId}/checkout`, { method: "POST" });
    if (!res.ok) {
      setLoading(false);
      alert("Could not start checkout. Please try again or contact your specialist.");
      return;
    }
    const { checkoutUrl } = await res.json();
    window.location.href = checkoutUrl;
  }

  return (
    <button
      onClick={handlePay}
      disabled={loading}
      className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
    >
      {loading ? "Loading…" : "Pay Now"}
    </button>
  );
}
