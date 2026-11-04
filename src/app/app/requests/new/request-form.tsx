"use client";

import { useActionState } from "react";
import { raiseRequest, type ActionState } from "@/app/app/actions";

export function RequestForm({ employees, category, title }: { employees: { id: string; name: string }[]; category?: string; title?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(raiseRequest, {});
  return (
    <form action={action} className="card flex max-w-2xl flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="label">
          Category
          <select className="input" name="category" defaultValue={category ?? "equipment"}>
            <option value="equipment">Equipment</option>
            <option value="benefit">Benefit</option>
            <option value="learning">Learning</option>
            <option value="salary_revision">Salary revision</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="label">
          For
          <select className="input" name="employee_id" defaultValue="">
            <option value="">All employees / not specific</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="label">
        Title
        <input className="input" name="title" defaultValue={title ?? ""} placeholder="e.g. Laptop for new joiner" required />
      </label>
      <label className="label">
        Details
        <textarea className="input min-h-28" name="description" placeholder="What is needed, by when, any preferences (model, budget, cover amount)…" />
      </label>
      <p aria-live="polite" className="min-h-5 text-[13px] text-red-ink">
        {state.error}
      </p>
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Raise request"}
        </button>
      </div>
    </form>
  );
}
