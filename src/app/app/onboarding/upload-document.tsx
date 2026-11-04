"use client";

import { useActionState, useState } from "react";
import { uploadDocument, type ActionState } from "@/app/app/actions";

const kinds: { value: string; label: string }[] = [
  { value: "incorporation", label: "Certificate of incorporation" },
  { value: "board_resolution", label: "Board resolution" },
  { value: "signatory_id", label: "Authorised signatory ID" },
  { value: "tax_residency", label: "Tax residency certificate / W-9" },
  { value: "kyc_other", label: "Other KYC document" },
];

export function UploadDocument({ employeeId, employeeKinds }: { employeeId?: string; employeeKinds?: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadDocument, {});
  const options = employeeKinds ?? kinds;

  if (!open) {
    return (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Upload document
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-2 rounded-lg bg-canvas p-3 sm:w-auto sm:min-w-[320px]">
      {employeeId && <input type="hidden" name="employee_id" value={employeeId} />}
      <label className="label">
        Document type
        <select name="kind" className="input" required defaultValue={options[0]?.value}>
          {options.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        File (PDF, image; up to 20 MB)
        <input name="file" type="file" className="input py-1.5" accept=".pdf,.png,.jpg,.jpeg" required />
      </label>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}
