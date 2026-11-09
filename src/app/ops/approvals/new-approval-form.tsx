"use client";

import { useActionState, useState } from "react";
import { useCloseOnSuccess } from "@/components/slide-over";
import { createApproval, type ActionState } from "../actions";

export function NewApprovalForm({ employees }: { employees: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createApproval, {});
  useCloseOnSuccess(state);
  const [kind, setKind] = useState<"leave" | "reimbursement">("reimbursement");
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label">
        Employee
        <select className="input" name="employee_id" required defaultValue="">
          <option value="" disabled>
            Pick an employee
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Type
        <select className="input" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "leave" | "reimbursement")}>
          <option value="reimbursement">Reimbursement</option>
          <option value="leave">Leave</option>
        </select>
      </label>
      <label className="label">
        Title
        <input className="input" name="title" placeholder={kind === "leave" ? "e.g. Casual leave, 2 days" : "e.g. Client visit travel, Oct"} required />
      </label>
      {kind === "reimbursement" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Amount (₹)
            <input className="input" name="amount" type="number" min={1} step={1} required />
          </label>
          <label className="label">
            Category
            <select className="input" name="category" defaultValue="Travel">
              {["Travel", "Meals", "Internet & phone", "Equipment", "Training", "Other"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            From
            <input className="input" name="from_date" type="date" required />
          </label>
          <label className="label">
            To
            <input className="input" name="to_date" type="date" required />
          </label>
          <label className="label col-span-2">
            Leave type
            <select className="input" name="leave_type" defaultValue="Casual leave">
              {["Casual leave", "Sick leave", "Earned leave", "Loss of pay", "Other"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="label">
        Keka reference (optional)
        <input className="input" name="keka_reference" placeholder="Request or claim id in Keka" />
      </label>
      <label className="label">
        Details for the client
        <textarea className="input min-h-20" name="detail" placeholder="Reason given by the employee, receipt summary…" />
      </label>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send to client for approval"}
      </button>
    </form>
  );
}
