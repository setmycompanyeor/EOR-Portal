"use client";

import { useState, type ReactNode } from "react";

export function BillingTabs({ invoices, ledger }: { invoices: ReactNode; ledger: ReactNode }) {
  const [tab, setTab] = useState<"invoices" | "ledger">("invoices");
  const cls = (on: boolean) => `min-h-11 border-b-2 px-3.5 text-sm font-medium ${on ? "border-brand text-brand" : "border-transparent text-ink-muted"}`;
  return (
    <div>
      <div role="tablist" className="mb-3 flex gap-1 border-b border-line">
        <button type="button" role="tab" aria-selected={tab === "invoices"} className={cls(tab === "invoices")} onClick={() => setTab("invoices")}>
          Invoices
        </button>
        <button type="button" role="tab" aria-selected={tab === "ledger"} className={cls(tab === "ledger")} onClick={() => setTab("ledger")}>
          Deposit ledger
        </button>
      </div>
      {tab === "invoices" ? invoices : ledger}
    </div>
  );
}
