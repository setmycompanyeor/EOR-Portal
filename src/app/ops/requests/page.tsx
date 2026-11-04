import { Suspense } from "react";
import Link from "next/link";
import { Card, Empty, PageHeader, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireOps } from "@/lib/auth";
import { getAllRequests } from "@/lib/data/ops";
import { formatDate, inr, titleCase } from "@/lib/format";

export const metadata = { title: "Quotes & requests" };

export default function OpsRequestsPage() {
  return (
    <>
      <PageHeader title="Quotes & requests" subtitle="Client requests waiting for a quote, decisions, and fulfilment." />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireOps();
  const requests = await getAllRequests();
  return (
    <Card>
      {requests.length === 0 ? (
        <Empty>No requests yet.</Empty>
      ) : (
        <Table head={["Request", "Client", "For", "Category", "Raised", "Quote", "Status"]}>
          {requests.map((r) => {
            const q = r.quotes.find((x) => x.status === "sent") ?? r.quotes.find((x) => x.status === "approved");
            return (
              <tr key={r.id}>
                <td className="td font-medium">
                  <Link href={`/ops/requests/${r.id}`}>{r.title}</Link>
                  <div className="text-[12px] text-ink-muted">REQ-{String(r.number).padStart(3, "0")}</div>
                </td>
                <td className="td">{r.clients?.name}</td>
                <td className="td">{r.employees?.full_name ?? "All"}</td>
                <td className="td">{titleCase(r.category)}</td>
                <td className="td">{formatDate(r.created_at)}</td>
                <td className="td tabular-nums">{q ? inr(q.total) : "—"}</td>
                <td className="td">
                  <StatusBadge status={r.status} label={r.status === "quoted" ? "Awaiting client" : r.status === "open" ? "Needs quote" : undefined} />
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );
}
