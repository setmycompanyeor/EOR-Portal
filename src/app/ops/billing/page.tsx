import { Suspense } from "react";
import Link from "next/link";
import { Card, Empty, Kpi, PageHeader, Skeleton, Table } from "@/components/ui";
import { ActionSelect } from "@/components/action-controls";
import { requireOps } from "@/lib/auth";
import { getAllInvoices, getClientsOverview } from "@/lib/data/ops";
import { formatDate, inr, titleCase } from "@/lib/format";
import { setInvoiceStatus } from "../actions";
import { ZohoSyncButton } from "./zoho-sync";

export const metadata = { title: "Invoices & deposits" };

export default function OpsBillingPage() {
  return (
    <>
      <PageHeader title="Invoices & deposits" subtitle="Everything issued, what is paid, and which deposits need a top-up." actions={<ZohoSyncButton />} />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireOps();
  const [invoices, clients] = await Promise.all([getAllInvoices(), getClientsOverview()]);
  const open = invoices.filter((i) => ["sent", "overdue"].includes(i.status));
  const overdue = invoices.filter((i) => i.status === "overdue");
  const short = clients.filter((c) => c.deposit.required > c.deposit.held);
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Outstanding" value={inr(open.reduce((s, i) => s + Number(i.total), 0), { compact: true })} hint={`${open.length} invoices`} />
        <Kpi label="Overdue" value={inr(overdue.reduce((s, i) => s + Number(i.total), 0), { compact: true })} hint={`${overdue.length} invoices`} tone={overdue.length ? "red" : undefined} />
        <Kpi label="Deposits held" value={inr(clients.reduce((s, c) => s + c.deposit.held, 0), { compact: true })} hint="across all clients" />
        <Kpi label="Deposit shortfalls" value={short.length} hint={short.map((c) => `${c.name} ${inr(c.deposit.required - c.deposit.held)}`).join(", ") || "None"} tone={short.length ? "amber" : undefined} />
      </div>
      <Card title="All invoices">
        {invoices.length === 0 ? (
          <Empty>No invoices yet. Create one from a client&apos;s page.</Empty>
        ) : (
          <Table head={["Invoice", "Client", "Kind", "Issued", "Due", "Total", "Zoho", "Status"]}>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="td font-medium">{i.number}</td>
                <td className="td">
                  <Link href={`/ops/clients/${i.client_id}`}>{i.clients?.name}</Link>
                </td>
                <td className="td">{i.kind === "monthly" && i.period_start ? new Date(i.period_start).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : titleCase(i.kind)}</td>
                <td className="td">{formatDate(i.issue_date)}</td>
                <td className="td">{formatDate(i.due_date)}</td>
                <td className="td text-right tabular-nums">{inr(i.total)}</td>
                <td className="td text-[12px] text-ink-muted">{i.zoho_invoice_id ? "Synced" : "—"}</td>
                <td className="td">
                  <ActionSelect
                    label={`Status for ${i.number}`}
                    value={i.status}
                    options={["draft", "sent", "paid", "overdue", "void"]}
                    action={async (v) => {
                      "use server";
                      await setInvoiceStatus(i.id, i.client_id, v as "sent" | "paid" | "overdue" | "void");
                    }}
                  />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
