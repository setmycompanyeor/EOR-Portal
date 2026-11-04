export function inr(amount: number | string | null | undefined, opts: { compact?: boolean } = {}) {
  const n = Number(amount ?? 0);
  if (opts.compact && Math.abs(n) >= 100000) {
    return `₹${(n / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
  }
  const abs = Math.abs(Math.round(n)).toLocaleString("en-IN");
  return n < 0 ? `-₹${abs}` : `₹${abs}`;
}

/** Parses a date; a bare YYYY-MM-DD is treated as a local calendar date, not UTC midnight. */
export function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** YYYY-MM-DD for <input type="date"> in local time. */
export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatMonth(value: string | null | undefined) {
  if (!value) return "—";
  return parseDate(value).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function formatDate(value: string | Date | null | undefined, opts: { withTime?: boolean } = {}) {
  if (!value) return "—";
  const d = parseDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (!opts.withTime) return date;
  return `${date}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function relativeDue(due: string | null | undefined, today = new Date()) {
  if (!due) return { label: "No due date", tone: "gray" as const };
  const d = parseDate(due);
  const days = Math.round((d.getTime() - new Date(today.toDateString()).getTime()) / 86400000);
  if (days < 0) return { label: days === -1 ? "Yesterday" : `${-days} days overdue`, tone: "red" as const };
  if (days === 0) return { label: "Today", tone: "amber" as const };
  if (days === 1) return { label: "Tomorrow", tone: "amber" as const };
  if (days <= 7) return { label: `In ${days} days`, tone: "amber" as const };
  return { label: formatDate(due), tone: "gray" as const };
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const documentKindLabels: Record<string, string> = {
  incorporation: "Certificate of incorporation",
  board_resolution: "Board resolution",
  signatory_id: "Authorised signatory ID",
  tax_residency: "Tax residency certificate",
  msa: "Master Services Agreement",
  dpa: "Data Processing Agreement",
  kyc_other: "KYC document",
  employee_id: "ID proof",
  employee_pan: "PAN card",
  employee_bank: "Bank proof",
  employee_uan: "UAN / previous PF",
  employee_education: "Education certificate",
  employee_payslip: "Previous payslip",
  offer_letter: "Offer letter",
  employment_contract: "Employment contract",
  other: "Other",
};

export function documentKindLabel(kind: string) {
  return documentKindLabels[kind] ?? titleCase(kind);
}
