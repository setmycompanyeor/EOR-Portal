import { Suspense } from "react";
import { Badge, Card, Empty, PageHeader, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { canApproveRole, requireClient } from "@/lib/auth";
import { getApprovals } from "@/lib/data/portal";
import { formatDate, inr, titleCase } from "@/lib/format";
import { BRAND_SHORT } from "@/lib/brand";
import { DecideApproval } from "./decide";

export const metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle={`Leave and reimbursement requests from your team, raised in the payroll system. Decide here; ${BRAND_SHORT} applies your decision in payroll. Approved reimbursements are added to your next invoice.`}
      />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { clientId, profile } = await requireClient();
  const approvals = await getApprovals(clientId);
  const pending = approvals.filter((a) => a.status === "pending");
  const past = approvals.filter((a) => a.status !== "pending");
  const canDecide = canApproveRole(profile.role);

  return (
    <>
      <Card title="Waiting for your decision" action={pending.length > 0 && <Badge tone="amber">{pending.length}</Badge>}>
        {pending.length === 0 ? (
          <Empty>Nothing waiting.</Empty>
        ) : (
          pending.map((a) => (
            <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft py-3 last:border-b-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={a.kind === "leave" ? "blue" : "purple"}>{titleCase(a.kind)}</Badge>
                  <span className="text-sm font-medium">{a.title}</span>
                </div>
                <div className="mt-1 text-[13px] text-ink-muted">
                  {a.employees?.full_name}
                  {a.kind === "leave" && a.from_date ? ` · ${formatDate(a.from_date)}${a.to_date && a.to_date !== a.from_date ? ` to ${formatDate(a.to_date)}` : ""}${a.leave_type ? ` · ${a.leave_type}` : ""}` : ""}
                  {a.kind === "reimbursement" ? ` · ${inr(a.amount)}${a.category ? ` · ${a.category}` : ""}` : ""}
                  {` · raised ${formatDate(a.created_at)}`}
                </div>
                {a.detail && <p className="mt-1 text-[13px]">{a.detail}</p>}
              </div>
              {canDecide ? <DecideApproval id={a.id} /> : <span className="text-[13px] text-ink-muted">Needs an admin or approver</span>}
            </div>
          ))
        )}
      </Card>

      <Card title="Decided">
        {past.length === 0 ? (
          <Empty>No decisions yet.</Empty>
        ) : (
          <Table head={["Request", "Employee", "Details", "Decision", "Status"]}>
            {past.map((a) => (
              <tr key={a.id}>
                <td className="td">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-[12px] text-ink-muted">{titleCase(a.kind)}</div>
                </td>
                <td className="td">{a.employees?.full_name}</td>
                <td className="td">{a.kind === "reimbursement" ? inr(a.amount) : `${formatDate(a.from_date)}${a.to_date && a.to_date !== a.from_date ? ` to ${formatDate(a.to_date)}` : ""}`}</td>
                <td className="td">
                  {formatDate(a.decided_at)}
                  {a.decision_note && <div className="text-[12px] text-ink-muted">{a.decision_note}</div>}
                </td>
                <td className="td">
                  <StatusBadge status={a.status} label={a.status === "synced" ? "Applied in payroll" : undefined} />
                  {a.status === "approved" && <div className="mt-1 text-[12px] text-ink-muted">Being applied by {BRAND_SHORT}</div>}
                  {a.invoice_id && <div className="mt-1 text-[12px] text-ink-muted">On invoice</div>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
