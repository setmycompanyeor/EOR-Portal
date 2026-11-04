import { Suspense } from "react";
import Link from "next/link";
import { Badge, Card, Empty, Kpi, PageHeader, Skeleton, Table } from "@/components/ui";
import { ActionSelect } from "@/components/action-controls";
import { requireOps } from "@/lib/auth";
import { getClientsOverview, getOpsStaff, getOpsTasks } from "@/lib/data/ops";
import { createClient } from "@/lib/supabase/server";
import { formatDate, inr, relativeDue, titleCase } from "@/lib/format";
import { assignTask, setTaskStatus } from "./actions";
import { NewTaskForm } from "./new-task-form";

export const metadata = { title: "Work queue" };

const types = ["all", "onboarding", "quote", "shipment", "deposit", "invoice", "compliance", "payroll", "offboarding", "other"];
const typeTone: Record<string, "blue" | "green" | "amber" | "red" | "purple" | "gray"> = {
  onboarding: "purple", quote: "green", shipment: "blue", deposit: "amber", invoice: "amber", compliance: "red", payroll: "gray", offboarding: "gray", other: "gray",
};

export default function OpsHome({ searchParams }: PageProps<"/ops">) {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      {searchParams.then((sp) => (
        <Content type={typeof sp.type === "string" ? sp.type : "all"} />
      ))}
    </Suspense>
  );
}

async function Content({ type }: { type: string }) {
  const { userId } = await requireOps();
  const sb = await createClient();
  const [tasks, staff, clients, { count: employeesOnPayroll }, { data: unpaid }] = await Promise.all([
    getOpsTasks({ type: type === "all" ? undefined : type }),
    getOpsStaff(),
    getClientsOverview(),
    sb.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    sb.from("invoices").select("total, status").in("status", ["sent", "overdue"]),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = tasks.filter((t) => t.due_date && t.due_date <= today);
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today);
  const unpaidTotal = (unpaid ?? []).reduce((s, i) => s + Number(i.total), 0);
  const short = clients.filter((c) => c.deposit.required > c.deposit.held);
  const staffIds = ["unassigned", ...staff.map((s) => s.id)];
  const staffLabel = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? "Unassigned";

  return (
    <>
      <PageHeader
        title="Work queue"
        subtitle={`Everything waiting on the EOR Hub team, across all clients · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}`}
        actions={<NewTaskForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Due today" value={dueToday.length} hint={overdue.length ? `${overdue.length} overdue` : "None overdue"} tone={overdue.length ? "red" : undefined} />
        <Kpi label="Active clients" value={clients.filter((c) => c.status === "active").length} hint={`${clients.filter((c) => c.status === "onboarding").length} in onboarding`} />
        <Kpi label="Employees on payroll" value={employeesOnPayroll ?? 0} hint={`+${clients.reduce((s, c) => s + c.joining, 0)} joining`} />
        <Kpi label="Invoices unpaid" value={inr(unpaidTotal, { compact: true })} hint={`${unpaid?.length ?? 0} invoices · ${(unpaid ?? []).filter((i) => i.status === "overdue").length} overdue`} />
        <Kpi label="Deposits short" value={short.length} hint={short.map((c) => c.name).join(", ") || "All funded"} tone={short.length ? "amber" : undefined} />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          {types.map((t) => (
            <Link key={t} href={t === "all" ? "/ops" : `/ops?type=${t}`} className={`btn btn-sm rounded-full ${t === type ? "bg-ops-navy border-ops-navy text-white hover:bg-ops-navy" : ""}`}>
              {titleCase(t)}
            </Link>
          ))}
        </div>
        {tasks.length === 0 ? (
          <Empty>Queue is clear.</Empty>
        ) : (
          <Table head={["Task", "Type", "Client", "Owner", "Due", "Status"]}>
            {tasks.map((t) => {
              const due = relativeDue(t.due_date);
              const link = t.link_table === "requests" ? `/ops/requests/${t.link_id}` : t.link_table === "employees" ? `/ops/employees/${t.link_id}` : t.client_id ? `/ops/clients/${t.client_id}` : null;
              return (
                <tr key={t.id}>
                  <td className="td">
                    <div className="font-medium">{link ? <Link href={link}>{t.title}</Link> : t.title}</div>
                    {t.detail && <div className="text-[13px] text-ink-muted">{t.detail}</div>}
                  </td>
                  <td className="td">
                    <Badge tone={typeTone[t.type] ?? "gray"}>{titleCase(t.type)}</Badge>
                  </td>
                  <td className="td">{t.clients?.name ?? "All clients"}</td>
                  <td className="td">
                    <ActionSelect
                      label={`Owner for ${t.title}`}
                      value={t.owner_id ?? "unassigned"}
                      options={staffIds}
                      action={async (v) => {
                        "use server";
                        await assignTask(t.id, v === "unassigned" ? null : v);
                      }}
                    />
                    <div className="mt-1 text-[12px] text-ink-muted">{t.owner_id === userId ? "You" : staffLabel(t.owner_id)}</div>
                  </td>
                  <td className="td whitespace-nowrap">
                    <Badge tone={due.tone}>{due.label}</Badge>
                    {t.due_date && <div className="mt-1 text-[12px] text-ink-muted">{formatDate(t.due_date)}</div>}
                  </td>
                  <td className="td">
                    <ActionSelect
                      label={`Status for ${t.title}`}
                      value={t.status}
                      options={["open", "in_progress", "blocked", "done"]}
                      action={async (v) => {
                        "use server";
                        await setTaskStatus(t.id, v as "open" | "in_progress" | "blocked" | "done");
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="Clients" action={<Link href="/ops/clients" className="btn btn-sm">All clients</Link>}>
        <Table head={["Client", "Country", "Headcount", "Unpaid", "Deposit", "Account manager", "Status"]}>
          {clients.map((c) => {
            const pct = c.deposit.required > 0 ? (c.deposit.held / c.deposit.required) * 100 : 100;
            return (
              <tr key={c.id}>
                <td className="td font-medium">
                  <Link href={`/ops/clients/${c.id}`}>{c.name}</Link>
                </td>
                <td className="td">{c.country}</td>
                <td className="td">
                  {c.active}
                  {c.joining ? ` + ${c.joining} joining` : ""}
                </td>
                <td className="td tabular-nums">{c.unpaid ? inr(c.unpaid) : "—"}</td>
                <td className="td">
                  {c.deposit.required === 0 ? <Badge tone="gray">Not set</Badge> : pct >= 100 ? <Badge tone="green">Funded</Badge> : <Badge tone="amber">{pct.toFixed(0)}% funded</Badge>}
                </td>
                <td className="td">{c.account_manager?.full_name ?? "—"}</td>
                <td className="td">
                  <Badge tone={c.status === "active" ? "green" : c.status === "onboarding" ? "blue" : "gray"}>{titleCase(c.status)}</Badge>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
