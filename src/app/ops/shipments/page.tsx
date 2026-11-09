import { Suspense } from "react";
import Link from "next/link";
import { Card, Empty, PageHeader, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireOps } from "@/lib/auth";
import { getAllAssets, getAllRequests, getAllShipments, getClientsOverview } from "@/lib/data/ops";
import { formatDate, titleCase } from "@/lib/format";
import { SlideOver, SlideOverPending } from "@/components/slide-over";
import { ShipmentEventForm, NewShipmentForm } from "./forms";

export const metadata = { title: "Shipments & assets" };

export default function OpsShipmentsPage({ searchParams }: PageProps<"/ops/shipments">) {
  return (
    <>
      <PageHeader
        title="Shipments & assets"
        subtitle="Create shipments for approved equipment, post courier events, and keep the asset register current."
        actions={
          <Suspense fallback={<SlideOverPending label="+ Shipment" />}>
            {searchParams.then((sp) => (
              <NewShipment presetRequest={typeof sp.request === "string" ? sp.request : undefined} presetClient={typeof sp.client === "string" ? sp.client : undefined} />
            ))}
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

/** The "+ Shipment" button and its form. Opens by itself when a link pre-fills the request or client. */
async function NewShipment({ presetRequest, presetClient }: { presetRequest?: string; presetClient?: string }) {
  await requireOps();
  const [clients, requests] = await Promise.all([getClientsOverview(), getAllRequests()]);
  const approved = requests.filter((r) => ["approved", "in_progress"].includes(r.status) && r.category === "equipment");
  return (
    <SlideOver label="+ Shipment" title="New shipment" description="For an approved equipment request, or ad hoc." defaultOpen={!!presetRequest || !!presetClient}>
      <NewShipmentForm
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        requests={approved.map((r) => ({ id: r.id, title: r.title, client_id: r.client_id, employee_id: r.employee_id, employee: r.employees?.full_name ?? null }))}
        presetRequest={presetRequest}
        presetClient={presetClient}
      />
    </SlideOver>
  );
}

async function Content() {
  await requireOps();
  const [shipments, assets] = await Promise.all([getAllShipments(), getAllAssets()]);
  const live = shipments.filter((s) => !["delivered", "returned", "lost"].includes(s.status));
  const done = shipments.filter((s) => ["delivered", "returned", "lost"].includes(s.status));

  return (
    <>
      <Card title="In flight">
        {live.length === 0 ? (
          <Empty>Nothing in transit.</Empty>
        ) : (
          live.map((s) => (
            <div key={s.id} className="border-b border-line-soft py-3 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-[13px] text-ink-muted">
                    <Link href={`/ops/clients/${s.client_id}`}>{s.clients?.name}</Link> · {s.employees?.full_name ?? "—"} · {s.courier ?? "no courier"} {s.awb ? `· AWB ${s.awb}` : ""} · expected {formatDate(s.expected_date)}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
                {s.shipment_events.map((e) => (
                  <li key={e.id}>
                    {titleCase(e.status)} · {formatDate(e.occurred_at, { withTime: true })}
                    {e.location ? ` · ${e.location}` : ""}
                  </li>
                ))}
              </ul>
              <ShipmentEventForm shipmentId={s.id} clientId={s.client_id} current={s.status} />
            </div>
          ))
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Delivered and closed">
          {done.length === 0 ? (
            <Empty>None yet.</Empty>
          ) : (
            <Table head={["Shipment", "Client", "Courier", "Closed", "Status"]}>
              {done.map((s) => (
                <tr key={s.id}>
                  <td className="td font-medium">{s.title}</td>
                  <td className="td">{s.clients?.name}</td>
                  <td className="td">{s.courier ?? "—"}</td>
                  <td className="td">{formatDate(s.delivered_at)}</td>
                  <td className="td">
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Asset register">
          {assets.length === 0 ? (
            <Empty>No assets.</Empty>
          ) : (
            <Table head={["Tag", "Device", "Client", "Holder", "Status"]}>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">{a.tag}</td>
                  <td className="td">
                    {a.model}
                    {a.serial && <div className="text-[12px] text-ink-muted">SN {a.serial}</div>}
                  </td>
                  <td className="td">{a.clients?.name}</td>
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
    </>
  );
}
