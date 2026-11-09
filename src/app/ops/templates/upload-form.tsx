"use client";

import { useActionState } from "react";
import { useCloseOnSuccess } from "@/components/slide-over";
import { uploadTemplate, type ActionState } from "@/app/letters/actions";

export function UploadTemplateForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadTemplate, {});
  useCloseOnSuccess(state);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label">
        Name
        <input className="input" name="name" placeholder="e.g. Standard offer letter 2026" required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">
          Type
          <select className="input" name="kind" defaultValue="offer_letter">
            <option value="offer_letter">Offer letter</option>
            <option value="employment_contract">Employment contract</option>
            <option value="relieving_letter">Relieving letter</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="label">
          Scope
          <select className="input" name="client_id" defaultValue="">
            <option value="">Standard (all clients)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="label">
        Word file (.docx)
        <input className="input py-1.5" name="file" type="file" accept=".docx" required />
      </label>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Reading placeholders…" : "Upload template"}
      </button>
    </form>
  );
}
