"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOps } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricing } from "@/lib/data/portal";
import { estimate } from "@/lib/pricing";

export type ActionState = { error?: string; message?: string };

async function log(clientId: string | null, actorId: string, verb: string, summary: string, subject?: { table: string; id: string }) {
  const sb = await createClient();
  await sb.from("activity_log").insert({ client_id: clientId, actor_id: actorId, verb, summary, subject_table: subject?.table ?? null, subject_id: subject?.id ?? null });
}

function revalidateClient(clientId: string | null) {
  revalidatePath("/ops");
  if (clientId) revalidatePath(`/ops/clients/${clientId}`);
  revalidatePath("/app");
  revalidatePath("/app/onboarding");
  revalidatePath("/app/billing");
  revalidatePath("/app/employees");
  revalidatePath("/app/requests");
  revalidatePath("/app/tracking");
}

// ---------------------------------------------------------------------------
// Work queue
// ---------------------------------------------------------------------------
export async function setTaskStatus(taskId: string, status: "open" | "in_progress" | "blocked" | "done") {
  await requireOps();
  const sb = await createClient();
  await sb.from("ops_tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", taskId);
  revalidatePath("/ops");
}

export async function assignTask(taskId: string, ownerId: string | null) {
  await requireOps();
  const sb = await createClient();
  await sb.from("ops_tasks").update({ owner_id: ownerId }).eq("id", taskId);
  revalidatePath("/ops");
}

const taskSchema = z.object({
  title: z.string().trim().min(3),
  type: z.enum(["onboarding", "quote", "shipment", "deposit", "invoice", "compliance", "payroll", "offboarding", "other"]),
  client_id: z.string().uuid().or(z.literal("")),
  due_date: z.string().or(z.literal("")),
  detail: z.string().trim().max(1000).optional(),
});

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;
  const sb = await createClient();
  const { error } = await sb.from("ops_tasks").insert({ title: d.title, type: d.type, client_id: d.client_id || null, due_date: d.due_date || null, detail: d.detail || null, owner_id: userId });
  if (error) return { error: error.message };
  revalidatePath("/ops");
  return { message: "Task added." };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const defaultSteps = [
  { key: "account_created", label: "Account created", sort: 1 },
  { key: "kyc", label: "Company KYC", sort: 2, note: "Incorporation, board resolution, signatory ID" },
  { key: "agreements", label: "MSA & DPA signed", sort: 3 },
  { key: "deposit", label: "Initial deposit", sort: 4 },
  { key: "first_hire", label: "First hire", sort: 5 },
];

const newClientSchema = z.object({
  name: z.string().trim().min(2, "Enter the client's name"),
  legal_name: z.string().trim().optional(),
  country: z.string().trim().min(2),
  admin_name: z.string().trim().min(2, "Enter the admin's name"),
  admin_email: z.string().trim().email("Enter a valid admin email"),
  finance_email: z.string().trim().email().or(z.literal("")),
});

export async function createClientAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = newClientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;

  const sb = await createClient();
  const { data: client, error } = await sb
    .from("clients")
    .insert({ name: d.name, legal_name: d.legal_name || d.name, country: d.country, finance_email: d.finance_email || null, account_manager_id: userId })
    .select("id")
    .single();
  if (error || !client) return { error: error?.message ?? "Could not create client" };

  await sb.from("client_onboarding_steps").insert(
    defaultSteps.map((s) => ({ ...s, client_id: client.id, status: s.key === "account_created" ? "done" : s.key === "kyc" ? "in_progress" : "pending", completed_at: s.key === "account_created" ? new Date().toISOString() : null })),
  );

  const admin = createAdminClient();
  const { error: invErr } = await admin.auth.admin.inviteUserByEmail(d.admin_email, {
    data: { full_name: d.admin_name, client_id: client.id, role: "client_admin" },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/app/onboarding`,
  });
  await log(client.id, userId, "client.created", `Client created${invErr ? " (invite failed: " + invErr.message + ")" : `; invited ${d.admin_email}`}`);
  await sb.from("ops_tasks").insert({ client_id: client.id, type: "onboarding", title: `Verify KYC documents for ${d.name}`, due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), owner_id: userId });

  revalidatePath("/ops/clients");
  redirect(`/ops/clients/${client.id}`);
}

export async function setClientStatus(clientId: string, status: "onboarding" | "active" | "suspended" | "closed") {
  const { userId } = await requireOps();
  const sb = await createClient();
  await sb.from("clients").update({ status }).eq("id", clientId);
  await log(clientId, userId, "client.status", `Client marked ${status}`);
  revalidateClient(clientId);
}

export async function setStepStatus(stepId: string, clientId: string, status: "pending" | "in_progress" | "done" | "blocked", note?: string) {
  const { userId } = await requireOps();
  const sb = await createClient();
  const { data: step } = await sb
    .from("client_onboarding_steps")
    .update({ status, note: note ?? null, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", stepId)
    .select("label")
    .single();
  await log(clientId, userId, "onboarding.step", `${step?.label ?? "Step"}: ${status.replace("_", " ")}`);
  revalidateClient(clientId);
}

export async function verifyDocument(docId: string, clientId: string, status: "verified" | "rejected") {
  const { userId } = await requireOps();
  const sb = await createClient();
  const { data: doc } = await sb
    .from("documents")
    .update({ status, verified_by: userId, verified_at: new Date().toISOString() })
    .eq("id", docId)
    .select("name, employee_id")
    .single();
  await log(clientId, userId, `document.${status}`, `${doc?.name ?? "Document"} ${status}`);
  revalidateClient(clientId);
  if (doc?.employee_id) {
    revalidatePath(`/app/employees/${doc.employee_id}`);
    revalidatePath(`/ops/employees/${doc.employee_id}`);
  }
}

export async function getOpsDocumentUrl(documentId: string): Promise<string | null> {
  await requireOps();
  const sb = await createClient();
  const { data } = await sb.from("documents").select("storage_path").eq("id", documentId).single();
  if (!data?.storage_path) return null;
  const { data: signed } = await sb.storage.from("documents").createSignedUrl(data.storage_path, 60 * 10);
  return signed?.signedUrl ?? null;
}

// ---------------------------------------------------------------------------
// Deposits and invoices
// ---------------------------------------------------------------------------
const depositSchema = z.object({
  client_id: z.string().uuid(),
  kind: z.enum(["received", "refund", "required_revised", "adjustment"]),
  amount: z.coerce.number().min(0).optional(),
  required_amount: z.coerce.number().min(0).optional(),
  entry_date: z.string().min(1),
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export async function addDepositEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = depositSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;
  const sb = await createClient();
  const { error } = await sb.from("deposit_entries").insert({
    client_id: d.client_id,
    kind: d.kind,
    amount: d.kind === "required_revised" ? 0 : d.amount ?? 0,
    required_amount: d.kind === "required_revised" ? d.required_amount ?? 0 : null,
    entry_date: d.entry_date,
    reference: d.reference || null,
    note: d.note || null,
    created_by: userId,
  });
  if (error) return { error: error.message };
  await log(d.client_id, userId, "deposit.entry", d.kind === "received" ? `Deposit received ₹${(d.amount ?? 0).toLocaleString("en-IN")}` : d.kind === "required_revised" ? `Deposit requirement revised to ₹${(d.required_amount ?? 0).toLocaleString("en-IN")}` : `Deposit ${d.kind}`);
  revalidateClient(d.client_id);
  return { message: "Entry added." };
}

/** Recomputes the deposit requirement from active employees and records it. */
export async function recomputeDepositRequirement(clientId: string) {
  const { userId } = await requireOps();
  const sb = await createClient();
  const [{ data: employees }, config] = await Promise.all([sb.from("employees").select("monthly_gross").eq("client_id", clientId).eq("status", "active"), getPricing(clientId)]);
  const monthly = (employees ?? []).reduce((s, e) => s + estimate({ monthlyGross: Number(e.monthly_gross) }, config).perEmployee.monthly, 0);
  const required = monthly * config.deposit_months;
  await sb.from("deposit_entries").insert({ client_id: clientId, kind: "required_revised", amount: 0, required_amount: required, entry_date: new Date().toISOString().slice(0, 10), note: `Requirement recomputed: ${config.deposit_months} × ₹${monthly.toLocaleString("en-IN")}`, created_by: userId });
  await log(clientId, userId, "deposit.required", `Deposit requirement set to ₹${required.toLocaleString("en-IN")}`);
  revalidateClient(clientId);
}

/** Creates the monthly invoice for a period from active employees and the client's pricing. */
export async function createMonthlyInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = z.object({ client_id: z.string().uuid(), period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const { client_id, period } = parsed.data;
  const sb = await createClient();
  const [{ data: employees }, config, { data: client }, { count }] = await Promise.all([
    sb.from("employees").select("id, full_name, monthly_gross").eq("client_id", client_id).eq("status", "active"),
    getPricing(client_id),
    sb.from("clients").select("payment_terms_days").eq("id", client_id).single(),
    sb.from("invoices").select("id", { count: "exact", head: true }),
  ]);
  if (!employees || employees.length === 0) return { error: "No active employees to invoice." };

  const [y, m] = period.split("-").map(Number);
  const periodStart = new Date(Date.UTC(y, m - 1, 1));
  const periodEnd = new Date(Date.UTC(y, m, 0));
  const issue = new Date();
  const due = new Date(issue.getTime() + (client?.payment_terms_days ?? 7) * 86400000);

  let subtotal = 0;
  let gst = 0;
  const lines: { description: string; amount: number; employee_id: string; sort: number }[] = [];
  employees.forEach((e, i) => {
    const r = estimate({ monthlyGross: Number(e.monthly_gross) }, config).perEmployee;
    lines.push({ description: `${e.full_name}: gross salary`, amount: r.gross, employee_id: e.id, sort: i * 3 + 1 });
    lines.push({ description: `${e.full_name}: employer PF, ESI, gratuity, insurance`, amount: r.pf + r.esi + r.gratuity + r.insurance, employee_id: e.id, sort: i * 3 + 2 });
    lines.push({ description: `${e.full_name}: management fee`, amount: r.fee, employee_id: e.id, sort: i * 3 + 3 });
    subtotal += r.employmentCost + r.fee;
    gst += r.gst;
  });

  const number = `INV-${y}-${String((count ?? 0) + 1).padStart(4, "0")}`;
  const { data: invoice, error } = await sb
    .from("invoices")
    .insert({ client_id, number, kind: "monthly", period_start: periodStart.toISOString().slice(0, 10), period_end: periodEnd.toISOString().slice(0, 10), issue_date: issue.toISOString().slice(0, 10), due_date: due.toISOString().slice(0, 10), subtotal, gst, total: subtotal + gst, status: "sent" })
    .select("id")
    .single();
  if (error || !invoice) return { error: error?.message ?? "Could not create invoice" };
  await sb.from("invoice_lines").insert(lines.map((l) => ({ ...l, invoice_id: invoice.id })));
  await log(client_id, userId, "invoice.sent", `Invoice ${number} issued for ₹${(subtotal + gst).toLocaleString("en-IN")}`, { table: "invoices", id: invoice.id });
  revalidateClient(client_id);
  revalidatePath("/ops/billing");
  return { message: `${number} created for ₹${(subtotal + gst).toLocaleString("en-IN")}.` };
}

export async function setInvoiceStatus(invoiceId: string, clientId: string, status: "sent" | "paid" | "overdue" | "void") {
  const { userId } = await requireOps();
  const sb = await createClient();
  const { data } = await sb.from("invoices").update({ status, paid_at: status === "paid" ? new Date().toISOString().slice(0, 10) : null }).eq("id", invoiceId).select("number").single();
  await log(clientId, userId, `invoice.${status}`, `Invoice ${data?.number ?? ""} marked ${status}`);
  revalidateClient(clientId);
  revalidatePath("/ops/billing");
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------
export async function setEmployeeStatus(employeeId: string, clientId: string, status: string) {
  const { userId } = await requireOps();
  const sb = await createClient();
  const { data } = await sb.from("employees").update({ status }).eq("id", employeeId).select("full_name").single();
  await log(clientId, userId, "employee.status", `${data?.full_name ?? "Employee"}: ${status.replace(/_/g, " ")}`, { table: "employees", id: employeeId });
  if (status === "active") await recomputeDepositRequirement(clientId);
  revalidateClient(clientId);
  revalidatePath(`/ops/employees/${employeeId}`);
  revalidatePath(`/app/employees/${employeeId}`);
}

export async function setEmployeeTask(taskId: string, employeeId: string, clientId: string, status: "pending" | "in_progress" | "done" | "blocked") {
  await requireOps();
  const sb = await createClient();
  await sb.from("employee_onboarding_tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", taskId);
  revalidatePath(`/ops/employees/${employeeId}`);
  revalidatePath(`/app/employees/${employeeId}`);
  revalidateClient(clientId);
}

// ---------------------------------------------------------------------------
// Quotes and requests
// ---------------------------------------------------------------------------
const quoteSchema = z.object({
  request_id: z.string().uuid(),
  client_id: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
  valid_until: z.string().or(z.literal("")),
  labels: z.array(z.string().trim()),
  amounts: z.array(z.coerce.number()),
});

export async function sendQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = quoteSchema.safeParse({
    request_id: formData.get("request_id"),
    client_id: formData.get("client_id"),
    note: formData.get("note") ?? undefined,
    valid_until: formData.get("valid_until") ?? "",
    labels: formData.getAll("label"),
    amounts: formData.getAll("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;
  const lines = d.labels.map((label, i) => ({ label, amount: d.amounts[i] ?? 0, sort: i + 1 })).filter((l) => l.label.length > 0);
  if (lines.length === 0) return { error: "Add at least one line." };
  const total = lines.reduce((s, l) => s + l.amount, 0);

  const sb = await createClient();
  await sb.from("quotes").update({ status: "superseded" }).eq("request_id", d.request_id).eq("status", "sent");
  const { data: quote, error } = await sb
    .from("quotes")
    .insert({ request_id: d.request_id, total, note: d.note || null, valid_until: d.valid_until || null, status: "sent", created_by: userId })
    .select("id")
    .single();
  if (error || !quote) return { error: error?.message ?? "Could not create quote" };
  await sb.from("quote_lines").insert(lines.map((l) => ({ ...l, quote_id: quote.id })));
  const { data: req } = await sb.from("requests").update({ status: "quoted" }).eq("id", d.request_id).select("title").single();
  await sb.from("ops_tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("link_table", "requests").eq("link_id", d.request_id).eq("type", "quote");
  await log(d.client_id, userId, "quote.sent", `Quote of ₹${total.toLocaleString("en-IN")} sent for ${req?.title ?? "request"}`, { table: "requests", id: d.request_id });
  revalidateClient(d.client_id);
  revalidatePath(`/ops/requests/${d.request_id}`);
  revalidatePath(`/app/requests/${d.request_id}`);
  return { message: `Quote sent for ₹${total.toLocaleString("en-IN")}. The client has been notified.` };
}

export async function setRequestStatus(requestId: string, clientId: string, status: "in_progress" | "fulfilled" | "cancelled") {
  const { userId } = await requireOps();
  const sb = await createClient();
  const { data } = await sb.from("requests").update({ status }).eq("id", requestId).select("title").single();
  await log(clientId, userId, `request.${status}`, `${data?.title ?? "Request"} ${status.replace("_", " ")}`, { table: "requests", id: requestId });
  revalidateClient(clientId);
  revalidatePath(`/ops/requests/${requestId}`);
  revalidatePath(`/app/requests/${requestId}`);
}

// ---------------------------------------------------------------------------
// Shipments and assets
// ---------------------------------------------------------------------------
const shipmentSchema = z.object({
  client_id: z.string().uuid(),
  request_id: z.string().uuid().or(z.literal("")),
  employee_id: z.string().uuid().or(z.literal("")),
  title: z.string().trim().min(3),
  courier: z.string().trim().optional(),
  awb: z.string().trim().optional(),
  tracking_url: z.string().trim().url().or(z.literal("")),
  deliver_to: z.string().trim().optional(),
  expected_date: z.string().or(z.literal("")),
  asset_tag: z.string().trim().optional(),
  asset_kind: z.enum(["laptop", "monitor", "phone", "accessory", "other"]).optional(),
  asset_model: z.string().trim().optional(),
  asset_serial: z.string().trim().optional(),
});

export async function createShipment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = shipmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;
  const sb = await createClient();

  let assetId: string | null = null;
  if (d.asset_tag && d.asset_model && d.asset_kind) {
    const { data: asset, error } = await sb
      .from("assets")
      .insert({ client_id: d.client_id, tag: d.asset_tag, kind: d.asset_kind, model: d.asset_model, serial: d.asset_serial || null, holder_employee_id: d.employee_id || null, status: "ordered" })
      .select("id")
      .single();
    if (error) return { error: `Asset: ${error.message}` };
    assetId = asset?.id ?? null;
  }

  const { data: shipment, error } = await sb
    .from("shipments")
    .insert({
      client_id: d.client_id,
      request_id: d.request_id || null,
      employee_id: d.employee_id || null,
      asset_id: assetId,
      title: d.title,
      courier: d.courier || null,
      awb: d.awb || null,
      tracking_url: d.tracking_url || null,
      deliver_to: d.deliver_to || null,
      expected_date: d.expected_date || null,
      status: "ordered",
    })
    .select("id")
    .single();
  if (error || !shipment) return { error: error?.message ?? "Could not create shipment" };
  await sb.from("shipment_events").insert({ shipment_id: shipment.id, status: "ordered", note: "Order placed with vendor" });
  if (d.request_id) await sb.from("requests").update({ status: "in_progress" }).eq("id", d.request_id).in("status", ["approved"]);
  await log(d.client_id, userId, "shipment.created", `Shipment created: ${d.title}`, { table: "shipments", id: shipment.id });
  revalidateClient(d.client_id);
  revalidatePath("/ops/shipments");
  return { message: "Shipment created." };
}

const eventSchema = z.object({
  shipment_id: z.string().uuid(),
  client_id: z.string().uuid(),
  status: z.enum(["ordered", "packed", "picked_up", "in_transit", "out_for_delivery", "delivered", "returned", "lost"]),
  location: z.string().trim().optional(),
  note: z.string().trim().optional(),
  courier: z.string().trim().optional(),
  awb: z.string().trim().optional(),
  tracking_url: z.string().trim().url().or(z.literal("")).optional(),
});

export async function addShipmentEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;
  const sb = await createClient();
  await sb.from("shipment_events").insert({ shipment_id: d.shipment_id, status: d.status, location: d.location || null, note: d.note || null });
  const patch: Record<string, unknown> = { status: d.status };
  if (d.courier) patch.courier = d.courier;
  if (d.awb) patch.awb = d.awb;
  if (d.tracking_url) patch.tracking_url = d.tracking_url;
  if (d.status === "delivered") patch.delivered_at = new Date().toISOString();
  const { data: shipment } = await sb.from("shipments").update(patch).eq("id", d.shipment_id).select("title, asset_id, request_id").single();

  if (shipment?.asset_id) {
    const assetStatus = d.status === "delivered" ? "issued" : d.status === "returned" ? "returned" : ["picked_up", "in_transit", "out_for_delivery"].includes(d.status) ? "in_transit" : null;
    if (assetStatus) await sb.from("assets").update({ status: assetStatus, issued_at: assetStatus === "issued" ? new Date().toISOString().slice(0, 10) : null }).eq("id", shipment.asset_id);
  }
  if (shipment?.request_id && d.status === "delivered") {
    await sb.from("requests").update({ status: "fulfilled" }).eq("id", shipment.request_id);
    await sb.from("ops_tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("link_table", "requests").eq("link_id", shipment.request_id).eq("type", "shipment");
  }
  await log(d.client_id, userId, "shipment.event", `${shipment?.title ?? "Shipment"}: ${d.status.replace(/_/g, " ")}`, { table: "shipments", id: d.shipment_id });
  revalidateClient(d.client_id);
  revalidatePath("/ops/shipments");
  return { message: "Updated." };
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------
const pricingSchema = z.object({
  fee_per_employee: z.coerce.number().min(0),
  fee_percent: z.coerce.number().min(0).max(100),
  insurance_per_month: z.coerce.number().min(0),
  gst_rate: z.coerce.number().min(0).max(100),
  deposit_months: z.coerce.number().int().min(0).max(12),
  basic_percent: z.coerce.number().min(1).max(100),
  pf_wage_cap: z.coerce.number().min(0),
  esi_wage_ceiling: z.coerce.number().min(0),
  gst_on_full_invoice: z.coerce.boolean().optional(),
  pf_on_full_basic: z.coerce.boolean().optional(),
});

export async function updateGlobalPricing(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId, profile } = await requireOps();
  if (profile.role !== "ops_admin") return { error: "Only ops admins can change pricing." };
  const raw = Object.fromEntries(formData) as Record<string, unknown>;
  raw.gst_on_full_invoice = formData.get("gst_on_full_invoice") === "on";
  raw.pf_on_full_basic = formData.get("pf_on_full_basic") === "on";
  const parsed = pricingSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const sb = await createClient();
  const { error } = await sb.from("pricing_configs").update(parsed.data).is("client_id", null);
  if (error) return { error: error.message };
  await log(null, userId, "pricing.updated", "Global pricing updated");
  revalidatePath("/ops/pricing");
  revalidatePath("/estimate");
  revalidatePath("/app/estimator");
  return { message: "Pricing saved. New estimates use these rates immediately." };
}
