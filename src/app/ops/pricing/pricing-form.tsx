"use client";

import { useActionState } from "react";
import type { ActionState } from "../actions";

export type PricingValues = {
  fee_per_employee: number;
  fee_percent: number;
  insurance_per_month: number;
  gst_rate: number;
  deposit_months: number;
  basic_percent: number;
  pf_wage_cap: number;
  esi_wage_ceiling: number;
  gst_on_full_invoice: boolean;
  pf_on_full_basic: boolean;
};

const fields: { name: keyof PricingValues; label: string; hint: string; step?: string }[] = [
  { name: "fee_per_employee", label: "Management fee per employee per month (₹)", hint: "Flat fee billed for every active employee" },
  { name: "fee_percent", label: "Plus % of gross", hint: "0 for a pure flat fee", step: "0.1" },
  { name: "insurance_per_month", label: "Group health insurance per employee per month (₹)", hint: "Your cost for the base cover" },
  { name: "gst_rate", label: "GST rate (%)", hint: "18 for most services", step: "0.1" },
  { name: "deposit_months", label: "Security deposit (months of invoice)", hint: "Typical: 2" },
  { name: "basic_percent", label: "Basic as % of gross", hint: "Most structures use 50", step: "0.1" },
  { name: "pf_wage_cap", label: "PF wage ceiling (₹)", hint: "Statutory ceiling for employer PF" },
  { name: "esi_wage_ceiling", label: "ESI wage ceiling (₹)", hint: "ESI applies at or below this gross" },
];

export function PricingForm({
  values,
  readOnly,
  action,
  clientId,
  submitLabel = "Save pricing",
  compact,
}: {
  values: PricingValues;
  readOnly: boolean;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  clientId?: string;
  submitLabel?: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const shown = compact ? fields.slice(0, 5) : fields;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      {compact && (
        <>
          {fields.slice(5).map((f) => (
            <input key={f.name} type="hidden" name={f.name} value={String(values[f.name])} />
          ))}
        </>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((f) => (
          <label key={f.name} className="label">
            {f.label}
            <input className="input" name={f.name} type="number" step={f.step ?? "1"} defaultValue={String(values[f.name])} readOnly={readOnly} />
            {!compact && <span className="text-[12px] font-normal text-ink-muted">{f.hint}</span>}
          </label>
        ))}
      </div>
      <label className="flex min-h-11 items-center gap-2.5 text-sm">
        <input type="checkbox" name="gst_on_full_invoice" className="h-5 w-5 accent-brand" defaultChecked={values.gst_on_full_invoice} disabled={readOnly} />
        Charge GST on the full invoice (manpower supply model) rather than on the fee only
      </label>
      <label className="flex min-h-11 items-center gap-2.5 text-sm">
        <input type="checkbox" name="pf_on_full_basic" className="h-5 w-5 accent-brand" defaultChecked={values.pf_on_full_basic} disabled={readOnly} />
        Employer PF on full basic by default (not capped at the wage ceiling)
      </label>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      {!readOnly && (
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}
