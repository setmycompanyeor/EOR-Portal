"use client";

import { useActionState } from "react";
import { inviteUser, updateClientProfile, type ActionState } from "@/app/app/actions";

export function ClientProfileForm({ client, readOnly }: { client: { legal_name: string; billing_address: string; finance_email: string }; readOnly: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateClientProfile, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label">
        Legal entity name (as on invoices)
        <input className="input" name="legal_name" defaultValue={client.legal_name} readOnly={readOnly} />
      </label>
      <label className="label">
        Billing address
        <textarea className="input min-h-20" name="billing_address" defaultValue={client.billing_address} readOnly={readOnly} />
      </label>
      <label className="label">
        Finance contact email
        <input className="input" name="finance_email" type="email" defaultValue={client.finance_email} readOnly={readOnly} />
      </label>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      {!readOnly && (
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </form>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteUser, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="label">
          Name
          <input className="input" name="full_name" required />
        </label>
        <label className="label">
          Work email
          <input className="input" name="email" type="email" required />
        </label>
      </div>
      <label className="label">
        Role
        <select className="input" name="role" defaultValue="client_viewer">
          <option value="client_viewer">Viewer: can see everything</option>
          <option value="client_approver">Approver: can also request hires and approve quotes</option>
          <option value="client_admin">Admin: can also invite users and edit billing details</option>
        </select>
      </label>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </button>
      </div>
    </form>
  );
}
