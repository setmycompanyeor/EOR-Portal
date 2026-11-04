import { Suspense } from "react";
import { Badge, Card, Empty, PageHeader, Row, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireClient } from "@/lib/auth";
import { getAssets, getShipments } from "@/lib/data/portal";
import { formatDate, titleCase } from "@/lib/format";

export const metadata = { title: "Tracking & assets" };

const stages = ["ordered", "packed", "picked_up", "in_transit", "out_for_delivery", "delivered"] as const;

export default function TrackingPage() {
  return (
    <>
      <PageHeader title="Tracking & assets" subtitle="Live courier status for equipment on its way, and the register of everything already issued." />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { clientId } = await requireClient();
  const [shipments, assets] = await Promise.all([getShipments(clientId), getAssets(clientId)]);
  const live = shipments.filter((s) => !["delivered", "returned", "lost"].includes(s.status));
  const past = shipments.filter((s) => ["delivered", "returned", "lost"].includes(s.status));
  const featured = live[0];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="flex flex-col gap-4 lg:col-span-3">
        {featured ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[13px] text-ink-muted">Shipment · {featured.assets?.tag ?? "untagged"}</div>
                <h2 className="mt-1 text-[17px] font-semibold">{featured.title}</h2>
              </div>
              <StatusBadge status={featured.status} />
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[13px] text-ink-muted">Courier</dt>
                <dd>{featured.courier ?? "To be assigned"}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-muted">AWB number</dt>
                <dd className="tabular-nums">
                  {featured.awb ?? "—"}
                  {featured.tracking_url && (
                    <>
                      {" · "}
                      <a href={featured.tracking_url} target="_blank" rel="noreferrer">
                        track on courier site
                      </a>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-muted">Deliver to</dt>
                <dd>{featured.deliver_to ?? featured.employees?.full_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-muted">Expected</dt>
                <dd>{formatDate(featured.expected_date)}</dd>
              </div>
            </dl>
            <ol className="mt-5 flex flex-col">
              {stages.map((stage, i) => {
                const ev = featured.shipment_events.find((e) => e.status === stage);
                const reached = stages.indexOf(featured.status as (typeof stages)[number]);
                const state = i < reached || ev ? "done" : i === reached ? "now" : "todo";
                const dot = state === "done" ? "bg-green-ink" : state === "now" ? "bg-brand ring-4 ring-brand-soft" : "border-2 border-[#c9ced8] bg-surface";
                return (
                  <li key={stage} className="grid grid-cols-[28px_1fr] gap-x-3.5">
                    <div className="flex flex-col items-center">
                      <span aria-hidden="true" className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${dot}`} />
                      {i < stages.length - 1 && <span className="min-h-7 w-0.5 flex-1 bg-line" />}
                    </div>
                    <div className="pb-4">
                      <div className={`text-sm font-medium ${state === "todo" ? "text-ink-muted" : ""}`}>{titleCase(stage)}</div>
                      <div className="text-[13px] text-ink-muted">
                        {ev ? `${formatDate(ev.occurred_at, { withTime: true })}${ev.location ? ` · ${ev.location}` : ""}${ev.note ? ` · ${ev.note}` : ""}` : state === "now" ? "In progress" : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        ) : (
          <Card>
            <Empty>Nothing on its way right now. Approved equipment requests appear here once dispatched.</Empty>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card title="Other shipments">
          {[...live.slice(1), ...past].length === 0 ? (
            <Empty>No other shipments.</Empty>
          ) : (
            [...live.slice(1), ...past].map((s) => (
              <Row key={s.id}>
                <div>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-[13px] text-ink-muted">
                    {s.status === "delivered" ? `Delivered ${formatDate(s.delivered_at)}` : formatDate(s.expected_date)} {s.courier ? `· ${s.courier}` : ""}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </Row>
            ))
          )}
        </Card>

        <Card title="Asset register" action={<Badge tone="gray">{assets.length} items</Badge>}>
          {assets.length === 0 ? (
            <Empty>No equipment issued yet.</Empty>
          ) : (
            <Table head={["Tag", "Device", "Holder", "Status"]}>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">{a.tag}</td>
                  <td className="td">{a.model}</td>
                  <td className="td">{a.employees?.full_name ?? "—"}</td>
                  <td className="td">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
