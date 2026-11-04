import { Suspense } from "react";
import Link from "next/link";
import { Badge, Card, Kpi, LinkButton, PageHeader, Row, Skeleton, Table, Empty } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireClient } from "@/lib/auth";
import { getActivity, getApprovals, getClient, getDepositBalance, getEmployees, getEmployeeTasksForClient, getNextInvoice, getRequests } from "@/lib/data/portal";
import { formatDate, inr, relativeDue } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const { clientId, profile } = await requireClient();
  const [client, employees, deposit, nextInvoice, requests, activity, clientTasks, approvals] = await Promise.all([
    getClient(clientId),
    getEmployees(clientId),
    getDepositBalance(clientId),
    getNextInvoice(clientId),
    getRequests(clientId),
    getActivity(clientId),
    getEmployeeTasksForClient(clientId),
    getApprovals(clientId),
  ]);
  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  const active = employees.filter((e) => e.status === "active");
  const joining = employees.filter((e) => !["active", "exited", "withdrawn", "offboarding"].includes(e.status));
  const shortfall = Math.max(0, deposit.required - deposit.held);
  const openRequests = requests.filter((r) => !["fulfilled", "rejected", "cancelled"].includes(r.status));
  const awaiting = requests.filter((r) => r.status === "quoted");
  const myTasks = clientTasks.filter((t) => t.owner === "client");
  const firstName = profile.full_name.split(" ")[0] || "there";
  const month = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const actions: { title: string; detail: string; href: string; cta: string; primary?: boolean }[] = [
    ...awaiting.map((r) => ({
      title: `Approve quote: ${r.title}`,
      detail: `${r.employees?.full_name ?? "Team"} · ${inr(r.quotes.find((q) => q.status === "sent")?.total ?? 0)}`,
      href: `/app/requests/${r.id}`,
      cta: "Review",
      primary: true,
    })),
    ...(pendingApprovals.length > 0
      ? [{ title: `${pendingApprovals.length} leave or reimbursement request${pendingApprovals.length === 1 ? "" : "s"} to approve`, detail: pendingApprovals.slice(0, 2).map((a) => `${a.employees?.full_name ?? ""}: ${a.title}`).join(" · "), href: "/app/approvals", cta: "Decide", primary: true }]
      : []),
    ...(shortfall > 0
      ? [{ title: "Top up security deposit", detail: `Shortfall of ${inr(shortfall)} against the current requirement`, href: "/app/billing", cta: "View" }]
      : []),
    ...(nextInvoice && nextInvoice.status === "overdue"
      ? [{ title: `Invoice ${nextInvoice.number} is overdue`, detail: `${inr(nextInvoice.total)} was due ${formatDate(nextInvoice.due_date)}`, href: "/app/billing", cta: "Pay" }]
      : []),
    ...myTasks.map((t) => ({ title: `${t.label}, ${t.employees.full_name}`, detail: t.detail ?? "Needs your input", href: `/app/employees/${t.employees.id}`, cta: "Open" })),
  ];

  return (
    <>
      <PageHeader
        title={`Good day, ${firstName}`}
        subtitle={
          <>
            {client?.name} · India team via SetMyCompany · Payroll month: {month}
          </>
        }
        actions={client && <StatusBadge status={client.status} label={client.status === "active" ? "Account active" : undefined} />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Active headcount" value={active.length} hint={joining.length ? `+${joining.length} joining` : "No pending hires"} />
        <Kpi
          label="Next invoice"
          value={nextInvoice ? inr(nextInvoice.total) : "—"}
          hint={nextInvoice ? <>{relativeDue(nextInvoice.due_date).label} · <Link href="/app/billing">view</Link></> : "Nothing due"}
          tone={nextInvoice?.status === "overdue" ? "red" : undefined}
        />
        <Kpi
          label="Deposit held"
          value={inr(deposit.held)}
          hint={shortfall > 0 ? <Badge tone="amber">Top-up of {inr(shortfall)} due</Badge> : deposit.required > 0 ? <Badge tone="green">Fully funded</Badge> : "Not yet required"}
        />
        <Kpi label="Open requests" value={openRequests.length} hint={awaiting.length ? `${awaiting.length} awaiting your approval` : "None awaiting you"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Needs your action" action={actions.length > 0 && <Badge tone="red">{actions.length}</Badge>}>
          {actions.length === 0 ? (
            <Empty>Nothing waiting on you right now.</Empty>
          ) : (
            actions.map((a, i) => (
              <Row key={i}>
                <div>
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-[13px] text-ink-muted">{a.detail}</div>
                </div>
                <LinkButton href={a.href} small primary={a.primary}>
                  {a.cta}
                </LinkButton>
              </Row>
            ))
          )}
        </Card>

        <Card title="Recent activity">
          {activity.length === 0 ? (
            <Empty>Activity will appear here as things happen.</Empty>
          ) : (
            activity.map((a) => (
              <Row key={a.id}>
                <div>
                  <div className="text-sm font-medium">{a.summary}</div>
                  <div className="text-[13px] text-ink-muted">{formatDate(a.created_at, { withTime: true })}</div>
                </div>
              </Row>
            ))
          )}
        </Card>
      </div>

      <Card title="Your team in India" action={<LinkButton href="/app/employees" small>All employees</LinkButton>}>
        {employees.length === 0 ? (
          <Empty>
            No hires yet. <Link href="/app/employees/new">Request your first hire</Link>.
          </Empty>
        ) : (
          <Table head={["Employee", "Role", "Location", "Monthly gross", "Status"]}>
            {employees.slice(0, 6).map((e) => (
              <tr key={e.id}>
                <td className="td font-medium">
                  <Link href={`/app/employees/${e.id}`}>{e.full_name}</Link>
                </td>
                <td className="td">{e.job_title}</td>
                <td className="td">{[e.location_city, e.location_state].filter(Boolean).join(", ") || "—"}</td>
                <td className="td tabular-nums">{inr(e.monthly_gross)}</td>
                <td className="td">
                  <StatusBadge status={e.status} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
