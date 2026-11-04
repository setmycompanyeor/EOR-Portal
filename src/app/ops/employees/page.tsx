import { Suspense } from "react";
import Link from "next/link";
import { Card, Empty, PageHeader, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireOps } from "@/lib/auth";
import { getAllEmployees } from "@/lib/data/ops";
import { formatDate, inr } from "@/lib/format";

export const metadata = { title: "Employees" };

export default function OpsEmployeesPage() {
  return (
    <>
      <PageHeader title="Employees" subtitle="Everyone on payroll or in onboarding, across all clients." />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireOps();
  const employees = await getAllEmployees();
  return (
    <Card>
      {employees.length === 0 ? (
        <Empty>No employees yet.</Empty>
      ) : (
        <Table head={["Employee", "Client", "Role", "Location", "Gross", "Start", "Status"]}>
          {employees.map((e) => (
            <tr key={e.id}>
              <td className="td font-medium">
                <Link href={`/ops/employees/${e.id}`}>{e.full_name}</Link>
              </td>
              <td className="td">{e.clients?.name}</td>
              <td className="td">{e.job_title}</td>
              <td className="td">{[e.location_city, e.location_state].filter(Boolean).join(", ")}</td>
              <td className="td tabular-nums">{inr(e.monthly_gross)}</td>
              <td className="td">{formatDate(e.start_date)}</td>
              <td className="td">
                <StatusBadge status={e.status} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
