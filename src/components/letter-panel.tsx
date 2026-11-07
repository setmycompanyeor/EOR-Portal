"use client";

import { useActionState, useState, useTransition } from "react";
import { generateLetter, issueLetter, saveLetterValues, type ActionState } from "@/app/letters/actions";
import type { SalaryRow } from "@/lib/salary";

export type TemplateOption = { id: string; name: string; placeholders: string[]; scope: "client" | "global" };

export function LetterPanel({
  employeeId,
  kind,
  templates,
  letter,
  autoValues,
  autoLabels,
  salaryRows,
  mode,
  downloadHref,
}: {
  employeeId: string;
  kind: "offer_letter" | "employment_contract" | "relieving_letter" | "other";
  templates: TemplateOption[];
  letter: { id: string; template_id: string; values: Record<string, string>; status: "draft" | "generated" | "issued"; updated_at: string } | null;
  autoValues: Record<string, string>;
  autoLabels: Record<string, string>;
  salaryRows: SalaryRow[];
  mode: "client" | "ops";
  downloadHref?: string;
}) {
  const [templateId, setTemplateId] = useState(letter?.template_id ?? templates[0]?.id ?? "");
  const template = templates.find((t) => t.id === templateId);
  const [state, action, pending] = useActionState<ActionState, FormData>(saveLetterValues, {});
  const [opsMsg, setOpsMsg] = useState<ActionState>({});
  const [busy, start] = useTransition();
  const issued = letter?.status === "issued";
  const salaryKeys = /^(basic|hra|flexible_benefits|gross|employer_pf|ctc|[a-z_]+)_(monthly|annual)$|_annual_words$|^salary$/;
  const fields = (template?.placeholders ?? []).filter((p) => !salaryKeys.test(p) || p in autoLabels);

  if (templates.length === 0) {
    return <p className="text-sm text-ink-muted">No offer letter template is set up yet{mode === "ops" ? ": add one under Templates." : ". SetMyCompany will add one."}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="employee_id" value={employeeId} />
        <input type="hidden" name="kind" value={kind} />
        <label className="label">
          Template
          <select className="input" name="template_id" value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={issued}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.scope === "client" ? "(this client)" : "(standard)"}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((p) => (
            <label key={p} className="label">
              {autoLabels[p] ?? p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              <input className="input" name={`v:${p}`} defaultValue={letter?.values?.[p] ?? autoValues[p] ?? ""} readOnly={issued} />
              {p in autoValues && <span className="text-[12px] font-normal text-ink-muted">Pre-filled from the hire record</span>}
            </label>
          ))}
        </div>
        <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
          {state.error ?? state.message}
        </p>
        {!issued && (
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : mode === "client" ? "Save details for SetMyCompany" : "Save details"}
            </button>
          </div>
        )}
      </form>

      <div>
        <h3 className="mb-1 text-[13px] font-semibold">Salary structure (computed, goes into the letter)</h3>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="th">Component</th>
              <th className="th text-right">Monthly</th>
              <th className="th text-right">Annual</th>
            </tr>
          </thead>
          <tbody>
            {salaryRows.map((r) => (
              <tr key={r.key} className={r.key === "gross" || r.key === "ctc" ? "font-semibold" : ""}>
                <td className="td">
                  {r.label}
                  {r.overridden && <span className="ml-2 text-[12px] font-normal text-amber-ink">overridden</span>}
                </td>
                <td className="td text-right tabular-nums">₹{r.monthly.toLocaleString("en-IN")}</td>
                <td className="td text-right tabular-nums">₹{r.annual.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === "ops" && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft pt-3">
          <span aria-live="polite" className={`mr-auto text-[13px] ${opsMsg.error ? "text-red-ink" : "text-green-ink"}`}>
            {opsMsg.error ?? opsMsg.message}
          </span>
          {letter && !issued && (
            <button type="button" className="btn" disabled={busy} onClick={() => start(async () => setOpsMsg(await generateLetter(employeeId, kind)))}>
              {busy ? "…" : letter.status === "generated" ? "Regenerate" : "Generate letter"}
            </button>
          )}
          {letter?.status !== "draft" && downloadHref && (
            <a href={downloadHref} className="btn">
              Download .docx
            </a>
          )}
          {letter?.status === "generated" && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => start(async () => setOpsMsg(await issueLetter(employeeId, kind)))}>
              Issue to client
            </button>
          )}
          {issued && <span className="text-[13px] text-green-ink">Issued</span>}
        </div>
      )}
      {mode === "client" && letter && (
        <p className="text-[13px] text-ink-muted">
          {issued ? "Issued. The letter is in the documents list above." : letter.status === "generated" ? "SetMyCompany has generated the letter and is reviewing it." : "Details saved; SetMyCompany will generate and issue the letter."}
        </p>
      )}
    </div>
  );
}
