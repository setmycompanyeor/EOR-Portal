import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Empty, PageHeader, Row, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { ActionButton, ActionSelect, OpenFileButton } from "@/components/action-controls";
import { requireOps } from "@/lib/auth";
import { getEmployeeForOps } from "@/lib/data/ops";
import { getPricing } from "@/lib/data/portal";
import { documentKindLabel, formatDate, inr, titleCase } from "@/lib/format";
import { estimate } from "@/lib/pricing";
import { getOpsDocumentUrl, setEmployeeStatus, setEmployeeTask, uploadEmployeeDocument, verifyDocument } from "../../actions";
import { UploadDocument } from "@/app/app/onboarding/upload-document";

const statuses = ["requested", "estimate_sent", "estimate_approved", "offer_pending", "contract_sent", "active", "offboarding", "exited", "withdrawn"];

export const metadata = { title: "Employee" };

export default function OpsEmployeePage({ params }: PageProps<"/ops/employees/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      {params.then(({ id }) => (
        <Content id={id} />
      ))}
    </Suspense>
  );
}

async function Content({ id }: { id: string }) {
  await requireOps();
  const { employee, tasks, documents } = await getEmployeeForOps(id);
  if (!employee) notFound();
  const config = await getPricing(employee.client_id);
  const est = estimate({ monthlyGross: Number(employee.monthly_gross) }, config);

  return (
    <>
      <PageHeader
        title={employee.full_name}
        subtitle={
          <>
            <Link href={`/ops/clients/${employee.client_id}`}>{employee.clients?.name}</Link> · {employee.job_title} · {[employee.location_city, employee.location_state].filter(Boolean).join(", ")} · starts {formatDate(employee.start_date)}
          </>
        }
        actions={
          <ActionSelect
            label="Employee status"
            value={employee.status}
            options={statuses}
            action={async (v) => {
              "use server";
              await setEmployeeStatus(employee.id, employee.client_id, v);
            }}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Onboarding tasks">
          {tasks.length === 0 ? (
            <Empty>No tasks.</Empty>
          ) : (
            tasks.map((t) => (
              <Row key={t.id}>
                <div>
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-[13px] text-ink-muted">
                    Owner: {t.owner === "ops" ? "SetMyCompany" : titleCase(t.owner)}
                    {t.status === "done" ? ` · done ${formatDate(t.completed_at)}` : ""}
                  </div>
                </div>
                <ActionSelect
                  label={`Status for ${t.label}`}
                  value={t.status}
                  options={["pending", "in_progress", "done", "blocked"]}
                  action={async (v) => {
                    "use server";
                    await setEmployeeTask(t.id, employee.id, employee.client_id, v as "pending" | "in_progress" | "done" | "blocked");
                  }}
                />
              </Row>
            ))
          )}
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card title="Cost at contracted rates">
            <Table head={[]}>
              {est.lines.map((l) => (
                <tr key={l.key}>
                  <td className={`td ${l.key === "monthly" ? "font-semibold" : "text-ink-muted"}`}>{l.label}</td>
                  <td className={`td text-right tabular-nums ${l.key === "monthly" ? "font-semibold" : ""}`}>{inr(l.amount)}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card
            title="Documents"
            action={<UploadDocument employeeId={employee.id} employeeKinds={[{ value: "offer_letter", label: "Offer letter" }, { value: "employment_contract", label: "Employment contract" }, { value: "other", label: "Other" }]} action={uploadEmployeeDocument} label="Issue document" />}
          >
            {documents.length === 0 ? (
              <Empty>Nothing uploaded yet.</Empty>
            ) : (
              documents.map((doc) => (
                <Row key={doc.id}>
                  <div>
                    <div className="text-sm font-medium">{doc.name}</div>
                    <div className="text-[13px] text-ink-muted">{documentKindLabel(doc.kind)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={doc.status} />
                    <OpenFileButton
                      action={async () => {
                        "use server";
                        return getOpsDocumentUrl(doc.id);
                      }}
                    >
                      Open
                    </OpenFileButton>
                    {doc.status === "uploaded" && (
                      <ActionButton
                        primary
                        action={async () => {
                          "use server";
                          await verifyDocument(doc.id, employee.client_id, "verified");
                        }}
                      >
                        Verify
                      </ActionButton>
                    )}
                  </div>
                </Row>
              ))
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
