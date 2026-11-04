import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Badge, Card, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { canApproveRole, requireClient } from "@/lib/auth";
import { getRequest, getShipments } from "@/lib/data/portal";
import { formatDate, inr, titleCase } from "@/lib/format";
import { DecideQuote } from "./decide-quote";

export const metadata = { title: "Request" };

export default function RequestPage({ params }: PageProps<"/app/requests/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={2} />}>
      {params.then(({ id }) => (
        <Content id={id} />
      ))}
    </Suspense>
  );
}

async function Content({ id }: { id: string }) {
  const { clientId, profile } = await requireClient();
  const [req, shipments] = await Promise.all([getRequest(clientId, id), getShipments(clientId)]);
  if (!req) notFound();
  const quotes = [...req.quotes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const current = quotes.find((q) => q.status === "sent") ?? quotes.find((q) => q.status === "approved") ?? quotes.find((q) => q.status === "rejected");
  const shipment = shipments.find((s) => s.request_id === req.id);

  return (
    <>
      <PageHeader
        title={req.title}
        subtitle={`REQ-${String(req.number).padStart(3, "0")} · ${titleCase(req.category)} · for ${req.employees?.full_name ?? "all employees"} · raised ${formatDate(req.created_at)}`}
        actions={<StatusBadge status={req.status} />}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Card title="Request">
            <p className="whitespace-pre-line text-sm leading-relaxed">{req.description ?? "No further details."}</p>
          </Card>

          {current ? (
            <Card title={current.status === "sent" ? "Quote from EOR Hub" : `Quote (${current.status})`} action={current.valid_until && <Badge tone="gray">Valid until {formatDate(current.valid_until)}</Badge>}>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {current.quote_lines
                    .sort((a, b) => a.sort - b.sort)
                    .map((l) => (
                      <tr key={l.id} className="border-b border-line-soft">
                        <td className="py-2.5">{l.label}</td>
                        <td className="py-2.5 text-right tabular-nums">{inr(l.amount)}</td>
                      </tr>
                    ))}
                  <tr>
                    <td className="py-2.5 font-semibold">Total, billed on your next invoice</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{inr(current.total)}</td>
                  </tr>
                </tbody>
              </table>
              {current.note && <div className="mt-3 rounded-lg bg-canvas px-3.5 py-3 text-[13px] text-[#3a4150]">{current.note}</div>}
              {req.status === "quoted" && current.status === "sent" && (
                canApproveRole(profile.role) ? (
                  <DecideQuote quoteId={current.id} requestId={req.id} total={inr(current.total)} />
                ) : (
                  <p className="mt-3 text-[13px] text-ink-muted">An admin or approver on your account needs to approve this quote.</p>
                )
              )}
            </Card>
          ) : (
            <Card title="Quote">
              <p className="text-sm text-ink-muted">We are working on a quote and will post it here. You will get an email when it is ready.</p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card title="Timeline">
            <ol className="flex flex-col gap-3 text-sm">
              <li>
                <div className="font-medium">Raised</div>
                <div className="text-[13px] text-ink-muted">{formatDate(req.created_at, { withTime: true })}</div>
              </li>
              {quotes.map((q) => (
                <li key={q.id}>
                  <div className="font-medium">Quote {q.status === "superseded" ? "superseded" : q.status}</div>
                  <div className="text-[13px] text-ink-muted">
                    {inr(q.total)} · {formatDate(q.created_at, { withTime: true })}
                  </div>
                </li>
              ))}
              {req.decided_at && (
                <li>
                  <div className="font-medium">{titleCase(req.status)} by you</div>
                  <div className="text-[13px] text-ink-muted">{formatDate(req.decided_at, { withTime: true })}</div>
                </li>
              )}
              {shipment && (
                <li>
                  <div className="font-medium">Shipment {titleCase(shipment.status)}</div>
                  <div className="text-[13px] text-ink-muted">
                    {shipment.courier} {shipment.awb ? `· AWB ${shipment.awb}` : ""}
                  </div>
                  <LinkButton href="/app/tracking" small className="mt-2">
                    Track shipment
                  </LinkButton>
                </li>
              )}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
