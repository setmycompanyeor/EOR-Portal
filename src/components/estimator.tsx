"use client";

import { useMemo, useState, useTransition } from "react";
import { estimate, type PricingConfig } from "@/lib/pricing";
import { inr } from "@/lib/format";

type Props = {
  config: PricingConfig;
  /** Server action to persist the estimate; returns a message to show. */
  onSave?: (payload: { monthlyGross: number; headcount: number; pfOnFullBasic: boolean; gstOnFullInvoice: boolean; email?: string }) => Promise<{ message: string }>;
  askEmail?: boolean;
};

const states = ["Karnataka", "Telangana", "Maharashtra", "Delhi", "Tamil Nadu", "Haryana", "Gujarat", "West Bengal", "Other"];

export function Estimator({ config, onSave, askEmail }: Props) {
  const [gross, setGross] = useState(120000);
  const [headcount, setHeadcount] = useState(1);
  const [pfFull, setPfFull] = useState(config.pf_on_full_basic);
  const [gstFull, setGstFull] = useState(config.gst_on_full_invoice);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const result = useMemo(
    () => estimate({ monthlyGross: gross, headcount, pfOnFullBasic: pfFull, gstOnFullInvoice: gstFull }, config),
    [gross, headcount, pfFull, gstFull, config],
  );

  function save() {
    if (!onSave) return;
    start(async () => {
      const r = await onSave({ monthlyGross: gross, headcount, pfOnFullBasic: pfFull, gstOnFullInvoice: gstFull, email: email || undefined });
      setNote(r.message);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <section className="card flex flex-col gap-4 lg:col-span-2">
        <h2 className="text-[15px] font-semibold">Inputs</h2>
        <label className="label">
          Monthly gross salary (₹)
          <input className="input" type="number" min={0} step={1000} value={gross} onChange={(e) => setGross(Number(e.target.value))} />
        </label>
        <label className="label">
          Number of employees at this salary
          <input className="input" type="number" min={1} max={500} value={headcount} onChange={(e) => setHeadcount(Number(e.target.value))} />
        </label>
        <label className="label">
          Work location (state)
          <select className="input" defaultValue="Karnataka">
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-brand" checked={pfFull} onChange={(e) => setPfFull(e.target.checked)} />
          Employer PF on full basic (not capped at ₹{config.pf_wage_cap.toLocaleString("en-IN")})
        </label>
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-brand" checked={gstFull} onChange={(e) => setGstFull(e.target.checked)} />
          Charge GST on the full invoice, not only the fee
        </label>
        <p className="text-[13px] text-ink-muted">
          Basic is taken as {config.basic_percent}% of gross. ESI applies automatically when gross is ₹{config.esi_wage_ceiling.toLocaleString("en-IN")} or less. Rates as published; confirm with your account manager before an offer.
        </p>
        {onSave && (
          <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
            {askEmail && (
              <label className="label">
                Email me this estimate (optional)
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </label>
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save estimate"}
            </button>
            <p aria-live="polite" className="min-h-5 text-[13px] text-green-ink">
              {note}
            </p>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-4 lg:col-span-3">
        <div className="flex flex-col gap-1 rounded-xl bg-navy p-5 text-white">
          <span className="text-[13px] text-navy-text">Estimated monthly invoice for {result.headcount} employee{result.headcount > 1 ? "s" : ""}</span>
          <span className="text-3xl font-semibold tracking-tight">{inr(result.monthlyTotal)}</span>
          <span className="text-[13px] text-navy-text">
            {inr(result.annualTotal)} per year · security deposit {inr(result.depositRequired)} ({result.assumptions.depositMonths} months)
          </span>
        </div>
        <section className="card">
          <h2 className="mb-2 text-[15px] font-semibold">Per-employee breakdown</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {result.lines.map((l) => {
                const strong = l.key === "employmentCost" || l.key === "monthly";
                return (
                  <tr key={l.key} className="border-b border-line-soft last:border-b-0">
                    <td className={`py-2.5 ${strong ? "font-semibold" : ""}`}>
                      {l.label}
                      {l.basis && <span className="ml-2 text-[13px] text-ink-muted">{l.basis}</span>}
                    </td>
                    <td className={`py-2.5 text-right tabular-nums whitespace-nowrap ${strong ? "font-semibold" : ""}`}>{inr(l.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <p className="text-[13px] text-ink-muted">
          Professional tax and the employee&apos;s own PF, ESI and TDS are deducted from salary and do not add to your cost. Bonus, leave encashment and gratuity payouts are billed when they fall due.
        </p>
      </div>
    </div>
  );
}
