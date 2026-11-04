import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { toDateInput } from "@/lib/format";
import { HireForm } from "./hire-form";

export const metadata = { title: "New hire request" };

export default function NewHirePage() {
  return (
    <>
      <PageHeader title="New hire request" subtitle="We respond with a cost estimate within one business day. Nothing is binding until you approve the estimate." />
      <Suspense fallback={<Skeleton rows={1} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireClient(); // reads the session, which also makes this request-time (safe to use the clock)
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return <HireForm defaultStart={toDateInput(d)} />;
}
