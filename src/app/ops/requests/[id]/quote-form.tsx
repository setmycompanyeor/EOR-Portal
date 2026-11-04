"use client";

import { useActionState, useState } from "react";
import { sendQuote, type ActionState } from "../../actions";

export function QuoteForm({ requestId, clientId, defaultValidUntil }: { requestId: string; clientId: string; defaultValidUntil: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendQuote, {});
  const [rows, setRows] = useState(3);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="client_id" value={clientId} />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px] gap-2">
            <input className="input" name="label" placeholder={i === 0 ? "e.g. MacBook Air 13\" M4, 16 GB / 512 GB" : i === 1 ? "e.g. AppleCare+ 3 years" : "Line item (optional)"} aria-label={`Line ${i + 1} description`} />
            <input className="input" name="amount" type="number" step="1" placeholder="₹ (negative for discount)" aria-label={`Line ${i + 1} amount`} />
          </div>
        ))}
        <button type="button" className="btn btn-sm self-start" onClick={() => setRows((r) => r + 1)}>
          + Add line
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="label">
          Valid until
          <input className="input" name="valid_until" type="date" defaultValue={defaultValidUntil} />
        </label>
      </div>
      <label className="label">
        Note to client
        <textarea className="input min-h-20" name="note" placeholder="Alternatives, lease option, delivery timeline…" />
      </label>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send quote to client"}
        </button>
      </div>
    </form>
  );
}
