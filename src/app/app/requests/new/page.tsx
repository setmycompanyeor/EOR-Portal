import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { getEmployees } from "@/lib/data/portal";
import { RequestForm } from "./request-form";

export const metadata = { title: "New request" };

export default function NewRequestPage({ searchParams }: PageProps<"/app/requests/new">) {
  return (
    <>
      <PageHeader title="New request" subtitle="We reply with a quote, usually within two business days. You approve before anything is ordered." />
      <Suspense fallback={<Skeleton rows={1} />}>
        {searchParams.then((sp) => (
          <Content category={typeof sp.category === "string" ? sp.category : undefined} title={typeof sp.title === "string" ? sp.title : undefined} />
        ))}
      </Suspense>
    </>
  );
}

async function Content({ category, title }: { category?: string; title?: string }) {
  const { clientId } = await requireClient();
  const employees = await getEmployees(clientId);
  return <RequestForm employees={employees.map((e) => ({ id: e.id, name: e.full_name }))} category={category} title={title} />;
}
