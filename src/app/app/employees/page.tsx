import { Suspense } from "react";
import Link from "next/link";
import { Card, Empty, LinkButton, PageHeader, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireClient } from "@/lib/auth";
import { getEmployees } from "@/lib/data/portal";
import { formatDate, inr } from "@/lib/format";

export const metadata = { title: "Employees" };

export default function EmployeesPage() {
  return (
    <Suspense fallback={<Skeleton rows={2} />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const { clientId } = await requireClient();
  const employees = await getEmployees(clientId);
  const active = employees.filter((e) => e.status === "active").length;
  const onboarding = employees.filter((e) => !["active", "exited", "withdrawn", "offboarding"].includes(e.status)).length;

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} people · ${active} active · ${onboarding} onboarding · payroll cut-off 25th of each month`}
        actions={<LinkButton href="/app/employees/new" primary>+ New hire request</LinkButton>}
      />
      <Card>
        {employees.length === 0 ? (
          <Empty>
            No employees yet. <Link href="/app/employees/new">Request your first hire</Link> and we will send a cost estimate within one business day.
          </Empty>
        ) : (
          <Table head={["Employee", "Role", "Location", "Start date", "Monthly gross", "Type", "Status"]}>
            {employees.map((e) => (
              <tr key={e.id}>
                <td className="td font-medium">
                  <Link href={`/app/employees/${e.id}`}>{e.full_name}</Link>
                </td>
                <td className="td">{e.job_title}</td>
                <td className="td">{[e.location_city, e.location_state].filter(Boolean).join(", ") || "—"}</td>
                <td className="td">{formatDate(e.start_date)}</td>
                <td className="td tabular-nums">{inr(e.monthly_gross)}</td>
                <td className="td">{e.employment_type === "permanent" ? "Permanent" : "Fixed-term"}</td>
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
