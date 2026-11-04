"use client";

import { useActionState, useState } from "react";
import { createTask, type ActionState } from "./actions";

export function NewTaskForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(createTask, {});
  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        + Add task
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-2 rounded-lg border border-line bg-surface p-3 md:w-[420px]">
      <input className="input" name="title" placeholder="What needs doing" required />
      <div className="grid grid-cols-2 gap-2">
        <select className="input" name="type" defaultValue="other">
          {["onboarding", "quote", "shipment", "deposit", "invoice", "compliance", "payroll", "offboarding", "other"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="input" name="client_id" defaultValue="">
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input className="input" name="due_date" type="date" />
        <input className="input" name="detail" placeholder="Detail (optional)" />
      </div>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}
