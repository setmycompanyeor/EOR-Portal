import { Suspense } from "react";
import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { ActionButton } from "@/components/action-controls";
import { requireOps } from "@/lib/auth";
import { getAllApprovals, getAllEmployees } from "@/lib/data/ops";
import { formatDate, inr, titleCase } from "@/lib/format";
import { markApprovalSynced } from "../actions";
import { NewApprovalForm } from "./new-approval-form";

export const metadata = { title: "Approvals" };

export default function OpsApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Leave and reimbursement requests logged from Keka. Clients decide in their portal; apply each decision in Keka, then mark it synced."
      />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireOps();
  const [approvals, employees] = await Promise.all([getAllApprovals(), getAllEmployees()]);
  const toApply = approvals.filter((a) => a.status === "approved" || a.status === "rejected");
  const waiting = approvals.filter((a) => a.status === "pending");
  const done = approvals.filter((a) => a.status === "synced");

  const details = (a: (typeof approvals)[number]) =>
    a.kind === "reimbursement" ? `${inr(a.amount)}${a.category ? ` · ${a.category}` : ""}` : `${formatDate(a.from_date)}${a.to_date && a.to_date !== a.from_date ? ` to ${formatDate(a.to_date)}` : ""}${a.leave_type ? ` · ${a.leave_type}` : ""}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card title="Decided by client, apply in Keka" action={toApply.length > 0 && <Badge tone="amber">{toApply.length}</Badge>}>
          {toApply.length === 0 ? (
            <Empty>Nothing to apply.</Empty>
          ) : (
            <Table head={["Request", "Client / employee", "Details", "Decision", ""]}>
              {toApply.map((a) => (
                <tr key={a.id}>
                  <td className="td">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-[12px] text-ink-muted">
                      {titleCase(a.kind)}
                      {a.keka_reference ? ` · Keka ${a.keka_reference}` : ""}
                    </div>
                  </td>
                  <td className="td">
                    <Link href={`/ops/clients/${a.client_id}`}>{a.clients?.name}</Link>
                    <div className="text-[12px] text-ink-muted">{a.employees?.full_name}</div>
                  </td>
                  <td className="td">{details(a)}</td>
                  <td className="td">
                    <StatusBadge status={a.status} />
                    <div className="text-[12px] text-ink-muted">
                      {formatDate(a.decided_at)}
                      {a.decision_note ? ` · ${a.decision_note}` : ""}
                    </div>
                  </td>
                  <td className="td">
                    <ActionButton
                      primary
                      action={async () => {
                        "use server";
                        await markApprovalSynced(a.id);
                      }}
                    >
                      {a.status === "approved" ? "Approved in Keka" : "Rejected in Keka"}
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Waiting on clients" action={waiting.length > 0 && <Badge tone="gray">{waiting.length}</Badge>}>
          {waiting.length === 0 ? (
            <Empty>Nothing pending with clients.</Empty>
          ) : (
            <Table head={["Request", "Client / employee", "Details", "Raised"]}>
              {waiting.map((a) => (
                <tr key={a.id}>
                  <td className="td">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-[12px] text-ink-muted">{titleCase(a.kind)}</div>
                  </td>
                  <td className="td">
                    {a.clients?.name}
                    <div className="text-[12px] text-ink-muted">{a.employees?.full_name}</div>
                  </td>
                  <td className="td">{details(a)}</td>
                  <td className="td">{formatDate(a.created_at)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Applied">
          {done.length === 0 ? (
            <Empty>None yet.</Empty>
          ) : (
            <Table head={["Request", "Client / employee", "Details", "Applied", "Billing"]}>
              {done.slice(0, 20).map((a) => (
                <tr key={a.id}>
                  <td className="td">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-[12px] text-ink-muted">{titleCase(a.kind)}</div>
                  </td>
                  <td className="td">
                    {a.clients?.name}
                    <div className="text-[12px] text-ink-muted">{a.employees?.full_name}</div>
                  </td>
                  <td className="td">{details(a)}</td>
                  <td className="td">{formatDate(a.synced_at)}</td>
                  <td className="td">{a.kind === "reimbursement" ? (a.invoice_id ? <Badge tone="green">Invoiced</Badge> : a.decided_at && a.status === "synced" ? <Badge tone="amber">Next invoice</Badge> : "—") : "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card title="Log a request from Keka">
        <NewApprovalForm employees={employees.filter((e) => e.status === "active").map((e) => ({ id: e.id, name: `${e.full_name} · ${e.clients?.name ?? ""}` }))} />
      </Card>
    </div>
  );
}
