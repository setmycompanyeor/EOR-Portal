"use client";

import { useActionState, useState } from "react";
import { recordZohoInvoice, type ActionState } from "../../actions";

export type DraftOption = { id: string; label: string; subtotal: number; gst: number; total: number; period_start: string | null; period_end: string | null };

export function RecordInvoiceForm({ clientId, drafts, today }: { clientId: string; drafts: DraftOption[]; today: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordZohoInvoice, {});
  const [draftId, setDraftId] = useState("");
  const draft = drafts.find((d) => d.id === draftId);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg bg-canvas p-3">
      <input type="hidden" name="client_id" value={clientId} />
      <div className="text-[13px] font-medium">Record an invoice raised in Zoho Books</div>
      {drafts.length > 0 && (
        <label className="label">
          Based on a prepared draft (optional)
          <select className="input" name="draft_id" value={draftId} onChange={(e) => setDraftId(e.target.value)}>
            <option value="">None</option>
            {drafts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <label className="label">
          Zoho invoice number
          <input className="input" name="number" placeholder="INV-000123" required />
        </label>
        <label className="label">
          Kind
          <select className="input" name="kind" defaultValue="monthly">
            <option value="monthly">Monthly</option>
            <option value="one_time">One-time</option>
            <option value="deposit">Deposit</option>
          </select>
        </label>
        <label className="label">
          Period (monthly)
          <input className="input" name="period" type="month" key={draft?.period_start ?? "p"} defaultValue={draft?.period_start ? draft.period_start.slice(0, 7) : ""} />
        </label>
        <label className="label">
          Issue date
          <input className="input" name="issue_date" type="date" defaultValue={today} required />
        </label>
        <label className="label">
          Due date
          <input className="input" name="due_date" type="date" required />
        </label>
        <label className="label">
          Subtotal (₹)
          <input className="input" name="subtotal" type="number" step="0.01" min={0} key={`s${draftId}`} defaultValue={draft ? draft.subtotal : ""} required />
        </label>
        <label className="label">
          GST (₹)
          <input className="input" name="gst" type="number" step="0.01" min={0} key={`g${draftId}`} defaultValue={draft ? draft.gst : ""} required />
        </label>
        <label className="label">
          Total (₹)
          <input className="input" name="total" type="number" step="0.01" min={0} key={`t${draftId}`} defaultValue={draft ? draft.total : ""} required />
        </label>
        <label className="label">
          Invoice PDF
          <input className="input py-1.5" name="file" type="file" accept=".pdf" required />
        </label>
      </div>
      <p aria-live="polite" className={`min-h-4 text-[12px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Record invoice and notify client"}
        </button>
      </div>
    </form>
  );
}
