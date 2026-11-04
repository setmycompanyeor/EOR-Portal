import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Approval, Asset, Client, DepositBalance, DepositEntry, Document, Employee, EmployeeTask, Invoice, OnboardingStep, OpsTask, Profile,
  Quote, QuoteLine, Request, Shipment, ShipmentEvent,
} from "@/lib/types";

export type OpsTaskRow = OpsTask & { clients: { name: string } | null; owner: { full_name: string } | null };

export async function getOpsTasks(opts: { status?: "open" | "done"; type?: string } = {}) {
  const sb = await createClient();
  let q = sb.from("ops_tasks").select("*, clients(name), owner:owner_id(full_name)");
  q = opts.status === "done" ? q.eq("status", "done") : q.neq("status", "done");
  if (opts.type) q = q.eq("type", opts.type);
  const { data } = await q.order("due_date", { ascending: true, nullsFirst: false }).order("created_at");
  return (data ?? []) as OpsTaskRow[];
}

export async function getOpsStaff() {
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("*").in("role", ["ops_admin", "ops_staff"]).order("full_name");
  return (data ?? []) as Profile[];
}

export type ClientSummary = Client & {
  employees: { count: number }[];
  deposit: DepositBalance | null;
  account_manager: { full_name: string } | null;
};

export async function getClientsOverview() {
  const sb = await createClient();
  const [{ data: clients }, { data: balances }, { data: employees }, { data: invoices }] = await Promise.all([
    sb.from("clients").select("*, account_manager:account_manager_id(full_name)").order("name"),
    sb.from("deposit_balances").select("*"),
    sb.from("employees").select("client_id, status"),
    sb.from("invoices").select("client_id, total, status, due_date").in("status", ["sent", "overdue"]),
  ]);
  const bal = new Map((balances ?? []).map((b) => [b.client_id as string, { held: Number(b.held), required: Number(b.required) }]));
  return ((clients ?? []) as (Client & { account_manager: { full_name: string } | null })[]).map((c) => {
    const emps = (employees ?? []).filter((e) => e.client_id === c.id);
    const inv = (invoices ?? []).filter((i) => i.client_id === c.id);
    return {
      ...c,
      active: emps.filter((e) => e.status === "active").length,
      joining: emps.filter((e) => !["active", "exited", "withdrawn", "offboarding"].includes(e.status as string)).length,
      deposit: bal.get(c.id) ?? { held: 0, required: 0 },
      unpaid: inv.reduce((s, i) => s + Number(i.total), 0),
      nextDue: inv.map((i) => i.due_date as string).sort()[0] ?? null,
    };
  });
}

export async function getClientDetail(id: string) {
  const sb = await createClient();
  const [client, steps, docs, employees, users, entries, balance, invoices, requests, shipments, assets] = await Promise.all([
    sb.from("clients").select("*").eq("id", id).single(),
    sb.from("client_onboarding_steps").select("*").eq("client_id", id).order("sort"),
    sb.from("documents").select("*").eq("client_id", id).order("created_at"),
    sb.from("employees").select("*").eq("client_id", id).order("created_at"),
    sb.from("profiles").select("*").eq("client_id", id).order("created_at"),
    sb.from("deposit_entries").select("*").eq("client_id", id).order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
    sb.from("deposit_balances").select("*").eq("client_id", id).maybeSingle(),
    sb.from("invoices").select("*").eq("client_id", id).order("issue_date", { ascending: false }),
    sb.from("requests").select("*, quotes(*)").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("shipments").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("assets").select("*").eq("client_id", id).order("tag"),
  ]);
  return {
    client: client.data as Client | null,
    steps: (steps.data ?? []) as OnboardingStep[],
    documents: (docs.data ?? []) as Document[],
    employees: (employees.data ?? []) as Employee[],
    users: (users.data ?? []) as Profile[],
    entries: (entries.data ?? []) as DepositEntry[],
    balance: { client_id: id, held: Number(balance.data?.held ?? 0), required: Number(balance.data?.required ?? 0) } as DepositBalance,
    invoices: (invoices.data ?? []) as Invoice[],
    requests: (requests.data ?? []) as (Request & { quotes: Quote[] })[],
    shipments: (shipments.data ?? []) as Shipment[],
    assets: (assets.data ?? []) as Asset[],
  };
}

export async function getAllEmployees() {
  const sb = await createClient();
  const { data } = await sb.from("employees").select("*, clients(name)").order("created_at", { ascending: false });
  return (data ?? []) as (Employee & { clients: { name: string } | null })[];
}

export async function getEmployeeForOps(id: string) {
  const sb = await createClient();
  const [{ data: employee }, { data: tasks }, { data: docs }] = await Promise.all([
    sb.from("employees").select("*, clients(name)").eq("id", id).single(),
    sb.from("employee_onboarding_tasks").select("*").eq("employee_id", id).order("sort"),
    sb.from("documents").select("*").eq("employee_id", id).order("created_at"),
  ]);
  return {
    employee: employee as (Employee & { clients: { name: string } | null }) | null,
    tasks: (tasks ?? []) as EmployeeTask[],
    documents: (docs ?? []) as Document[],
  };
}

export async function getAllInvoices() {
  const sb = await createClient();
  const { data } = await sb.from("invoices").select("*, clients(name)").order("issue_date", { ascending: false });
  return (data ?? []) as (Invoice & { clients: { name: string } | null })[];
}

export async function getAllRequests() {
  const sb = await createClient();
  const { data } = await sb.from("requests").select("*, clients(name), employees(full_name), quotes(*)").order("created_at", { ascending: false });
  return (data ?? []) as (Request & { clients: { name: string } | null; employees: { full_name: string } | null; quotes: Quote[] })[];
}

export async function getRequestForOps(id: string) {
  const sb = await createClient();
  const { data } = await sb
    .from("requests")
    .select("*, clients(name), employees(full_name), quotes(*, quote_lines(*))")
    .eq("id", id)
    .single();
  return data as
    | (Request & { clients: { name: string } | null; employees: { full_name: string } | null; quotes: (Quote & { quote_lines: QuoteLine[] })[] })
    | null;
}

export async function getAllShipments() {
  const sb = await createClient();
  const { data } = await sb
    .from("shipments")
    .select("*, clients(name), employees(full_name), assets(tag, model), shipment_events(*)")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as (Shipment & { clients: { name: string } | null; employees: { full_name: string } | null; assets: { tag: string; model: string } | null; shipment_events: ShipmentEvent[] })[];
  for (const s of rows) s.shipment_events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return rows;
}

export async function getAllAssets() {
  const sb = await createClient();
  const { data } = await sb.from("assets").select("*, clients(name), employees:holder_employee_id(full_name)").order("tag");
  return (data ?? []) as (Asset & { clients: { name: string } | null; employees: { full_name: string } | null })[];
}

export async function getClientPricingRow(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("pricing_configs").select("*").eq("client_id", clientId).order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function getAllApprovals() {
  const sb = await createClient();
  const { data } = await sb.from("approvals").select("*, clients(name), employees(full_name)").order("created_at", { ascending: false });
  return (data ?? []) as (Approval & { clients: { name: string } | null; employees: { full_name: string } | null })[];
}

export async function getGlobalPricingRow() {
  const sb = await createClient();
  const { data } = await sb.from("pricing_configs").select("*").is("client_id", null).maybeSingle();
  return data as Record<string, unknown> | null;
}
