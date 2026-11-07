/**
 * Salary structure for offer letters and CTC.
 *
 * Default (SetMyCompany): Basic 50% of gross; HRA 50% of basic in the four
 * income-tax metros (Delhi, Mumbai, Kolkata, Chennai) else 40%; Flexible
 * benefits = the balance of gross; Employer PF on top. CTC = gross + employer PF.
 * Rows can be overridden per employee (fixed monthly amounts); the balance row
 * absorbs the difference so gross is unchanged.
 */
import type { PricingConfig } from "@/lib/pricing";

export type SalaryConfig = PricingConfig & { hra_metro_percent?: number; hra_nonmetro_percent?: number };

export type SalaryRow = { key: string; label: string; monthly: number; annual: number; overridden?: boolean; employer?: boolean };
export type SalaryBreakdown = {
  rows: SalaryRow[];
  grossMonthly: number;
  grossAnnual: number;
  employerPfMonthly: number;
  ctcMonthly: number;
  ctcAnnual: number;
  metro: boolean;
};

const METROS = ["delhi", "new delhi", "mumbai", "kolkata", "chennai"];

export function isMetro(city?: string | null, state?: string | null) {
  const c = (city ?? "").trim().toLowerCase();
  const s = (state ?? "").trim().toLowerCase();
  return METROS.includes(c) || s === "delhi";
}

const r = (n: number) => Math.round(n);

export function salaryBreakdown(
  grossMonthly: number,
  config: SalaryConfig,
  opts: { city?: string | null; state?: string | null; pfOnFullBasic?: boolean; overrides?: Record<string, number> | null } = {},
): SalaryBreakdown {
  const gross = Math.max(0, r(grossMonthly));
  const metro = isMetro(opts.city, opts.state);
  const ov = opts.overrides ?? {};

  const basic = ov.basic ?? r(gross * (config.basic_percent / 100));
  const hraPct = metro ? (config.hra_metro_percent ?? 50) : (config.hra_nonmetro_percent ?? 40);
  const hra = ov.hra ?? r(basic * (hraPct / 100));
  const extraKeys = Object.keys(ov).filter((k) => !["basic", "hra", "flexible_benefits"].includes(k));
  const extras = extraKeys.map((k) => ({ key: k, label: labelFor(k), monthly: r(ov[k]), annual: r(ov[k]) * 12, overridden: true }));
  const extrasTotal = extras.reduce((s, e) => s + e.monthly, 0);
  const flexible = Math.max(0, gross - basic - hra - extrasTotal);

  const pfBase = opts.pfOnFullBasic ?? config.pf_on_full_basic ? basic : Math.min(basic, config.pf_wage_cap);
  const employerPf = r(pfBase * 0.12);

  const rows: SalaryRow[] = [
    { key: "basic", label: "Basic", monthly: basic, annual: basic * 12, overridden: "basic" in ov },
    { key: "hra", label: "House rent allowance", monthly: hra, annual: hra * 12, overridden: "hra" in ov },
    ...extras,
    { key: "flexible_benefits", label: "Flexible benefits", monthly: flexible, annual: flexible * 12 },
    { key: "gross", label: "Gross salary", monthly: gross, annual: gross * 12 },
    { key: "employer_pf", label: "Employer provident fund", monthly: employerPf, annual: employerPf * 12, employer: true },
    { key: "ctc", label: "Cost to company (CTC)", monthly: gross + employerPf, annual: (gross + employerPf) * 12 },
  ];
  return { rows, grossMonthly: gross, grossAnnual: gross * 12, employerPfMonthly: employerPf, ctcMonthly: gross + employerPf, ctcAnnual: (gross + employerPf) * 12, metro };
}

function labelFor(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Indian-style number formatting without the currency sign: 1440000 -> 14,40,000 */
export function inrPlain(n: number) {
  return Math.round(n).toLocaleString("en-IN");
}

/** "Rupees Fourteen Lakh Forty Thousand only" */
export function amountInWords(n: number) {
  const num = Math.round(Math.abs(n));
  if (num === 0) return "Rupees Zero only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? " " + ones[x % 10] : ""}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? " " + two(x % 100) : ""}` : two(x));
  const parts: string[] = [];
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return `Rupees ${parts.join(" ")} only`;
}

/** Flattens a breakdown into template placeholders: basic_monthly, basic_annual, ..., ctc_annual_words, and a `salary` loop. */
export function salaryPlaceholders(b: SalaryBreakdown) {
  const out: Record<string, string | { component: string; monthly: string; annual: string }[]> = {};
  for (const row of b.rows) {
    out[`${row.key}_monthly`] = inrPlain(row.monthly);
    out[`${row.key}_annual`] = inrPlain(row.annual);
  }
  out.ctc_annual_words = amountInWords(b.ctcAnnual);
  out.gross_annual_words = amountInWords(b.grossAnnual);
  out.salary = b.rows.map((row) => ({ component: row.label, monthly: inrPlain(row.monthly), annual: inrPlain(row.annual) }));
  return out;
}
