"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canApproveRole, requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricing } from "@/lib/data/portal";
import { estimate } from "@/lib/pricing";
import { notifyOps } from "@/lib/notify";
import { toDateInput } from "@/lib/format";

export type ActionState = { error?: string; message?: string };

async function log(clientId: string, actorId: string, verb: string, summary: string, subject?: { table: string; id: string }) {
  const sb = await createClient();
  await sb.from("activity_log").insert({ client_id: clientId, actor_id: actorId, verb, summary, subject_table: subject?.table ?? null, subject_id: subject?.id ?? null });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
const docKinds = ["incorporation", "board_resolution", "signatory_id", "tax_residency", "kyc_other", "other"] as const;

export async function uploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId, userId, profile } = await requireClient();
  if (!canApproveRole(profile.role)) return { error: "Only admins can upload documents." };

  const file = formData.get("file");
  const kind = z.enum(docKinds).safeParse(formData.get("kind"));
  const employeeId = z.string().uuid().optional().safeParse(formData.get("employee_id") || undefined);
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > 20 * 1024 * 1024) return { error: "Files must be under 20 MB." };
  if (!kind.success) return { error: "Pick a document type." };

  const sb = await createClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${clientId}/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await sb.storage.from("documents").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { error: `Upload failed: ${upErr.message}` };

  const { error } = await sb.from("documents").insert({
    client_id: clientId,
    employee_id: employeeId.success ? employeeId.data ?? null : null,
    kind: kind.data,
    name: file.name,
    storage_path: path,
    size_bytes: file.size,
    uploaded_by: userId,
  });
  if (error) return { error: error.message };

  await log(clientId, userId, "document.uploaded", `Uploaded ${file.name}`);
  await notifyOps(clientId, `Document to verify: ${file.name}`, undefined, `/ops/clients/${clientId}`);
  revalidatePath("/app/onboarding");
  if (employeeId.success && employeeId.data) revalidatePath(`/app/employees/${employeeId.data}`);
  return { message: "Uploaded. We will verify it within one business day." };
}

export async function getDocumentUrl(documentId: string): Promise<string | null> {
  const { clientId } = await requireClient();
  const sb = await createClient();
  const { data } = await sb.from("documents").select("storage_path").eq("client_id", clientId).eq("id", documentId).single();
  if (!data?.storage_path) return null;
  const { data: signed } = await sb.storage.from("documents").createSignedUrl(data.storage_path, 60 * 10);
  return signed?.signedUrl ?? null;
}

// ---------------------------------------------------------------------------
// Hire requests
// ---------------------------------------------------------------------------
const hireSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the candidate's full name"),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")),
  job_title: z.string().trim().min(2, "Enter a job title"),
  location_city: z.string().trim().min(1, "Enter a city"),
  location_state: z.string().trim().min(1, "Pick a state"),
  monthly_gross: z.coerce.number().min(10000, "Gross must be at least ₹10,000").max(10_000_000),
  start_date: z.string().min(1, "Pick a start date"),
  employment_type: z.enum(["permanent", "fixed_term"]),
  probation_months: z.coerce.number().int().min(0).max(12),
});

const defaultEmployeeTasks = [
  { key: "hire_requested", label: "Hire request submitted", owner: "client", sort: 1 },
  { key: "estimate_approved", label: "Cost estimate approved", owner: "client", sort: 2, detail: "Confirm the monthly cost we sent" },
  { key: "documents", label: "Candidate documents uploaded", owner: "employee", sort: 3, detail: "Aadhaar, PAN, bank proof, UAN, education, last 3 payslips" },
  { key: "bgv", label: "Background verification", owner: "ops", sort: 4 },
  { key: "offer_signoff", label: "Offer letter signed off", owner: "client", sort: 5, detail: "Review and sign off the draft offer letter" },
  { key: "contract", label: "Employment contract e-signed by candidate", owner: "ops", sort: 6 },
  { key: "equipment", label: "Equipment delivered before day one", owner: "ops", sort: 7 },
];

export async function requestHire(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId, userId, profile } = await requireClient();
  if (!canApproveRole(profile.role)) return { error: "Only admins and approvers can request hires." };
  const parsed = hireSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;

  const sb = await createClient();
  const { data: employee, error } = await sb
    .from("employees")
    .insert({
      client_id: clientId,
      full_name: d.full_name,
      email: d.email || null,
      job_title: d.job_title,
      location_city: d.location_city,
      location_state: d.location_state,
      monthly_gross: d.monthly_gross,
      start_date: d.start_date,
      employment_type: d.employment_type,
      probation_months: d.probation_months,
      status: "requested",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !employee) return { error: error?.message ?? "Could not save the request" };

  // Tasks for the client are inserted via the ops path (RLS lets clients insert employees only),
  // so we use the admin client for the dependent rows this action owns.
  const admin = createAdminClient();
  const config = await getPricing(clientId);
  const est = estimate({ monthlyGross: d.monthly_gross }, config);
  await Promise.all([
    admin.from("employee_onboarding_tasks").insert(
      defaultEmployeeTasks.map((t) => ({ ...t, employee_id: employee.id, status: t.key === "hire_requested" ? "done" : "pending", completed_at: t.key === "hire_requested" ? new Date().toISOString() : null })),
    ),
    admin.from("estimates").insert({ client_id: clientId, employee_id: employee.id, inputs: { monthlyGross: d.monthly_gross, headcount: 1 }, result: est, created_by: userId }),
    admin.from("ops_tasks").insert({
      client_id: clientId,
      type: "onboarding",
      title: `Send cost estimate for ${d.full_name}`,
      detail: `${d.job_title} · ${d.location_city} · gross ₹${d.monthly_gross.toLocaleString("en-IN")} · start ${d.start_date}`,
      due_date: toDateInput(new Date(Date.now() + 86400000)),
      link_table: "employees",
      link_id: employee.id,
    }),
  ]);
  await log(clientId, userId, "employee.requested", `Hire requested: ${d.full_name}, ${d.job_title}`, { table: "employees", id: employee.id });
  await notifyOps(clientId, `New hire request: ${d.full_name}`, `${d.job_title} · ₹${d.monthly_gross.toLocaleString("en-IN")} · start ${d.start_date}`, `/ops/employees/${employee.id}`);

  revalidatePath("/app/employees");
  revalidatePath("/app");
  redirect(`/app/employees/${employee.id}`);
}

export async function completeClientTask(taskId: string, employeeId: string) {
  const { clientId, userId } = await requireClient();
  const sb = await createClient();
  const { error } = await sb.from("employee_onboarding_tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", taskId).eq("owner", "client");
  if (!error) {
    await log(clientId, userId, "task.completed", "Completed an onboarding task", { table: "employee_onboarding_tasks", id: taskId });
    await notifyOps(clientId, "Client completed an onboarding task", undefined, `/ops/employees/${employeeId}`);
  }
  revalidatePath(`/app/employees/${employeeId}`);
  revalidatePath("/app");
}

// ---------------------------------------------------------------------------
// Requests and quotes
// ---------------------------------------------------------------------------
const requestSchema = z.object({
  category: z.enum(["equipment", "benefit", "salary_revision", "learning", "other"]),
  title: z.string().trim().min(3, "Give the request a title"),
  description: z.string().trim().max(2000).optional(),
  employee_id: z.string().uuid().optional().or(z.literal("")),
});

export async function raiseRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId, userId, profile } = await requireClient();
  if (!canApproveRole(profile.role)) return { error: "Only admins and approvers can raise requests." };
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;

  const sb = await createClient();
  const { data: req, error } = await sb
    .from("requests")
    .insert({ client_id: clientId, employee_id: d.employee_id || null, category: d.category, title: d.title, description: d.description || null, raised_by: userId })
    .select("id")
    .single();
  if (error || !req) return { error: error?.message ?? "Could not raise the request" };

  const admin = createAdminClient();
  await admin.from("ops_tasks").insert({
    client_id: clientId,
    type: "quote",
    title: `Quote: ${d.title}`,
    detail: d.description ?? null,
    due_date: toDateInput(new Date(Date.now() + 2 * 86400000)),
    link_table: "requests",
    link_id: req.id,
  });
  await log(clientId, userId, "request.raised", `Raised request: ${d.title}`, { table: "requests", id: req.id });
  await notifyOps(clientId, `New request to quote: ${d.title}`, d.description ?? undefined, `/ops/requests/${req.id}`);

  revalidatePath("/app/requests");
  redirect(`/app/requests/${req.id}`);
}

export async function decideQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId, userId, profile } = await requireClient();
  if (!canApproveRole(profile.role)) return { error: "Only admins and approvers can decide quotes." };
  const quoteId = z.string().uuid().safeParse(formData.get("quote_id"));
  const requestId = z.string().uuid().safeParse(formData.get("request_id"));
  const decision = z.enum(["approved", "rejected"]).safeParse(formData.get("decision"));
  if (!quoteId.success || !requestId.success || !decision.success) return { error: "Invalid request" };

  const sb = await createClient();
  const { data: req } = await sb.from("requests").select("id, title, status").eq("id", requestId.data).eq("client_id", clientId).single();
  if (!req || req.status !== "quoted") return { error: "This request is no longer awaiting a decision." };

  const { error: qErr } = await sb.from("quotes").update({ status: decision.data }).eq("id", quoteId.data).eq("request_id", requestId.data).eq("status", "sent");
  if (qErr) return { error: qErr.message };
  const { error: rErr } = await sb
    .from("requests")
    .update({ status: decision.data, decided_by: userId, decided_at: new Date().toISOString() })
    .eq("id", requestId.data);
  if (rErr) return { error: rErr.message };

  const admin = createAdminClient();
  if (decision.data === "approved") {
    await admin.from("ops_tasks").insert({
      client_id: clientId,
      type: "shipment",
      title: `Fulfil: ${req.title}`,
      detail: "Quote approved by client. Place the order and post tracking.",
      due_date: toDateInput(new Date(Date.now() + 2 * 86400000)),
      link_table: "requests",
      link_id: req.id,
    });
  }
  await log(clientId, userId, `quote.${decision.data}`, `${decision.data === "approved" ? "Approved" : "Rejected"} quote for ${req.title}`, { table: "requests", id: req.id });
  await notifyOps(clientId, `Quote ${decision.data}: ${req.title}`, undefined, `/ops/requests/${req.id}`);

  revalidatePath(`/app/requests/${requestId.data}`);
  revalidatePath("/app/requests");
  revalidatePath("/app");
  return { message: decision.data === "approved" ? "Approved. We will place the order and post tracking here." : "Rejected. Tell us what to change and we will requote." };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const clientProfileSchema = z.object({
  legal_name: z.string().trim().max(200).optional(),
  billing_address: z.string().trim().max(500).optional(),
  finance_email: z.string().trim().email().or(z.literal("")),
});

export async function updateClientProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId, userId, profile } = await requireClient();
  if (profile.role !== "client_admin") return { error: "Only admins can change billing details." };
  const parsed = clientProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ legal_name: parsed.data.legal_name || null, billing_address: parsed.data.billing_address || null, finance_email: parsed.data.finance_email || null })
    .eq("id", clientId);
  if (error) return { error: error.message };
  await log(clientId, userId, "client.updated", "Updated billing profile");
  revalidatePath("/app/settings");
  revalidatePath("/app/onboarding");
  return { message: "Saved." };
}

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  full_name: z.string().trim().min(2, "Enter their name"),
  role: z.enum(["client_admin", "client_approver", "client_viewer"]),
});

export async function inviteUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId, userId, profile } = await requireClient();
  if (profile.role !== "client_admin") return { error: "Only admins can invite colleagues." };
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.full_name, client_id: clientId, role: parsed.data.role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/app`,
  });
  if (error) return { error: error.message };
  await log(clientId, userId, "user.invited", `Invited ${parsed.data.email} as ${parsed.data.role.replace("client_", "")}`);
  revalidatePath("/app/settings");
  return { message: `Invitation sent to ${parsed.data.email}.` };
}

// ---------------------------------------------------------------------------
// Approvals (leave / reimbursement raised in payroll)
// ---------------------------------------------------------------------------
export async function decideApproval(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { clientId, userId, profile } = await requireClient();
  if (!canApproveRole(profile.role)) return { error: "Only admins and approvers can decide." };
  const id = z.string().uuid().safeParse(formData.get("id"));
  const decision = z.enum(["approved", "rejected"]).safeParse(formData.get("decision"));
  const note = z.string().trim().max(500).optional().safeParse(formData.get("note") ?? undefined);
  if (!id.success || !decision.success) return { error: "Invalid request" };

  const sb = await createClient();
  const { data, error } = await sb
    .from("approvals")
    .update({ status: decision.data, decided_by: userId, decided_at: new Date().toISOString(), decision_note: note.success && note.data ? note.data : null })
    .eq("id", id.data)
    .eq("client_id", clientId)
    .eq("status", "pending")
    .select("id, title, kind, amount, employee_id")
    .single();
  if (error || !data) return { error: "This request has already been decided." };

  const admin = createAdminClient();
  await admin.from("ops_tasks").insert({
    client_id: clientId,
    type: "payroll",
    title: `Apply in Keka: ${data.title} (${decision.data})`,
    detail: `Client ${decision.data} this ${data.kind}. Mirror the decision in Keka, then mark it synced on the Approvals page.`,
    due_date: toDateInput(new Date(Date.now() + 86400000)),
    link_table: "approvals",
    link_id: data.id,
  });
  await log(clientId, userId, `approval.${decision.data}`, `${decision.data === "approved" ? "Approved" : "Rejected"} ${data.kind}: ${data.title}`, { table: "approvals", id: data.id });
  await notifyOps(clientId, `${data.kind === "leave" ? "Leave" : "Reimbursement"} ${decision.data}: ${data.title}`, "Apply the decision in Keka and mark it synced.", "/ops/approvals");

  revalidatePath("/app/approvals");
  revalidatePath("/app");
  revalidatePath("/ops/approvals");
  return { message: decision.data === "approved" ? "Approved. SetMyCompany will apply it in payroll." : "Rejected." };
}

export async function getInvoicePdfUrl(invoiceId: string): Promise<string | null> {
  const { clientId } = await requireClient();
  const sb = await createClient();
  const { data } = await sb.from("invoices").select("pdf_path").eq("client_id", clientId).eq("id", invoiceId).single();
  if (!data?.pdf_path) return null;
  const { data: signed } = await sb.storage.from("documents").createSignedUrl(data.pdf_path, 60 * 10);
  return signed?.signedUrl ?? null;
}
