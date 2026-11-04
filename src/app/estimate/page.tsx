import { Suspense } from "react";
import Link from "next/link";
import { Estimator } from "@/components/estimator";
import { getPricing } from "@/lib/data/portal";
import { saveEstimate } from "./actions";

export const metadata = { title: "Cost to hire in India" };

export default function EstimatePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Link href="/" className="flex items-center gap-2.5 text-ink">
          <span aria-hidden="true" className="inline-block h-[30px] w-[30px] rounded-lg bg-brand" />
          <span className="text-[15px] font-semibold">EOR Hub</span>
        </Link>
        <Link href="/login" className="btn btn-sm">
          Client sign in
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pb-16 md:px-12">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">What does it cost to hire in India?</h1>
          <p className="text-ink-muted">Enter a monthly gross salary and see the full employer cost, our fee and GST. Non-binding and instant.</p>
        </div>
        <Suspense fallback={<div className="card h-96 animate-pulse" />}>
          <PublicEstimator />
        </Suspense>
      </div>
    </div>
  );
}

async function PublicEstimator() {
  const config = await getPricing(null);
  return <Estimator config={config} onSave={saveEstimate} askEmail />;
}
