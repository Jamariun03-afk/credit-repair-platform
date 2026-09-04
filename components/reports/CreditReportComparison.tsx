"use client";

import { useEffect, useState } from "react";

interface Tradeline {
  id: string;
  creditorName: string;
  accountName: string;
  balance: string | null;
  accountStatus: string | null;
}

interface Report {
  id: string;
  bureau: string;
  reportDate: string;
  tradelines: Tradeline[];
}

export default function CreditReportComparison({ clientId }: { clientId: string }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [changeReport, setChangeReport] = useState<any>(null);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}/credit-reports`);
    if (res.ok) setReports((await res.json()).reports);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // latest report per bureau, for side-by-side comparison
  const latestByBureau: Record<string, Report> = {};
  for (const r of reports) {
    if (!latestByBureau[r.bureau] || new Date(r.reportDate) > new Date(latestByBureau[r.bureau].reportDate)) {
      latestByBureau[r.bureau] = r;
    }
  }
  const bureaus = ["EXPERIAN", "EQUIFAX", "TRANSUNION"];

  // union of account names across bureaus, to build comparison rows
  const accountKeys = new Set<string>();
  Object.values(latestByBureau).forEach((r) => r.tradelines.forEach((t) => accountKeys.add(`${t.creditorName}::${t.accountName}`)));

  return (
    <div>
      {changeReport && (
        <div className="mb-4 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          Change since last report: {changeReport.added} added, {changeReport.deleted} deleted,{" "}
          {changeReport.balanceChanged} balance changes, {changeReport.statusChanged} status changes.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Account</th>
              {bureaus.map((b) => (
                <th key={b} className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">{b}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...accountKeys].map((key) => {
              const [creditor, account] = key.split("::");
              return (
                <tr key={key}>
                  <td className="px-4 py-2 font-medium text-gray-800">{creditor} — {account}</td>
                  {bureaus.map((b) => {
                    const t = latestByBureau[b]?.tradelines.find((tl) => `${tl.creditorName}::${tl.accountName}` === key);
                    return (
                      <td key={b} className="px-4 py-2 text-gray-600">
                        {t ? `$${t.balance ?? "0"} (${t.accountStatus ?? "—"})` : <span className="text-gray-300">No balance</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {accountKeys.size === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No reports uploaded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Report upload UI (manual tradeline entry form) is the next incremental piece —
        this view already reads real report/tradeline data via POST /api/clients/[clientId]/credit-reports.
      </p>
    </div>
  );
}
