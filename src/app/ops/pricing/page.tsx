import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { requireOps } from "@/lib/auth";
import { getGlobalPricingRow } from "@/lib/data/ops";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { PricingForm } from "./pricing-form";

export const metadata = { title: "Pricing & rates" };

export default function PricingPage() {
  return (
    <>
      <PageHeader title="Pricing & rates" subtitle="Defaults used by the public estimator, hire estimates, monthly invoices and deposit requirements. Per-client overrides can be added in the database." />
      <Suspense fallback={<Skeleton rows={1} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { profile } = await requireOps();
  const row = await getGlobalPricingRow();
  const values = {
    fee_per_employee: Number(row?.fee_per_employee ?? DEFAULT_PRICING.fee_per_employee),
    fee_percent: Number(row?.fee_percent ?? DEFAULT_PRICING.fee_percent),
    insurance_per_month: Number(row?.insurance_per_month ?? DEFAULT_PRICING.insurance_per_month),
    gst_rate: Number(row?.gst_rate ?? DEFAULT_PRICING.gst_rate),
    deposit_months: Number(row?.deposit_months ?? DEFAULT_PRICING.deposit_months),
    basic_percent: Number(row?.basic_percent ?? DEFAULT_PRICING.basic_percent),
    pf_wage_cap: Number(row?.pf_wage_cap ?? DEFAULT_PRICING.pf_wage_cap),
    esi_wage_ceiling: Number(row?.esi_wage_ceiling ?? DEFAULT_PRICING.esi_wage_ceiling),
    gst_on_full_invoice: Boolean(row?.gst_on_full_invoice ?? DEFAULT_PRICING.gst_on_full_invoice),
    pf_on_full_basic: Boolean(row?.pf_on_full_basic ?? DEFAULT_PRICING.pf_on_full_basic),
  };
  return (
    <Card className="max-w-3xl">
      <PricingForm values={values} readOnly={profile.role !== "ops_admin"} />
    </Card>
  );
}
