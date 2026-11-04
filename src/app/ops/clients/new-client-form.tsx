"use client";

import { useActionState } from "react";
import { createClientAccount, type ActionState } from "../actions";

export function NewClientForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createClientAccount, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label">
        Company name
        <input className="input" name="name" required />
      </label>
      <label className="label">
        Legal entity name (optional)
        <input className="input" name="legal_name" />
      </label>
      <label className="label">
        Country
        <input className="input" name="country" defaultValue="USA" required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">
          Admin name
          <input className="input" name="admin_name" required />
        </label>
        <label className="label">
          Admin email
          <input className="input" name="admin_email" type="email" required />
        </label>
      </div>
      <label className="label">
        Finance email (optional)
        <input className="input" name="finance_email" type="email" />
      </label>
      <p className="text-[13px] text-ink-muted">The admin gets an invitation email to set a password and start KYC.</p>
      <p aria-live="polite" className="min-h-5 text-[13px] text-red-ink">
        {state.error}
      </p>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create client and invite admin"}
      </button>
    </form>
  );
}
