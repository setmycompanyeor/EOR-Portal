import { Suspense } from "react";
import Link from "next/link";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireClient } from "@/lib/auth";
import { getRequests } from "@/lib/data/portal";
import { formatDate, inr, titleCase } from "@/lib/format";

export const metadata = { title: "Requests" };

const categories = [
  { value: "equipment", label: "Laptop or equipment" },
  { value: "benefit", label: "Health insurance add-on" },
  { value: "benefit", label: "Meal or wellness benefit" },
  { value: "learning", label: "Learning budget" },
  { value: "salary_revision", label: "Salary revision" },
  { value: "other", label: "Something else" },
];

export default function RequestsPage() {
  return (
    <>
      <PageHeader title="Requests" subtitle="Benefits, equipment and anything else your team needs. Raise it, we quote, you approve, we deliver." />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">New request:</span>
          {categories.map((c) => (
            <Link key={c.label} href={`/app/requests/new?category=${c.value}&title=${encodeURIComponent(c.label)}`} className="btn btn-sm rounded-full">
              {c.label}
            </Link>
          ))}
        </div>
      </Card>
      <Suspense fallback={<Skeleton rows={3} />}>
        <List />
      </Suspense>
    </>
  );
}

async function List() {
  const { clientId } = await requireClient();
  const requests = await getRequests(clientId);
  if (requests.length === 0) {
    return (
      <Card>
        <Empty>No requests yet. Pick a category above to raise one.</Empty>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {requests.map((r) => {
        const quote = r.quotes.find((q) => q.status === "sent") ?? r.quotes.find((q) => q.status === "approved");
        return (
          <Link key={r.id} href={`/app/requests/${r.id}`} className="card flex flex-col gap-1.5 text-ink hover:border-brand">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink-muted">
                REQ-{String(r.number).padStart(3, "0")} · {titleCase(r.category)}
              </span>
              <StatusBadge status={r.status} />
            </div>
            <div className="text-sm font-medium">{r.title}</div>
            <div className="text-[13px] text-ink-muted">
              {r.employees?.full_name ?? "All employees"} · raised {formatDate(r.created_at)}
              {quote ? ` · quote ${inr(quote.total)}` : ""}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
