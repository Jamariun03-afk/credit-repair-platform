"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => { setSetupNeeded(d.setupNeeded); setChecking(false); });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json();
      setError(err.error?.toString() ?? "Setup failed");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (checking) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">Checking setup status…</div>;
  }

  if (!setupNeeded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-600">Setup has already been completed for this deployment.</p>
          <a href="/login" className="mt-4 inline-block text-sm text-blue-600 hover:underline">Go to login →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-gray-900">Welcome — First-Time Setup</h1>
        <p className="mb-6 text-sm text-gray-500">
          Create your admin account. This page only works once — it disables itself the moment this account is created.
        </p>

        {done ? (
          <p className="text-sm font-medium text-green-600">Account created. Redirecting to login…</p>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />

            <label className="mb-1 block text-sm font-medium text-gray-700">Password (min. 10 characters)</label>
            <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />

            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm Password</label>
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={loading} className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {loading ? "Creating…" : "Create Admin Account"}
            </button>
            <p className="mt-3 text-xs text-gray-400">
              Note: this account requires MFA. After creating it, your first login will walk you through scanning a QR code.
            </p>
          </>
        )}
      </form>
    </div>
  );
}
