"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LETTER_TYPES: Record<string, string> = {
  EXPERIAN: "EXPERIAN_DISPUTE",
  EQUIFAX: "EQUIFAX_DISPUTE",
  TRANSUNION: "TRANSUNION_DISPUTE",
};

export default function RoundActions({ round, bureau, documents }: { round: any; bureau: string; documents: any[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestedAction, setRequestedAction] = useState("Please delete this item as it cannot be verified as accurate and complete.");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [selectedLetterId, setSelectedLetterId] = useState<string>(round.letters[0]?.id ?? "");
  const [mailInfo, setMailInfo] = useState({ mailProvider: "USPS Certified Mail", certifiedMailNumber: "", trackingNumber: "" });
  const [responseInfo, setResponseInfo] = useState({ summary: "", responseDate: new Date().toISOString().slice(0, 10) });

  async function run(fn: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      const err = await res.json();
      setError(err.error?.toString() ?? "Action failed");
      return false;
    }
    router.refresh();
    return true;
  }

  async function generateLetter() {
    await run(() =>
      fetch(`/api/dispute-rounds/${round.id}/letters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterType: LETTER_TYPES[bureau], requestedAction }),
      })
    );
  }

  async function buildPackage() {
    if (!selectedLetterId) { setError("Generate a letter first"); return; }
    await run(() =>
      fetch(`/api/dispute-rounds/${round.id}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterId: selectedLetterId, documentIds: selectedDocs }),
      })
    );
  }

  async function markMailed(packageId: string) {
    await run(() =>
      fetch(`/api/dispute-rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, ...mailInfo }),
      })
    );
  }

  async function submitResponse() {
    await run(() =>
      fetch(`/api/dispute-rounds/${round.id}/bureau-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...responseInfo, responseDate: new Date(responseInfo.responseDate).toISOString() }),
      })
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {/* Step 1: Generate letter */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">1. Generate Letter</h3>
        <textarea
          value={requestedAction}
          onChange={(e) => setRequestedAction(e.target.value)}
          className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-xs"
          rows={2}
        />
        <button onClick={generateLetter} disabled={busy || !!round.sentDate} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Generate {bureau} Letter
        </button>
        <div className="mt-2 space-y-1">
          {round.letters.map((l: any) => (
            <label key={l.id} className="flex items-center gap-2 text-xs text-gray-600">
              <input type="radio" name="letter" checked={selectedLetterId === l.id} onChange={() => setSelectedLetterId(l.id)} />
              {l.letterType} v{l.version}
            </label>
          ))}
        </div>
      </div>

      {/* Step 2: Build package */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">2. Build Package</h3>
        <div className="mb-2 space-y-1">
          {documents.filter((d) => d.mimeType === "application/pdf").map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={selectedDocs.includes(d.id)}
                onChange={(e) =>
                  setSelectedDocs((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)))
                }
              />
              {d.category.replaceAll("_", " ")} — {d.fileName}
            </label>
          ))}
          {documents.filter((d) => d.mimeType === "application/pdf").length === 0 && (
            <p className="text-xs text-gray-400">No PDF documents available to attach (non-PDF uploads must be converted first).</p>
          )}
        </div>
        <button onClick={buildPackage} disabled={busy || !!round.sentDate} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Compile Package
        </button>
        <div className="mt-2 space-y-1">
          {round.packages.map((p: any) => (
            <div key={p.id} className="text-xs text-gray-600">
              Package built {new Date(p.createdAt).toLocaleString()} {p.mailedDate && `— mailed ${new Date(p.mailedDate).toLocaleDateString()}`}
              {!p.mailedDate && (
                <button onClick={() => markMailed(p.id)} disabled={busy} className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-700">
                  Mark Mailed
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 3: Mail info */}
      {!round.sentDate && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-800">3. Mail Tracking Info (fill before marking mailed)</h3>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Mail provider" value={mailInfo.mailProvider} onChange={(e) => setMailInfo({ ...mailInfo, mailProvider: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1 text-xs" />
            <input placeholder="Certified mail #" value={mailInfo.certifiedMailNumber} onChange={(e) => setMailInfo({ ...mailInfo, certifiedMailNumber: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1 text-xs" />
            <input placeholder="Tracking #" value={mailInfo.trackingNumber} onChange={(e) => setMailInfo({ ...mailInfo, trackingNumber: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1 text-xs" />
          </div>
        </div>
      )}

      {/* Step 4: Bureau response */}
      {round.sentDate && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-800">4. Record Bureau Response</h3>
          <div className="mb-2 flex gap-2">
            <input type="date" value={responseInfo.responseDate} onChange={(e) => setResponseInfo({ ...responseInfo, responseDate: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1 text-xs" />
            <input placeholder="Summary of response" value={responseInfo.summary} onChange={(e) => setResponseInfo({ ...responseInfo, summary: e.target.value })} className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs" />
          </div>
          <button onClick={submitResponse} disabled={busy} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Record Response
          </button>
          <p className="mt-2 text-xs text-gray-400">
            After recording, update each item's status individually on the Negative Items tab
            (Verified / Deleted / Corrected / Updated) — the system won't guess which outcome applies to which account.
          </p>
        </div>
      )}
    </div>
  );
}
