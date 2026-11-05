"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOps } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricing } from "@/lib/data/portal";
import { estimate } from "@/lib/pricing";
import { notifyClient } from "@/lib/notify";
import { toDateInput } from "@/lib/format";

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
  await sb.from("ops_tasks").insert({ client_id: client.id, type: "onboarding", title: `Verify KYC documents for ${d.name}`, due_date: toDateInput(new Date(Date.now() + 3 * 86400000)), owner_id: userId });

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
  if (status === "done") await notifyClient(clientId, `Onboarding step complete: ${step?.label ?? "step"}`, undefined, "/app/onboarding");
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
  await notifyClient(clientId, `Document ${status}: ${doc?.name ?? ""}`, status === "rejected" ? "Please upload a corrected copy." : undefined, doc?.employee_id ? `/app/employees/${doc.employee_id}` : "/app/onboarding");
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
  if (d.kind === "received") await notifyClient(d.client_id, `Deposit received: ₹${(d.amount ?? 0).toLocaleString("en-IN")}`, d.reference ? `Reference ${d.reference}` : undefined, "/app/billing");
  if (d.kind === "required_revised") await notifyClient(d.client_id, `Deposit requirement updated to ₹${(d.required_amount ?? 0).toLocaleString("en-IN")}`, d.note ?? undefined, "/app/billing");
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
  await sb.from("deposit_entries").insert({ client_id: clientId, kind: "required_revised", amount: 0, required_amount: required, entry_date: toDateInput(new Date()), note: `Requirement recomputed: ${config.deposit_months} × ₹${monthly.toLocaleString("en-IN")}`, created_by: userId });
  await notifyClient(clientId, `Deposit requirement updated to ₹${required.toLocaleString("en-IN")}`, `${config.deposit_months} months of the current monthly invoice`, "/app/billing");
  await log(clientId, userId, "deposit.required", `Deposit requirement set to ₹${required.toLocaleString("en-IN")}`);
  revalidateClient(clientId);
}

/** Prepares a DRAFT for a period from active employees, pricing and unbilled reimbursements.
 *  Ops copies the lines into Zoho Books, then records the Zoho invoice (number + PDF) over this draft. */
export async function createMonthlyInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = z.object({ client_id: z.string().uuid(), period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const { client_id, period } = parsed.data;
  const sb = await createClient();
  const [y, m] = period.split("-").map(Number);
  const [{ data: employees }, config, { data: client }, { data: lastInvoice }] = await Promise.all([
    sb.from("employees").select("id, full_name, monthly_gross").eq("client_id", client_id).eq("status", "active"),
    getPricing(client_id),
    sb.from("clients").select("payment_terms_days").eq("id", client_id).single(),
    sb.from("invoices").select("number").like("number", `DRAFT-${y}${String(m).padStart(2, "0")}-%`).order("number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!employees || employees.length === 0) return { error: "No active employees to invoice." };

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

  const lastSeq = Number(lastInvoice?.number?.split("-").pop() ?? 0) || 0;
  // Approved reimbursements not yet billed are passed through at cost (no GST).
  const { data: reimbursements } = await sb
    .from("approvals")
    .select("id, title, amount, employees(full_name)")
    .eq("client_id", client_id)
    .eq("kind", "reimbursement")
    .in("status", ["approved", "synced"])
    .is("invoice_id", null);
  for (const r of (reimbursements ?? []) as unknown as { id: string; title: string; amount: number | null; employees: { full_name: string } | null }[]) {
    const amt = Number(r.amount ?? 0);
    if (amt <= 0) continue;
    lines.push({ description: `Reimbursement, ${r.employees?.full_name ?? "employee"}: ${r.title}`, amount: amt, employee_id: "", sort: 1000 + lines.length });
    subtotal += amt;
  }

  const number = `DRAFT-${y}${String(m).padStart(2, "0")}-${String(lastSeq + 1).padStart(3, "0")}`;
  const { data: invoice, error } = await sb
    .from("invoices")
    .insert({ client_id, number, kind: "monthly", period_start: periodStart.toISOString().slice(0, 10), period_end: periodEnd.toISOString().slice(0, 10), issue_date: toDateInput(issue), due_date: toDateInput(due), subtotal, gst, total: subtotal + gst, status: "draft" })
    .select("id")
    .single();
  if (error || !invoice) return { error: error?.message ?? "Could not create invoice" };
  await sb.from("invoice_lines").insert(lines.map((l) => ({ ...l, employee_id: l.employee_id || null, invoice_id: invoice.id })));
  if (reimbursements && reimbursements.length > 0) {
    await sb.from("approvals").update({ invoice_id: invoice.id }).in("id", reimbursements.map((r) => r.id));
  }
  await log(client_id, userId, "invoice.draft", `Draft ${number} prepared for ₹${(subtotal + gst).toLocaleString("en-IN")}`, { table: "invoices", id: invoice.id });
  revalidateClient(client_id);
  revalidatePath("/ops/billing");
  return { message: `Draft ${number} prepared: subtotal ₹${subtotal.toLocaleString("en-IN")}, GST ₹${gst.toLocaleString("en-IN")}, total ₹${(subtotal + gst).toLocaleString("en-IN")}. Raise it in Zoho Books, then record the Zoho invoice below.` };
}

export async function setInvoiceStatus(invoiceId: string, clientId: string, status: "sent" | "paid" | "overdue" | "void") {
  const { userId } = await requireOps();
  const sb = await createClient();
  const { data } = await sb.from("invoices").update({ status, paid_at: status === "paid" ? toDateInput(new Date()) : null }).eq("id", invoiceId).select("number").single();
  await log(clientId, userId, `invoice.${status}`, `Invoice ${data?.number ?? ""} marked ${status}`);
  if (status === "paid" || status === "overdue") await notifyClient(clientId, `Invoice ${data?.number ?? ""} ${status === "paid" ? "received, thank you" : "is overdue"}`, undefined, "/app/billing");
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
  await notifyClient(clientId, `${data?.full_name ?? "Employee"}: ${status.replace(/_/g, " ")}`, undefined, `/app/employees/${employeeId}`);
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
  await notifyClient(d.client_id, `Quote ready: ${req?.title ?? "your request"}`, `₹${total.toLocaleString("en-IN")}, awaiting your approval`, `/app/requests/${d.request_id}`);
  revalidateClient(d.client_id);
  revalidatePath(`/ops/requests/${d.request_id}`);
  revalidatePath(`/app/requests/${d.request_id}`);
  return { message: `Quote sent for ₹${total.toLocaleString("en-IN")}. It is now visible in the client portal.` };
}

export async function setRequestStatus(requestId: string, clientId: string, status: "in_progress" | "fulfilled" | "cancelled") {
  const { userId } = await requireOps();
  const sb = await createClient();
  const { data } = await sb.from("requests").update({ status }).eq("id", requestId).select("title").single();
  await log(clientId, userId, `request.${status}`, `${data?.title ?? "Request"} ${status.replace("_", " ")}`, { table: "requests", id: requestId });
  await notifyClient(clientId, `${data?.title ?? "Request"}: ${status.replace("_", " ")}`, undefined, `/app/requests/${requestId}`);
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
  await notifyClient(d.client_id, `On its way: ${d.title}`, d.courier ? `${d.courier}${d.awb ? ` · AWB ${d.awb}` : ""}` : "Order placed", "/app/tracking");
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
    if (assetStatus) await sb.from("assets").update({ status: assetStatus, issued_at: assetStatus === "issued" ? toDateInput(new Date()) : null }).eq("id", shipment.asset_id);
  }
  if (shipment?.request_id && d.status === "delivered") {
    await sb.from("requests").update({ status: "fulfilled" }).eq("id", shipment.request_id);
    await sb.from("ops_tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("link_table", "requests").eq("link_id", shipment.request_id).eq("type", "shipment");
  }
  await log(d.client_id, userId, "shipment.event", `${shipment?.title ?? "Shipment"}: ${d.status.replace(/_/g, " ")}`, { table: "shipments", id: d.shipment_id });
  await notifyClient(d.client_id, `${shipment?.title ?? "Shipment"}: ${d.status.replace(/_/g, " ")}`, d.location ?? undefined, "/app/tracking");
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

/** Sets a client's contracted rates. Adds a new effective-from-today row; getPricing() picks the latest. */
export async function setClientPricing(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const clientId = z.string().uuid().safeParse(formData.get("client_id"));
  if (!clientId.success) return { error: "Invalid client" };
  const raw = Object.fromEntries(formData) as Record<string, unknown>;
  raw.gst_on_full_invoice = formData.get("gst_on_full_invoice") === "on";
  raw.pf_on_full_basic = formData.get("pf_on_full_basic") === "on";
  const parsed = pricingSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const sb = await createClient();
  const { error } = await sb.from("pricing_configs").insert({ ...parsed.data, client_id: clientId.data, effective_from: toDateInput(new Date()) });
  if (error) return { error: error.message };
  await log(clientId.data, userId, "pricing.client", `Contracted rates set: ₹${parsed.data.fee_per_employee.toLocaleString("en-IN")} fee, ${parsed.data.deposit_months}-month deposit`);
  await recomputeDepositRequirement(clientId.data);
  revalidateClient(clientId.data);
  revalidatePath("/app/estimator");
  return { message: "Client pricing saved. Estimates, invoices and the deposit requirement now use these rates." };
}

// ---------------------------------------------------------------------------
// Documents issued to an employee record (offer letter, signed contract)
// ---------------------------------------------------------------------------
const opsDocKinds = ["offer_letter", "employment_contract", "other"] as const;

export async function uploadEmployeeDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const employeeId = z.string().uuid().safeParse(formData.get("employee_id"));
  const kind = z.enum(opsDocKinds).safeParse(formData.get("kind"));
  const file = formData.get("file");
  if (!employeeId.success) return { error: "Invalid employee" };
  if (!kind.success) return { error: "Pick a document type." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > 20 * 1024 * 1024) return { error: "Files must be under 20 MB." };

  const sb = await createClient();
  const { data: emp } = await sb.from("employees").select("id, full_name, client_id").eq("id", employeeId.data).single();
  if (!emp) return { error: "Employee not found" };
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${emp.client_id}/employees/${emp.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await sb.storage.from("documents").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { error: `Upload failed: ${upErr.message}` };
  const { error } = await sb.from("documents").insert({
    client_id: emp.client_id, employee_id: emp.id, kind: kind.data, name: file.name, storage_path: path, size_bytes: file.size,
    status: "verified", uploaded_by: userId, verified_by: userId, verified_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  await log(emp.client_id, userId, "document.issued", `${file.name} issued to ${emp.full_name}`, { table: "employees", id: emp.id });
  await notifyClient(emp.client_id, `${file.name} issued to ${emp.full_name}`, undefined, `/app/employees/${emp.id}`);
  revalidatePath(`/ops/employees/${emp.id}`);
  revalidatePath(`/app/employees/${emp.id}`);
  return { message: "Uploaded. The client can download it from the employee's page." };
}

// ---------------------------------------------------------------------------
// Approvals: logged from Keka, decided by the client, applied in Keka by ops
// ---------------------------------------------------------------------------
const approvalSchema = z.object({
  employee_id: z.string().uuid(),
  kind: z.enum(["leave", "reimbursement"]),
  title: z.string().trim().min(3, "Give it a title"),
  detail: z.string().trim().max(1000).optional(),
  amount: z.coerce.number().min(0).optional(),
  category: z.string().trim().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  leave_type: z.string().trim().optional(),
  keka_reference: z.string().trim().optional(),
});

export async function createApproval(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = approvalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;
  if (d.kind === "reimbursement" && !(d.amount && d.amount > 0)) return { error: "Enter the reimbursement amount." };
  if (d.kind === "leave" && (!d.from_date || !d.to_date)) return { error: "Enter the leave dates." };

  const sb = await createClient();
  const { data: emp } = await sb.from("employees").select("id, full_name, client_id").eq("id", d.employee_id).single();
  if (!emp) return { error: "Employee not found" };
  const { data: row, error } = await sb
    .from("approvals")
    .insert({
      client_id: emp.client_id,
      employee_id: emp.id,
      kind: d.kind,
      title: d.title,
      detail: d.detail || null,
      amount: d.kind === "reimbursement" ? d.amount : null,
      category: d.kind === "reimbursement" ? d.category || null : null,
      from_date: d.kind === "leave" ? d.from_date : null,
      to_date: d.kind === "leave" ? d.to_date : null,
      leave_type: d.kind === "leave" ? d.leave_type || null : null,
      keka_reference: d.keka_reference || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !row) return { error: error?.message ?? "Could not save" };
  await log(emp.client_id, userId, "approval.raised", `${d.kind === "leave" ? "Leave" : "Reimbursement"} request for ${emp.full_name}: ${d.title}`, { table: "approvals", id: row.id });
  await notifyClient(emp.client_id, `${d.kind === "leave" ? "Leave" : "Reimbursement"} request: ${emp.full_name}`, d.kind === "reimbursement" ? `₹${(d.amount ?? 0).toLocaleString("en-IN")} · ${d.title}` : d.title, "/app/approvals");
  revalidatePath("/ops/approvals");
  revalidatePath("/app/approvals");
  revalidatePath("/app");
  return { message: "Sent to the client for approval." };
}

export async function markApprovalSynced(id: string) {
  const { userId } = await requireOps();
  const sb = await createClient();
  const { data } = await sb
    .from("approvals")
    .update({ status: "synced", synced_by: userId, synced_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["approved", "rejected"])
    .select("client_id, title, kind, status")
    .single();
  if (data) {
    await sb.from("ops_tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("link_table", "approvals").eq("link_id", id);
    await log(data.client_id, userId, "approval.synced", `${data.title} applied in Keka`, { table: "approvals", id });
    await notifyClient(data.client_id, `${data.kind === "leave" ? "Leave" : "Reimbursement"} applied in payroll: ${data.title}`, data.kind === "reimbursement" ? "It will appear on your next invoice." : undefined, "/app/approvals");
  }
  revalidatePath("/ops/approvals");
  revalidatePath("/ops");
  revalidatePath("/app/approvals");
}

// ---------------------------------------------------------------------------
// Invoices raised in Zoho Books, recorded here with their PDF
// ---------------------------------------------------------------------------
const zohoInvoiceSchema = z.object({
  client_id: z.string().uuid(),
  draft_id: z.string().uuid().or(z.literal("")).optional(),
  number: z.string().trim().min(3, "Enter the Zoho invoice number"),
  kind: z.enum(["monthly", "one_time", "deposit"]),
  period: z.string().regex(/^\d{4}-\d{2}$/).or(z.literal("")).optional(),
  issue_date: z.string().min(1, "Enter the issue date"),
  due_date: z.string().min(1, "Enter the due date"),
  subtotal: z.coerce.number().min(0),
  gst: z.coerce.number().min(0),
  total: z.coerce.number().min(0.01, "Enter the total"),
});

export async function recordZohoInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireOps();
  const parsed = zohoInvoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Attach the invoice PDF from Zoho." };
  if (file.size > 20 * 1024 * 1024) return { error: "PDF must be under 20 MB." };
  if (Math.abs(d.subtotal + d.gst - d.total) > 1) return { error: "Subtotal + GST does not equal the total." };

  const sb = await createClient();
  const safeNumber = d.number.replace(/[^\w.\-]+/g, "_");
  const path = `${d.client_id}/invoices/${safeNumber}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const { error: upErr } = await sb.storage.from("documents").upload(path, file, { contentType: "application/pdf" });
  if (upErr) return { error: `Upload failed: ${upErr.message}` };

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (d.kind === "monthly" && d.period) {
    const [y, m] = d.period.split("-").map(Number);
    periodStart = toDateInput(new Date(y, m - 1, 1));
    periodEnd = toDateInput(new Date(y, m, 0));
  }
  const row = { number: d.number, kind: d.kind, period_start: periodStart, period_end: periodEnd, issue_date: d.issue_date, due_date: d.due_date, subtotal: d.subtotal, gst: d.gst, total: d.total, status: "sent" as const, pdf_path: path };

  let invoiceId: string;
  if (d.draft_id) {
    const { data, error } = await sb.from("invoices").update(row).eq("id", d.draft_id).eq("client_id", d.client_id).eq("status", "draft").select("id").single();
    if (error || !data) return { error: error?.message ?? "Draft not found" };
    invoiceId = data.id;
  } else {
    const { data, error } = await sb.from("invoices").insert({ ...row, client_id: d.client_id }).select("id").single();
    if (error || !data) return { error: error?.message?.includes("duplicate") ? "An invoice with this number already exists." : error?.message ?? "Could not save" };
    invoiceId = data.id;
  }

  await log(d.client_id, userId, "invoice.sent", `Invoice ${d.number} recorded for ₹${d.total.toLocaleString("en-IN")}`, { table: "invoices", id: invoiceId });
  await notifyClient(d.client_id, `Invoice ${d.number}: ₹${d.total.toLocaleString("en-IN")}`, `Due ${d.due_date}. PDF available on your billing page.`, "/app/billing");
  revalidateClient(d.client_id);
  revalidatePath("/ops/billing");
  return { message: `${d.number} recorded and shared with the client.` };
}

export async function getInvoicePdfUrlOps(invoiceId: string): Promise<string | null> {
  await requireOps();
  const sb = await createClient();
  const { data } = await sb.from("invoices").select("pdf_path").eq("id", invoiceId).single();
  if (!data?.pdf_path) return null;
  const { data: signed } = await sb.storage.from("documents").createSignedUrl(data.pdf_path, 60 * 10);
  return signed?.signedUrl ?? null;
}
