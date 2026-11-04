"use client";

import { useActionState, useState } from "react";
import { decideApproval, type ActionState } from "@/app/app/actions";

export function DecideApproval({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideApproval, {});
  const [note, setNote] = useState(false);
  if (state.message) return <span className="text-[13px] text-green-ink">{state.message}</span>;
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-center gap-2">
        <button type="button" className="text-[13px] text-ink-muted" onClick={() => setNote((n) => !n)}>
          {note ? "Hide note" : "Add note"}
        </button>
        <button type="submit" name="decision" value="rejected" className="btn btn-sm btn-danger" disabled={pending}>
          Reject
        </button>
        <button type="submit" name="decision" value="approved" className="btn btn-sm btn-primary" disabled={pending}>
          {pending ? "…" : "Approve"}
        </button>
      </div>
      {note && <input className="input w-72" name="note" placeholder="Note for the employee or SetMyCompany" />}
      {state.error && <span className="text-[13px] text-red-ink">{state.error}</span>}
    </form>
  );
}
