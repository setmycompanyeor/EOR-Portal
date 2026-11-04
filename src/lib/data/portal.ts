import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Activity, Approval, Asset, Client, DepositBalance, DepositEntry, Document, Employee, EmployeeTask, Invoice, InvoiceLine,
  OnboardingStep, Profile, Quote, QuoteLine, Request, Shipment, ShipmentEvent,
} from "@/lib/types";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

// All reads are scoped by RLS to the signed-in user's client; clientId is passed
// explicitly so queries stay cheap and intent is visible.

export async function getClient(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("clients").select("*").eq("id", clientId).single();
  return data as Client | null;
}

export async function getClientUsers(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("*").eq("client_id", clientId).order("created_at");
  return (data ?? []) as Profile[];
}

export async function getOnboardingSteps(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("client_onboarding_steps").select("*").eq("client_id", clientId).order("sort");
  return (data ?? []) as OnboardingStep[];
}

export async function getClientDocuments(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("documents").select("*").eq("client_id", clientId).is("employee_id", null).order("created_at");
  return (data ?? []) as Document[];
}

export async function getEmployees(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("employees").select("*").eq("client_id", clientId).order("start_date", { ascending: true, nullsFirst: false });
  return (data ?? []) as Employee[];
}

export async function getEmployee(clientId: string, id: string) {
  const sb = await createClient();
  const [{ data: employee }, { data: tasks }, { data: docs }] = await Promise.all([
    sb.from("employees").select("*").eq("client_id", clientId).eq("id", id).single(),
    sb.from("employee_onboarding_tasks").select("*").eq("employee_id", id).order("sort"),
    sb.from("documents").select("*").eq("employee_id", id).order("created_at"),
  ]);
  return { employee: employee as Employee | null, tasks: (tasks ?? []) as EmployeeTask[], documents: (docs ?? []) as Document[] };
}

export async function getEmployeeTasksForClient(clientId: string) {
  const sb = await createClient();
  const { data } = await sb
    .from("employee_onboarding_tasks")
    .select("*, employees!inner(id, full_name, client_id)")
    .eq("employees.client_id", clientId)
    .neq("status", "done")
    .order("sort");
  return (data ?? []) as (EmployeeTask & { employees: { id: string; full_name: string } })[];
}

export async function getPricing(clientId: string | null): Promise<PricingConfig> {
  const sb = await createClient();
  let row: Record<string, unknown> | null = null;
  if (clientId) {
    const { data } = await sb.from("pricing_configs").select("*").eq("client_id", clientId).order("effective_from", { ascending: false }).limit(1).maybeSingle();
    row = data;
  }
  if (!row) {
    const { data } = await sb.from("pricing_configs").select("*").is("client_id", null).maybeSingle();
    row = data;
  }
  if (!row) return DEFAULT_PRICING;
  return {
    fee_per_employee: Number(row.fee_per_employee),
    fee_percent: Number(row.fee_percent),
    insurance_per_month: Number(row.insurance_per_month),
    gst_rate: Number(row.gst_rate),
    gst_on_full_invoice: Boolean(row.gst_on_full_invoice),
    deposit_months: Number(row.deposit_months),
    basic_percent: Number(row.basic_percent),
    pf_wage_cap: Number(row.pf_wage_cap),
    pf_on_full_basic: Boolean(row.pf_on_full_basic),
    esi_wage_ceiling: Number(row.esi_wage_ceiling),
  };
}

export async function getDepositBalance(clientId: string): Promise<DepositBalance> {
  const sb = await createClient();
  const { data } = await sb.from("deposit_balances").select("*").eq("client_id", clientId).maybeSingle();
  return { client_id: clientId, held: Number(data?.held ?? 0), required: Number(data?.required ?? 0) };
}

export async function getDepositEntries(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("deposit_entries").select("*").eq("client_id", clientId).order("entry_date").order("created_at");
  return (data ?? []) as DepositEntry[];
}

export async function getInvoices(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("invoices").select("*").eq("client_id", clientId).neq("status", "draft").order("issue_date", { ascending: false });
  return (data ?? []) as Invoice[];
}

export async function getInvoice(clientId: string, id: string) {
  const sb = await createClient();
  const [{ data: invoice }, { data: lines }] = await Promise.all([
    sb.from("invoices").select("*").eq("client_id", clientId).eq("id", id).single(),
    sb.from("invoice_lines").select("*").eq("invoice_id", id).order("sort"),
  ]);
  return { invoice: invoice as Invoice | null, lines: (lines ?? []) as InvoiceLine[] };
}

export async function getNextInvoice(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("invoices").select("*").eq("client_id", clientId).in("status", ["sent", "overdue"]).order("due_date").limit(1).maybeSingle();
  return data as Invoice | null;
}

export type RequestWithQuote = Request & { employees: { full_name: string } | null; quotes: Quote[] };

export async function getRequests(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("requests").select("*, employees(full_name), quotes(*)").eq("client_id", clientId).order("created_at", { ascending: false });
  return (data ?? []) as RequestWithQuote[];
}

export async function getRequest(clientId: string, id: string) {
  const sb = await createClient();
  const { data } = await sb.from("requests").select("*, employees(full_name), quotes(*, quote_lines(*))").eq("client_id", clientId).eq("id", id).single();
  return data as (Request & { employees: { full_name: string } | null; quotes: (Quote & { quote_lines: QuoteLine[] })[] }) | null;
}

export type ShipmentWithEvents = Shipment & { employees: { full_name: string } | null; shipment_events: ShipmentEvent[]; assets: { tag: string; model: string } | null };

export async function getShipments(clientId: string) {
  const sb = await createClient();
  const { data } = await sb
    .from("shipments")
    .select("*, employees(full_name), assets(tag, model), shipment_events(*)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as ShipmentWithEvents[];
  for (const s of rows) s.shipment_events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return rows;
}

export async function getAssets(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("assets").select("*, employees:holder_employee_id(full_name)").eq("client_id", clientId).order("tag");
  return (data ?? []) as (Asset & { employees: { full_name: string } | null })[];
}

export type ApprovalRow = Approval & { employees: { full_name: string } | null };

export async function getApprovals(clientId: string) {
  const sb = await createClient();
  const { data } = await sb.from("approvals").select("*, employees(full_name)").eq("client_id", clientId).order("created_at", { ascending: false });
  return (data ?? []) as ApprovalRow[];
}

export async function getActivity(clientId: string, limit = 8) {
  const sb = await createClient();
  const { data } = await sb.from("activity_log").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as Activity[];
}
