"use client";

import { useActionState } from "react";
import { requestHire, type ActionState } from "@/app/app/actions";

const states = ["Karnataka", "Telangana", "Maharashtra", "Delhi", "Tamil Nadu", "Haryana", "Gujarat", "West Bengal", "Kerala", "Uttar Pradesh", "Other"];

export function HireForm({ defaultStart }: { defaultStart: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestHire, {});

  return (
    <form action={action} className="card flex max-w-3xl flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="label">
          Full name
          <input className="input" name="full_name" placeholder="As on PAN card" required />
        </label>
        <label className="label">
          Work email (optional)
          <input className="input" name="email" type="email" placeholder="name@yourcompany.com" />
        </label>
        <label className="label">
          Job title
          <input className="input" name="job_title" placeholder="e.g. Frontend Engineer" required />
        </label>
        <label className="label">
          Monthly gross salary (₹)
          <input className="input" name="monthly_gross" type="number" min={10000} step={1000} placeholder="120000" required />
        </label>
        <label className="label">
          City
          <input className="input" name="location_city" placeholder="Bengaluru" required />
        </label>
        <label className="label">
          State
          <select className="input" name="location_state" defaultValue="Karnataka">
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Proposed start date
          <input className="input" name="start_date" type="date" defaultValue={defaultStart} required />
        </label>
        <label className="label">
          Employment type
          <select className="input" name="employment_type" defaultValue="permanent">
            <option value="permanent">Full-time, permanent</option>
            <option value="fixed_term">Fixed-term contract</option>
          </select>
        </label>
        <label className="label">
          Probation
          <select className="input" name="probation_months" defaultValue="3">
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="0">None</option>
          </select>
        </label>
      </div>
      <p aria-live="polite" className="min-h-5 text-[13px] text-red-ink">
        {state.error}
      </p>
      <div className="flex justify-end gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
