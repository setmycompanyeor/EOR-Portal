"use client";

import { useState, useTransition } from "react";
import { syncZohoInvoices } from "./zoho-actions";

export function ZohoSyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <span aria-live="polite" className="text-[13px] text-ink-muted">
        {msg}
      </span>
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => setMsg((await syncZohoInvoices()).message))}>
        {pending ? "Syncing…" : "Sync from Zoho Books"}
      </button>
    </div>
  );
}
