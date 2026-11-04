"use client";

import { useState, useTransition } from "react";
import { markApprovalPaidInKeka, syncKekaApprovals } from "./keka-actions";

export function KekaSyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span aria-live="polite" className="text-[13px] text-ink-muted">
        {msg}
      </span>
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => setMsg((await syncKekaApprovals()).message))}>
        {pending ? "Syncing…" : "Sync from Keka"}
      </button>
    </div>
  );
}

export function MarkPaidInKekaButton({ approvalId }: { approvalId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span className="text-[12px] text-ink-muted">{msg}</span>;
  return (
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => setMsg((await markApprovalPaidInKeka(approvalId)).message))}>
      {pending ? "…" : "Mark paid in Keka"}
    </button>
  );
}
