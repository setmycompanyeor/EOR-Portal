import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Badge, Card, Empty, LinkButton, PageHeader, Row, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireClient } from "@/lib/auth";
import { getEmployee, getPricing } from "@/lib/data/portal";
import { formatDate, inr, titleCase } from "@/lib/format";
import { estimate } from "@/lib/pricing";
import { UploadDocument } from "@/app/app/onboarding/upload-document";
import { CompleteTaskButton } from "./complete-task";

export default function EmployeePage({ params }: PageProps<"/app/employees/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      {params.then(({ id }) => (
        <Content id={id} />
      ))}
    </Suspense>
  );
}

const employeeDocKinds = [
  { value: "employee_id", label: "Aadhaar / ID proof" },
  { value: "employee_pan", label: "PAN card" },
  { value: "employee_bank", label: "Bank proof" },
  { value: "employee_uan", label: "UAN / previous PF" },
  { value: "employee_education", label: "Education certificate" },
  { value: "employee_payslip", label: "Previous payslip" },
  { value: "other", label: "Other" },
];

async function Content({ id }: { id: string }) {
  const { clientId, profile } = await requireClient();
  const [{ employee, tasks, documents }, config] = await Promise.all([getEmployee(clientId, id), getPricing(clientId)]);
  if (!employee) notFound();
  const est = estimate({ monthlyGross: Number(employee.monthly_gross) }, config);
  const done = tasks.filter((t) => t.status === "done").length;
  const canAct = profile.role === "client_admin" || profile.role === "client_approver";

  return (
    <>
      <PageHeader
        title={employee.full_name}
        subtitle={`${employee.job_title} · ${[employee.location_city, employee.location_state].filter(Boolean).join(", ")} · starts ${formatDate(employee.start_date)}`}
        actions={<StatusBadge status={employee.status} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Onboarding checklist" action={<Badge tone={done === tasks.length ? "green" : "amber"}>{done} of {tasks.length}</Badge>}>
          {tasks.length === 0 ? (
            <Empty>Checklist will appear once we pick up the request.</Empty>
          ) : (
            tasks.map((t) => (
              <Row key={t.id}>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${t.status === "done" ? "bg-green-ink text-white" : "border-2 border-[#c9ced8]"}`}
                  >
                    {t.status === "done" && (
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5 10 17l9-10" />
                      </svg>
                    )}
                  </span>
                  <div>
                    <div className={`text-sm font-medium ${t.status === "done" ? "" : ""}`}>{t.label}</div>
                    <div className="text-[13px] text-ink-muted">
                      {t.status === "done" ? `Done ${formatDate(t.completed_at)}` : t.detail ?? `Owner: ${t.owner === "ops" ? "EOR Hub" : titleCase(t.owner)}`}
                    </div>
                  </div>
                </div>
                {t.status !== "done" && t.owner === "client" && canAct && <CompleteTaskButton taskId={t.id} employeeId={employee.id} />}
                {t.status !== "done" && t.owner !== "client" && <Badge tone="gray">{t.owner === "ops" ? "With EOR Hub" : "With candidate"}</Badge>}
              </Row>
            ))
          )}
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card title="Monthly cost" action={<LinkButton href="/app/estimator" small>Estimator</LinkButton>}>
            <Table head={[]}>
              <tr>
                <td className="td text-ink-muted">Gross salary</td>
                <td className="td text-right tabular-nums">{inr(est.perEmployee.gross)}</td>
              </tr>
              <tr>
                <td className="td text-ink-muted">Employer PF, ESI, gratuity, insurance</td>
                <td className="td text-right tabular-nums">{inr(est.perEmployee.pf + est.perEmployee.esi + est.perEmployee.gratuity + est.perEmployee.insurance)}</td>
              </tr>
              <tr>
                <td className="td text-ink-muted">Management fee + GST</td>
                <td className="td text-right tabular-nums">{inr(est.perEmployee.fee + est.perEmployee.gst)}</td>
              </tr>
              <tr>
                <td className="td font-semibold">All-in per month</td>
                <td className="td text-right font-semibold tabular-nums">{inr(est.perEmployee.monthly)}</td>
              </tr>
            </Table>
          </Card>

          <Card title="Employee documents" action={canAct && <UploadDocument employeeId={employee.id} employeeKinds={employeeDocKinds} />}>
            {documents.length === 0 ? (
              <Empty>No documents yet.</Empty>
            ) : (
              documents.map((d) => (
                <Row key={d.id}>
                  <div>
                    <div className="text-sm font-medium">{d.name}</div>
                    <div className="text-[13px] text-ink-muted">{titleCase(d.kind.replace("employee_", ""))}</div>
                  </div>
                  <StatusBadge status={d.status} />
                </Row>
              ))
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
