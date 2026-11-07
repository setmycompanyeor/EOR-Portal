/**
 * Employer cost and invoice estimation for an Indian EOR hire.
 * Pure functions: shared by the public estimator, the portal, and invoicing.
 *
 * Statutory assumptions (configurable via PricingConfig):
 * - Basic = basic_percent of gross (default 50%).
 * - Employer PF = 12% of basic, basic capped at pf_wage_cap (₹15,000) unless pf_on_full_basic.
 * - Employer ESI = 3.25% of gross when gross <= esi_wage_ceiling (₹21,000).
 * - Gratuity accrual = 4.81% of basic.
 * - Professional tax, employee PF/ESI/TDS are employee-side deductions and are not costs here.
 */

export type PricingConfig = {
  fee_per_employee: number;
  fee_percent: number; // % of gross added on top of flat fee, 0 to disable
  insurance_per_month: number;
  gst_rate: number; // percent
  gst_on_full_invoice: boolean;
  deposit_months: number;
  basic_percent: number;
  pf_wage_cap: number;
  pf_on_full_basic: boolean;
  esi_wage_ceiling: number;
  hra_metro_percent?: number;
  hra_nonmetro_percent?: number;
};

export const DEFAULT_PRICING: PricingConfig = {
  fee_per_employee: 15000,
  fee_percent: 0,
  insurance_per_month: 800,
  gst_rate: 18,
  gst_on_full_invoice: false,
  deposit_months: 2,
  basic_percent: 50,
  pf_wage_cap: 15000,
  pf_on_full_basic: false,
  esi_wage_ceiling: 21000,
  hra_metro_percent: 50,
  hra_nonmetro_percent: 40,
};

export type EstimateInput = {
  monthlyGross: number;
  headcount?: number;
  /** Per-estimate overrides of the config toggles. */
  pfOnFullBasic?: boolean;
  gstOnFullInvoice?: boolean;
};

export type EstimateLine = {
  key: string;
  label: string;
  basis: string;
  amount: number;
};

export type Estimate = {
  perEmployee: {
    gross: number;
    basic: number;
    pf: number;
    esi: number;
    gratuity: number;
    insurance: number;
    employmentCost: number;
    fee: number;
    gst: number;
    monthly: number;
  };
  lines: EstimateLine[];
  headcount: number;
  monthlyTotal: number;
  annualTotal: number;
  depositRequired: number;
  assumptions: {
    pfOnFullBasic: boolean;
    gstOnFullInvoice: boolean;
    basicPercent: number;
    depositMonths: number;
  };
};

const round = (n: number) => Math.round(n);

export function estimate(input: EstimateInput, config: PricingConfig = DEFAULT_PRICING): Estimate {
  const gross = Math.max(0, Number(input.monthlyGross) || 0);
  const headcount = Math.max(1, Math.floor(Number(input.headcount) || 1));
  const pfOnFullBasic = input.pfOnFullBasic ?? config.pf_on_full_basic;
  const gstOnFullInvoice = input.gstOnFullInvoice ?? config.gst_on_full_invoice;

  const basic = gross * (config.basic_percent / 100);
  const pfBase = pfOnFullBasic ? basic : Math.min(basic, config.pf_wage_cap);
  const pf = round(pfBase * 0.12);
  const esi = gross > 0 && gross <= config.esi_wage_ceiling ? round(gross * 0.0325) : 0;
  const gratuity = round(basic * 0.0481);
  const insurance = round(config.insurance_per_month);
  const employmentCost = gross + pf + esi + gratuity + insurance;
  const fee = round(config.fee_per_employee + gross * (config.fee_percent / 100));
  const gstBase = gstOnFullInvoice ? employmentCost + fee : fee;
  const gst = round(gstBase * (config.gst_rate / 100));
  const monthly = employmentCost + fee + gst;

  const lines: EstimateLine[] = [
    { key: "gross", label: "Gross salary (paid to employee)", basis: "As entered", amount: gross },
    {
      key: "pf",
      label: "Employer PF contribution",
      basis: pfOnFullBasic ? "12% of full basic" : `12% of basic, capped at ₹${config.pf_wage_cap.toLocaleString("en-IN")}`,
      amount: pf,
    },
    { key: "esi", label: "Employer ESI", basis: `3.25% when gross ≤ ₹${config.esi_wage_ceiling.toLocaleString("en-IN")}`, amount: esi },
    { key: "gratuity", label: "Gratuity accrual", basis: "4.81% of basic", amount: gratuity },
    { key: "insurance", label: "Group health insurance", basis: "₹5 lakh cover", amount: insurance },
    { key: "employmentCost", label: "Total employment cost", basis: "", amount: employmentCost },
    { key: "fee", label: "Management fee", basis: config.fee_percent > 0 ? `₹${config.fee_per_employee.toLocaleString("en-IN")} + ${config.fee_percent}% of gross` : "Per employee per month", amount: fee },
    { key: "gst", label: `GST ${config.gst_rate}%`, basis: gstOnFullInvoice ? "On the full invoice" : "On the management fee only", amount: gst },
    { key: "monthly", label: "Monthly invoice per employee", basis: "", amount: monthly },
  ];

  return {
    perEmployee: { gross, basic, pf, esi, gratuity, insurance, employmentCost, fee, gst, monthly },
    lines,
    headcount,
    monthlyTotal: monthly * headcount,
    annualTotal: monthly * headcount * 12,
    depositRequired: monthly * headcount * config.deposit_months,
    assumptions: {
      pfOnFullBasic,
      gstOnFullInvoice,
      basicPercent: config.basic_percent,
      depositMonths: config.deposit_months,
    },
  };
}

/** Monthly invoice total for a set of active employees under one config. */
export function monthlyInvoiceFor(grosses: number[], config: PricingConfig = DEFAULT_PRICING) {
  return grosses.reduce((sum, g) => sum + estimate({ monthlyGross: g }, config).perEmployee.monthly, 0);
}
