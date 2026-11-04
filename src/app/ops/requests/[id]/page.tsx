import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { ActionButton } from "@/components/action-controls";
import { requireOps } from "@/lib/auth";
import { getRequestForOps } from "@/lib/data/ops";
import { formatDate, inr, titleCase, toDateInput } from "@/lib/format";
import { setRequestStatus } from "../../actions";
import { QuoteForm } from "./quote-form";

export const metadata = { title: "Request" };

export default function OpsRequestPage({ params }: PageProps<"/ops/requests/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={2} />}>
      {params.then(({ id }) => (
        <Content id={id} />
      ))}
    </Suspense>
  );
}

async function Content({ id }: { id: string }) {
  await requireOps();
  const r = await getRequestForOps(id);
  if (!r) notFound();
  const quotes = [...r.quotes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const canQuote = ["open", "quoted", "rejected"].includes(r.status);
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 14);

  return (
    <>
      <PageHeader
        title={r.title}
        subtitle={
          <>
            REQ-{String(r.number).padStart(3, "0")} · <Link href={`/ops/clients/${r.client_id}`}>{r.clients?.name}</Link> · for {r.employees?.full_name ?? "all employees"} · {titleCase(r.category)} · raised {formatDate(r.created_at)}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={r.status} label={r.status === "quoted" ? "Awaiting client" : r.status === "open" ? "Needs quote" : undefined} />
            {r.status === "approved" && (
              <ActionButton
                action={async () => {
                  "use server";
                  await setRequestStatus(r.id, r.client_id, "in_progress");
                }}
              >
                Mark in progress
              </ActionButton>
            )}
            {["approved", "in_progress"].includes(r.status) && (
              <ActionButton
                primary
                action={async () => {
                  "use server";
                  await setRequestStatus(r.id, r.client_id, "fulfilled");
                }}
              >
                Mark fulfilled
              </ActionButton>
            )}
            {!["fulfilled", "cancelled"].includes(r.status) && (
              <ActionButton
                danger
                action={async () => {
                  "use server";
                  await setRequestStatus(r.id, r.client_id, "cancelled");
                }}
              >
                Cancel
              </ActionButton>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card title="Request">
            <p className="whitespace-pre-line text-sm leading-relaxed">{r.description ?? "No further details."}</p>
          </Card>
          <Card title="Quote history">
            {quotes.length === 0 ? (
              <p className="text-sm text-ink-muted">No quote sent yet.</p>
            ) : (
              quotes.map((q) => (
                <div key={q.id} className="border-b border-line-soft py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {inr(q.total)} · {formatDate(q.created_at, { withTime: true })}
                    </span>
                    <StatusBadge status={q.status} label={q.status === "sent" ? "Sent" : undefined} />
                  </div>
                  <ul className="mt-1 text-[13px] text-ink-muted">
                    {q.quote_lines
                      .sort((a, b) => a.sort - b.sort)
                      .map((l) => (
                        <li key={l.id}>
                          {l.label}: {inr(l.amount)}
                        </li>
                      ))}
                  </ul>
                  {q.note && <p className="mt-1 text-[13px]">{q.note}</p>}
                </div>
              ))
            )}
          </Card>
        </div>
        <Card title={quotes.some((q) => q.status === "sent") ? "Send a revised quote" : "Send a quote"} action={!canQuote && <Badge tone="gray">Request is {r.status}</Badge>}>
          {canQuote ? <QuoteForm requestId={r.id} clientId={r.client_id} defaultValidUntil={toDateInput(validUntil)} /> : <p className="text-sm text-ink-muted">Quoting is closed for this request.</p>}
          {r.status === "approved" && (
            <p className="mt-3 text-[13px] text-ink-muted">
              Approved by the client. <Link href={`/ops/shipments?request=${r.id}&client=${r.client_id}`}>Create the shipment</Link> once ordered.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
