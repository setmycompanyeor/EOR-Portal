import { Suspense } from "react";
import Link from "next/link";
import { Badge, Card, PageHeader, Skeleton, Table } from "@/components/ui";
import { requireOps } from "@/lib/auth";
import { getClientsOverview } from "@/lib/data/ops";
import { formatDate, inr, titleCase } from "@/lib/format";
import { NewClientForm } from "./new-client-form";

export const metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <>
      <PageHeader title="Clients" subtitle="Every company we employ people for, with deposit and billing health." />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireOps();
  const clients = await getClientsOverview();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <Table head={["Client", "Country", "Headcount", "Deposit held / required", "Unpaid", "Next due", "Status"]}>
          {clients.map((c) => (
            <tr key={c.id}>
              <td className="td font-medium">
                <Link href={`/ops/clients/${c.id}`}>{c.name}</Link>
                <div className="text-[12px] text-ink-muted">{c.account_manager?.full_name ?? "No account manager"}</div>
              </td>
              <td className="td">{c.country}</td>
              <td className="td">
                {c.active}
                {c.joining ? ` + ${c.joining}` : ""}
              </td>
              <td className="td tabular-nums">
                {inr(c.deposit.held)} / {inr(c.deposit.required)}
              </td>
              <td className="td tabular-nums">{c.unpaid ? inr(c.unpaid) : "—"}</td>
              <td className="td">{formatDate(c.nextDue)}</td>
              <td className="td">
                <Badge tone={c.status === "active" ? "green" : c.status === "onboarding" ? "blue" : "gray"}>{titleCase(c.status)}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="New client">
        <NewClientForm />
      </Card>
    </div>
  );
}
