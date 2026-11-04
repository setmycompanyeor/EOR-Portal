import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { Estimator } from "@/components/estimator";
import { requireClient } from "@/lib/auth";
import { getPricing } from "@/lib/data/portal";
import { saveEstimate } from "@/app/estimate/actions";

export const metadata = { title: "Invoice estimator" };

export default function EstimatorPage() {
  return (
    <>
      <PageHeader title="Invoice estimator" subtitle="See the full monthly cost of a hire before you make an offer. Live, non-binding, using your contracted rates." />
      <Suspense fallback={<div className="card h-96 animate-pulse" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { clientId } = await requireClient();
  const config = await getPricing(clientId);
  return <Estimator config={config} onSave={saveEstimate} />;
}
