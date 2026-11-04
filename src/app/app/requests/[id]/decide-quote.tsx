"use client";

import { useActionState } from "react";
import { decideQuote, type ActionState } from "@/app/app/actions";

export function DecideQuote({ quoteId, requestId, total }: { quoteId: string; requestId: string; total: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideQuote, {});
  if (state.message) {
    return <p className="mt-3 rounded-lg bg-green-soft px-3.5 py-3 text-[13px] text-green-ink">{state.message}</p>;
  }
  return (
    <form action={action} className="mt-4 flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="request_id" value={requestId} />
      <p aria-live="polite" className="mr-auto text-[13px] text-red-ink">
        {state.error}
      </p>
      <button type="submit" name="decision" value="rejected" className="btn btn-danger" disabled={pending}>
        Reject quote
      </button>
      <button type="submit" name="decision" value="approved" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : `Approve ${total}`}
      </button>
    </form>
  );
}
