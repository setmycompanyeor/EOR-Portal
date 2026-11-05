import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Empty, Kpi, PageHeader, Row, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { ActionButton, ActionSelect, OpenFileButton } from "@/components/action-controls";
import { requireOps } from "@/lib/auth";
import { getClientDetail, getClientPricingRow, getGlobalPricingRow } from "@/lib/data/ops";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { PricingForm } from "@/app/ops/pricing/pricing-form";
import { documentKindLabel, formatDate, formatMonth, inr, titleCase, toDateInput } from "@/lib/format";
import { getInvoicePdfUrlOps, getOpsDocumentUrl, recomputeDepositRequirement, setClientPricing, setClientStatus, setInvoiceStatus, setStepStatus, verifyDocument } from "../../actions";
import { DepositEntryForm, MonthlyInvoiceForm } from "./forms";
import { RecordInvoiceForm } from "./record-invoice-form";

export const metadata = { title: "Client" };

export default function ClientPage({ params }: PageProps<"/ops/clients/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      {params.then(({ id }) => (
        <Content id={id} />
      ))}
    </Suspense>
  );
}

async function Content({ id }: { id: string }) {
  await requireOps();
  const [d, clientPricing, globalPricing] = await Promise.all([getClientDetail(id), getClientPricingRow(id), getGlobalPricingRow()]);
  if (!d.client) notFound();
  const pricingRow = clientPricing ?? globalPricing;
  const pricingValues = {
    fee_per_employee: Number(pricingRow?.fee_per_employee ?? DEFAULT_PRICING.fee_per_employee),
    fee_percent: Number(pricingRow?.fee_percent ?? DEFAULT_PRICING.fee_percent),
    insurance_per_month: Number(pricingRow?.insurance_per_month ?? DEFAULT_PRICING.insurance_per_month),
    gst_rate: Number(pricingRow?.gst_rate ?? DEFAULT_PRICING.gst_rate),
    deposit_months: Number(pricingRow?.deposit_months ?? DEFAULT_PRICING.deposit_months),
    basic_percent: Number(pricingRow?.basic_percent ?? DEFAULT_PRICING.basic_percent),
    pf_wage_cap: Number(pricingRow?.pf_wage_cap ?? DEFAULT_PRICING.pf_wage_cap),
    esi_wage_ceiling: Number(pricingRow?.esi_wage_ceiling ?? DEFAULT_PRICING.esi_wage_ceiling),
    gst_on_full_invoice: Boolean(pricingRow?.gst_on_full_invoice ?? DEFAULT_PRICING.gst_on_full_invoice),
    pf_on_full_basic: Boolean(pricingRow?.pf_on_full_basic ?? DEFAULT_PRICING.pf_on_full_basic),
  };
  const c = d.client;
  const shortfall = Math.max(0, d.balance.required - d.balance.held);
  const unpaid = d.invoices.filter((i) => ["sent", "overdue"].includes(i.status));
  const now = new Date();
  const today = toDateInput(now);
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={`${c.legal_name ?? c.name} · ${c.country} · client since ${formatDate(c.created_at)}`}
        actions={
          <ActionSelect
            label="Client status"
            value={c.status}
            options={["onboarding", "active", "suspended", "closed"]}
            action={async (v) => {
              "use server";
              await setClientStatus(c.id, v as "onboarding" | "active" | "suspended" | "closed");
            }}
          />
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Active employees" value={d.employees.filter((e) => e.status === "active").length} hint={`${d.employees.length} total`} />
        <Kpi label="Deposit held" value={inr(d.balance.held)} hint={`required ${inr(d.balance.required)}`} />
        <Kpi label="Shortfall" value={inr(shortfall)} tone={shortfall > 0 ? "amber" : undefined} hint={shortfall > 0 ? "Top-up needed" : "Funded"} />
        <Kpi label="Unpaid invoices" value={inr(unpaid.reduce((s, i) => s + Number(i.total), 0))} hint={`${unpaid.length} open`} />
      </div>

      <Card
        title="Contracted pricing"
        action={clientPricing ? <Badge tone="green">Client-specific rates since {formatDate(String(clientPricing.effective_from))}</Badge> : <Badge tone="amber">Using global defaults</Badge>}
      >
        <p className="mb-3 text-[13px] text-ink-muted">
          These rates drive this client&apos;s estimator, hire estimates, monthly invoices and deposit requirement. Saving adds a new rate card effective today; earlier invoices are unchanged.
        </p>
        <PricingForm values={pricingValues} readOnly={false} action={setClientPricing} clientId={c.id} submitLabel="Save client pricing" compact />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Onboarding steps">
          {d.steps.map((s) => (
            <Row key={s.id}>
              <div>
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-[13px] text-ink-muted">{s.status === "done" ? `Done ${formatDate(s.completed_at)}` : s.note ?? ""}</div>
              </div>
              <ActionSelect
                label={`Status for ${s.label}`}
                value={s.status}
                options={["pending", "in_progress", "done", "blocked"]}
                action={async (v) => {
                  "use server";
                  await setStepStatus(s.id, c.id, v as "pending" | "in_progress" | "done" | "blocked", s.note ?? undefined);
                }}
              />
            </Row>
          ))}
        </Card>

        <Card title="Documents to verify">
          {d.documents.length === 0 ? (
            <Empty>Nothing uploaded yet.</Empty>
          ) : (
            d.documents.map((doc) => (
              <Row key={doc.id}>
                <div>
                  <div className="text-sm font-medium">{doc.name}</div>
                  <div className="text-[13px] text-ink-muted">
                    {documentKindLabel(doc.kind)} · {formatDate(doc.created_at)} {doc.employee_id ? "· employee document" : ""}
                  </div>
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
                    <>
                      <ActionButton
                        primary
                        action={async () => {
                          "use server";
                          await verifyDocument(doc.id, c.id, "verified");
                        }}
                      >
                        Verify
                      </ActionButton>
                      <ActionButton
                        danger
                        action={async () => {
                          "use server";
                          await verifyDocument(doc.id, c.id, "rejected");
                        }}
                      >
                        Reject
                      </ActionButton>
                    </>
                  )}
                </div>
              </Row>
            ))
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Deposit ledger"
          action={
            <ActionButton
              action={async () => {
                "use server";
                await recomputeDepositRequirement(c.id);
              }}
            >
              Recompute requirement
            </ActionButton>
          }
        >
          <DepositEntryForm clientId={c.id} today={today} />
          <div className="mt-3">
            {d.entries.length === 0 ? (
              <Empty>No entries.</Empty>
            ) : (
              <Table head={["Date", "Entry", "Amount", "Required"]}>
                {d.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="td whitespace-nowrap">{formatDate(e.entry_date)}</td>
                    <td className="td">
                      {e.note ?? titleCase(e.kind)}
                      {e.reference && <div className="text-[12px] text-ink-muted">Ref {e.reference}</div>}
                    </td>
                    <td className="td text-right tabular-nums">{e.kind === "required_revised" ? "" : inr(e.amount)}</td>
                    <td className="td text-right tabular-nums text-ink-muted">{e.required_amount != null ? inr(e.required_amount) : ""}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </Card>

        <Card title="Invoices">
          <p className="mb-2 text-[13px] text-ink-muted">Invoices are raised in Zoho Books. Prepare a draft here to get the payroll lines and total, raise it in Zoho, then record the Zoho invoice with its PDF.</p>
          <MonthlyInvoiceForm clientId={c.id} period={period} />
          <div className="mt-2">
            <RecordInvoiceForm
              clientId={c.id}
              today={today}
              drafts={d.invoices
                .filter((i) => i.status === "draft")
                .map((i) => ({ id: i.id, label: `${i.number} · ${i.period_start ? formatMonth(i.period_start) : titleCase(i.kind)} · ₹${Number(i.total).toLocaleString("en-IN")}`, subtotal: Number(i.subtotal), gst: Number(i.gst), total: Number(i.total), period_start: i.period_start, period_end: i.period_end }))}
            />
          </div>
          <div className="mt-3">
            {d.invoices.length === 0 ? (
              <Empty>No invoices yet.</Empty>
            ) : (
              <Table head={["Invoice", "Issued", "Due", "Total", "Status"]}>
                {d.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="td font-medium">
                      {i.number}
                      <div className="text-[12px] text-ink-muted">
                        {i.kind === "monthly" && i.period_start ? formatMonth(i.period_start) : titleCase(i.kind)}
                        {i.pdf_path && (
                          <>
                            {" · "}
                            <OpenFileButton
                              action={async () => {
                                "use server";
                                return getInvoicePdfUrlOps(i.id);
                              }}
                            >
                              PDF
                            </OpenFileButton>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="td">{formatDate(i.issue_date)}</td>
                    <td className="td">{formatDate(i.due_date)}</td>
                    <td className="td text-right tabular-nums">{inr(i.total)}</td>
                    <td className="td">
                      <ActionSelect
                        label={`Status for ${i.number}`}
                        value={i.status}
                        options={["draft", "sent", "paid", "overdue", "void"]}
                        action={async (v) => {
                          "use server";
                          await setInvoiceStatus(i.id, c.id, v as "sent" | "paid" | "overdue" | "void");
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Employees">
          {d.employees.length === 0 ? (
            <Empty>No hires yet.</Empty>
          ) : (
            <Table head={["Employee", "Role", "Gross", "Start", "Status"]}>
              {d.employees.map((e) => (
                <tr key={e.id}>
                  <td className="td font-medium">
                    <Link href={`/ops/employees/${e.id}`}>{e.full_name}</Link>
                  </td>
                  <td className="td">{e.job_title}</td>
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

        <div className="flex flex-col gap-4">
          <Card title="Requests">
            {d.requests.length === 0 ? (
              <Empty>No requests.</Empty>
            ) : (
              d.requests.slice(0, 6).map((r) => (
                <Row key={r.id}>
                  <div>
                    <div className="text-sm font-medium">
                      <Link href={`/ops/requests/${r.id}`}>{r.title}</Link>
                    </div>
                    <div className="text-[13px] text-ink-muted">
                      {titleCase(r.category)} · {formatDate(r.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </Row>
              ))
            )}
          </Card>
          <Card title="Portal users">
            {d.users.map((u) => (
              <Row key={u.id}>
                <div>
                  <div className="text-sm font-medium">{u.full_name || u.email}</div>
                  <div className="text-[13px] text-ink-muted">{u.email}</div>
                </div>
                <Badge tone="gray">{titleCase(u.role.replace("client_", ""))}</Badge>
              </Row>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
