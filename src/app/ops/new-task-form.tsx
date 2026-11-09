"use client";

import { useActionState } from "react";
import { SlideOver, useCloseOnSuccess } from "@/components/slide-over";
import { createTask, type ActionState } from "./actions";

type ClientOption = { id: string; name: string };

/** The "+ Task" button on the work queue; the form opens in a side panel. */
export function NewTaskForm({ clients }: { clients: ClientOption[] }) {
  return (
    <SlideOver label="+ Task" title="New task" description="Adds an item to the ops work queue.">
      <TaskFields clients={clients} />
    </SlideOver>
  );
}

function TaskFields({ clients }: { clients: ClientOption[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTask, {});
  useCloseOnSuccess(state);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label">
        What needs doing
        <input className="input" name="title" required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">
          Type
          <select className="input" name="type" defaultValue="other">
            {["onboarding", "quote", "shipment", "deposit", "invoice", "compliance", "payroll", "offboarding", "other"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Client
          <select className="input" name="client_id" defaultValue="">
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="label">
        Due date (optional)
        <input className="input" name="due_date" type="date" />
      </label>
      <label className="label">
        Detail (optional)
        <textarea className="input min-h-20" name="detail" />
      </label>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add task"}
      </button>
    </form>
  );
}
