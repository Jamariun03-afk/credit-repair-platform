"use client";

import { useEffect, useState } from "react";

const CATEGORIES = [
  "DRIVER_LICENSE", "STATE_ID", "SSN_CARD", "PROOF_OF_ADDRESS", "UTILITY_BILL",
  "BANK_STATEMENT", "CREDIT_REPORT", "FTC_IDENTITY_THEFT_REPORT", "POLICE_REPORT",
  "AFFIDAVIT", "BUREAU_LETTER", "CREDITOR_LETTER", "FURNISHER_CORRESPONDENCE",
  "CFPB_COMPLAINT", "SUPPORTING_EVIDENCE", "MAILING_RECEIPT", "CERTIFIED_MAIL_TRACKING",
  "BUREAU_RESPONSE", "UPDATED_CREDIT_REPORT", "SIGNED_AGREEMENT", "OTHER",
];

interface DocRow {
  id: string;
  category: string;
  fileName: string;
  createdAt: string;
  viewUrl: string;
}

export default function DocumentVault({ clientId }: { clientId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDocs() {
    const res = await fetch(`/api/clients/${clientId}/documents`);
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents);
    }
  }

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const createRes = await fetch(`/api/clients/${clientId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, fileName: file.name, mimeType: file.type || "application/octet-stream" }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error?.toString() ?? "Could not start upload");
      }

      const { uploadUrl } = await createRes.json();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!putRes.ok) throw new Error("Upload to storage failed");

      setFile(null);
      await loadDocs();
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleUpload} className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!file || uploading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">File</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Uploaded</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 text-sm text-gray-700">{d.category.replaceAll("_", " ")}</td>
                <td className="px-4 py-2 text-sm text-gray-900">{d.fileName}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{new Date(d.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-right">
                  <a href={d.viewUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                    View
                  </a>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">No documents yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
