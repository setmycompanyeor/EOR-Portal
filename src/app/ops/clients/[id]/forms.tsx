"use client";

import { useActionState, useState } from "react";
import { addDepositEntry, createMonthlyInvoice, type ActionState } from "../../actions";

export function DepositEntryForm({ clientId, today }: { clientId: string; today: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addDepositEntry, {});
  const [kind, setKind] = useState("received");
  return (
    <form action={action} className="grid grid-cols-2 gap-2 rounded-lg bg-canvas p-3 md:grid-cols-6">
      <input type="hidden" name="client_id" value={clientId} />
      <select className="input" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Entry kind">
        <option value="received">Received</option>
        <option value="refund">Refund</option>
        <option value="adjustment">Adjustment</option>
        <option value="required_revised">Set required</option>
      </select>
      {kind === "required_revised" ? (
        <input className="input" name="required_amount" type="number" min={0} placeholder="Required ₹" required aria-label="Required amount" />
      ) : (
        <input className="input" name="amount" type="number" min={0} placeholder="Amount ₹" required aria-label="Amount" />
      )}
      <input className="input" name="entry_date" type="date" defaultValue={today} aria-label="Date" />
      <input className="input" name="reference" placeholder="Reference" aria-label="Reference" />
      <input className="input" name="note" placeholder="Note" aria-label="Note" />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "…" : "Add"}
      </button>
      <p aria-live="polite" className={`col-span-full min-h-4 text-[12px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
    </form>
  );
}

export function MonthlyInvoiceForm({ clientId, period }: { clientId: string; period: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createMonthlyInvoice, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
      <input type="hidden" name="client_id" value={clientId} />
      <label className="label">
        Period
        <input className="input" name="period" type="month" defaultValue={period} required />
      </label>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Calculating…" : "Prepare draft from payroll"}
      </button>
      <p aria-live="polite" className={`w-full min-h-4 text-[12px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
    </form>
  );
}
