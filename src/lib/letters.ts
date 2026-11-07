import "server-only";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import InspectModule from "docxtemplater/js/inspect-module.js";
import { formatDate } from "@/lib/format";
import { salaryBreakdown, salaryPlaceholders, type SalaryBreakdown, type SalaryConfig } from "@/lib/salary";
import type { Client, Employee } from "@/lib/types";

const DELIMITERS = { start: "{{", end: "}}" };

/** Placeholder names the app fills itself (still editable in the form, except salary ones). */
export const AUTO_PLACEHOLDERS: Record<string, string> = {
  employee_name: "Employee's full name",
  designation: "Job title",
  client_name: "Client company name",
  client_legal_name: "Client legal entity",
  work_location: "City, state",
  start_date: "Start date",
  probation_months: "Probation (months)",
  employment_type: "Permanent / fixed-term",
  offer_date: "Date of the letter (today)",
  gross_monthly: "Gross per month",
  gross_annual: "Gross per year",
};
export const SALARY_PLACEHOLDER_PATTERN = /^(basic|hra|flexible_benefits|gross|employer_pf|ctc|[a-z_]+)_(monthly|annual)$|^(ctc|gross)_annual_words$|^salary$/;

/** Reads every {{placeholder}} in a .docx, including loop names. */
export function extractPlaceholders(buffer: Buffer): string[] {
  const zip = new PizZip(buffer);
  const inspect = new InspectModule();
  new Docxtemplater(zip, { modules: [inspect], delimiters: DELIMITERS, paragraphLoop: true, linebreaks: true });
  const tags = inspect.getAllTags() as Record<string, unknown>;
  const out = new Set<string>();
  const walk = (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) {
      out.add(k);
      if (v && typeof v === "object") walk(v as Record<string, unknown>);
    }
  };
  walk(tags);
  // Loop children (component / monthly / annual) are internal to the salary loop.
  for (const k of ["component", "monthly", "annual"]) out.delete(k);
  return Array.from(out).sort();
}

/** Fills a .docx template. Unknown placeholders render empty rather than "undefined". */
export function renderDocx(buffer: Buffer, data: Record<string, unknown>): Buffer {
  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, { delimiters: DELIMITERS, paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

/** Values the app can pre-fill from the hire record. */
export function autoValues(employee: Employee, client: Client | null): Record<string, string> {
  return {
    employee_name: employee.full_name,
    designation: employee.job_title,
    client_name: client?.name ?? "",
    client_legal_name: client?.legal_name ?? client?.name ?? "",
    work_location: [employee.location_city, employee.location_state].filter(Boolean).join(", "),
    start_date: formatDate(employee.start_date),
    probation_months: String(employee.probation_months),
    employment_type: employee.employment_type === "permanent" ? "Permanent" : "Fixed-term",
    offer_date: formatDate(new Date()),
    gross_monthly: Math.round(Number(employee.monthly_gross)).toLocaleString("en-IN"),
    gross_annual: (Math.round(Number(employee.monthly_gross)) * 12).toLocaleString("en-IN"),
  };
}

export function salaryFor(employee: Employee, config: SalaryConfig): SalaryBreakdown {
  return salaryBreakdown(Number(employee.monthly_gross), config, {
    city: employee.location_city,
    state: employee.location_state,
    overrides: (employee as Employee & { salary_overrides?: Record<string, number> | null }).salary_overrides ?? null,
  });
}

/** Merges auto values, the form's values and the salary placeholders into one render payload. */
export function renderData(employee: Employee, client: Client | null, values: Record<string, string>, salary: SalaryBreakdown): Record<string, unknown> {
  return { ...autoValues(employee, client), ...values, ...salaryPlaceholders(salary) };
}

/** Placeholders the form should ask for: everything in the template that salary doesn't compute. */
export function formFields(placeholders: string[]) {
  return placeholders.filter((p) => !SALARY_PLACEHOLDER_PATTERN.test(p) || p in AUTO_PLACEHOLDERS);
}
