import { Suspense } from "react";
import { Badge, Card, Empty, PageHeader, Kpi, Skeleton, Table } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireClient } from "@/lib/auth";
import { getClient, getDepositBalance, getDepositEntries, getEmployees, getInvoices, getPricing } from "@/lib/data/portal";
import { formatDate, formatMonth, inr, relativeDue, titleCase } from "@/lib/format";
import { estimate } from "@/lib/pricing";
import { BillingTabs } from "./tabs";

export const metadata = { title: "Deposit & billing" };

export default function BillingPage() {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const { clientId } = await requireClient();
  const [client, balance, entries, invoices, employees, config] = await Promise.all([
    getClient(clientId),
    getDepositBalance(clientId),
    getDepositEntries(clientId),
    getInvoices(clientId),
    getEmployees(clientId),
    getPricing(clientId),
  ]);
  const active = employees.filter((e) => e.status === "active");
  const perEmp = active.map((e) => estimate({ monthlyGross: Number(e.monthly_gross) }, config).perEmployee);
  const gross = perEmp.reduce((s, p) => s + p.gross, 0);
  const statutory = perEmp.reduce((s, p) => s + p.pf + p.esi + p.gratuity + p.insurance, 0);
  const fees = perEmp.reduce((s, p) => s + p.fee + p.gst, 0);
  const monthly = gross + statutory + fees;
  const shortfall = Math.max(0, balance.required - balance.held);
  const pct = balance.required > 0 ? Math.min(100, (balance.held / balance.required) * 100) : 100;
  const topUp = entries.filter((e) => e.kind === "required_revised").sort((a, b) => b.entry_date.localeCompare(a.entry_date))[0];

  return (
    <>
      <PageHeader
        title="Deposit & billing"
        subtitle={client?.zoho_contact_id ? "Invoices and payments sync from Zoho Books" : "Invoices are issued by SetMyCompany and appear here when sent"}
        actions={shortfall > 0 && <Badge tone="amber">Top-up of {inr(shortfall)} requested</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Deposit required" value={inr(balance.required)} hint={`${config.deposit_months} × monthly invoice`} />
        <Kpi
          label="Deposit held"
          value={inr(balance.held)}
          hint={
            <span className="flex flex-col gap-1.5">
              <span className="h-2.5 overflow-hidden rounded-md bg-gray-soft" aria-hidden="true">
                <span className="block h-full rounded-md bg-brand" style={{ width: `${pct}%` }} />
              </span>
              {pct.toFixed(1)}% funded
            </span>
          }
        />
        <Kpi label="Shortfall" value={inr(shortfall)} tone={shortfall > 0 ? "amber" : undefined} hint={shortfall > 0 && topUp ? `Requested ${formatDate(topUp.entry_date)}` : "Fully funded"} />
      </div>

      <Card title="How the deposit is calculated" action={<span className="text-[13px] text-ink-muted">Recalculated whenever headcount or salaries change</span>}>
        <Table head={["Component", "Monthly", "Basis"]}>
          <tr>
            <td className="td">Gross salaries, {active.length} active employee{active.length === 1 ? "" : "s"}</td>
            <td className="td text-right tabular-nums">{inr(gross)}</td>
            <td className="td text-ink-muted">{active.map((e) => e.full_name.split(" ")[0]).join(", ") || "—"}</td>
          </tr>
          <tr>
            <td className="td">Employer PF, ESI, gratuity accrual, insurance</td>
            <td className="td text-right tabular-nums">{inr(statutory)}</td>
            <td className="td text-ink-muted">Statutory + group health cover</td>
          </tr>
          <tr>
            <td className="td">Management fee + GST</td>
            <td className="td text-right tabular-nums">{inr(fees)}</td>
            <td className="td text-ink-muted">
              {inr(config.fee_per_employee)} × {active.length} + {config.gst_rate}% GST
            </td>
          </tr>
          <tr>
            <td className="td font-semibold">Monthly invoice</td>
            <td className="td text-right font-semibold tabular-nums">{inr(monthly)}</td>
            <td className="td text-ink-muted">
              × {config.deposit_months} months = {inr(monthly * config.deposit_months)} deposit
            </td>
          </tr>
        </Table>
      </Card>

      <Card>
        <BillingTabs
          invoices={
            invoices.length === 0 ? (
              <Empty>No invoices yet.</Empty>
            ) : (
              <Table head={["Invoice", "Period", "Issued", "Due", "Amount", "Status"]}>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="td font-medium">{i.number}</td>
                    <td className="td">{i.kind === "monthly" && i.period_start ? formatMonth(i.period_start) : titleCase(i.kind)}</td>
                    <td className="td">{formatDate(i.issue_date)}</td>
                    <td className="td">{formatDate(i.due_date)}</td>
                    <td className="td text-right tabular-nums">{inr(i.total)}</td>
                    <td className="td">
                      <StatusBadge status={i.status} label={i.status === "paid" ? `Paid ${formatDate(i.paid_at)}` : i.status === "sent" ? relativeDue(i.due_date).label : undefined} />
                    </td>
                  </tr>
                ))}
              </Table>
            )
          }
          ledger={
            entries.length === 0 ? (
              <Empty>No deposit movements yet.</Empty>
            ) : (
              <Table head={["Date", "Entry", "Movement", "Required"]}>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="td whitespace-nowrap">{formatDate(e.entry_date)}</td>
                    <td className="td">
                      <div className="font-medium">{e.note ?? titleCase(e.kind)}</div>
                      {e.reference && <div className="text-[13px] text-ink-muted">Ref {e.reference}</div>}
                    </td>
                    <td className="td text-right tabular-nums">{e.kind === "received" ? `+${inr(e.amount)}` : e.kind === "refund" ? `-${inr(e.amount)}` : e.kind === "adjustment" ? inr(e.amount) : ""}</td>
                    <td className="td text-right tabular-nums text-ink-muted">{e.required_amount != null ? inr(e.required_amount) : ""}</td>
                  </tr>
                ))}
              </Table>
            )
          }
        />
      </Card>
    </>
  );
}
