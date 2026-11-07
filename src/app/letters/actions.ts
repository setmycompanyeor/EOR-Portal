"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canApproveRole, getSession, isOpsRole, requireOps } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricing } from "@/lib/data/portal";
import { notifyClient, notifyOps } from "@/lib/notify";
import { extractPlaceholders, renderData, renderDocx, salaryFor } from "@/lib/letters";
import type { Client, Employee } from "@/lib/types";

export type ActionState = { error?: string; message?: string };
const kinds = ["offer_letter", "employment_contract", "relieving_letter", "other"] as const;

// ---------------------------------------------------------------------------
// Templates (EOR admin)
// ---------------------------------------------------------------------------
export async function uploadTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId, profile } = await requireOps();
  if (profile.role !== "ops_admin") return { error: "Only EOR admins can manage templates." };
  const name = z.string().trim().min(2).safeParse(formData.get("name"));
  const kind = z.enum(kinds).safeParse(formData.get("kind"));
  const clientId = z.string().uuid().or(z.literal("")).safeParse(formData.get("client_id") ?? "");
  const file = formData.get("file");
  if (!name.success) return { error: "Give the template a name." };
  if (!kind.success) return { error: "Pick a letter type." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a .docx file." };
  if (!file.name.toLowerCase().endsWith(".docx")) return { error: "Templates must be Word .docx files." };
  if (file.size > 10 * 1024 * 1024) return { error: "Template must be under 10 MB." };

  const buffer = Buffer.from(await file.arrayBuffer());
  let placeholders: string[];
  try {
    placeholders = extractPlaceholders(buffer);
  } catch (e) {
    return { error: `Could not read placeholders: ${e instanceof Error ? e.message : String(e)}. Use {{name}} style placeholders.` };
  }
  if (placeholders.length === 0) return { error: "No {{placeholders}} found in the document." };

  const sb = await createClient();
  const path = `templates/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error: upErr } = await sb.storage.from("documents").upload(path, buffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  if (upErr) return { error: `Upload failed: ${upErr.message}` };
  const { error } = await sb.from("letter_templates").insert({ client_id: clientId.success && clientId.data ? clientId.data : null, kind: kind.data, name: name.data, storage_path: path, placeholders, created_by: userId });
  if (error) return { error: error.message };
  revalidatePath("/ops/templates");
  return { message: `Template saved with ${placeholders.length} placeholder${placeholders.length === 1 ? "" : "s"}: ${placeholders.join(", ")}` };
}

export async function setTemplateActive(id: string, active: boolean) {
  const { profile } = await requireOps();
  if (profile.role !== "ops_admin") return;
  const sb = await createClient();
  await sb.from("letter_templates").update({ active }).eq("id", id);
  revalidatePath("/ops/templates");
}

// ---------------------------------------------------------------------------
// Filling, generating, issuing
// ---------------------------------------------------------------------------
async function loadContext(employeeId: string) {
  const session = await getSession();
  if (!session) return { error: "Sign in again." as const };
  const sb = await createClient();
  const { data: employee } = await sb.from("employees").select("*").eq("id", employeeId).single();
  if (!employee) return { error: "Employee not found." as const };
  const ops = isOpsRole(session.profile.role);
  if (!ops && (session.profile.client_id !== employee.client_id || !canApproveRole(session.profile.role))) return { error: "Not allowed." as const };
  const { data: client } = await sb.from("clients").select("*").eq("id", employee.client_id).single();
  return { session, sb, ops, employee: employee as Employee, client: client as Client | null };
}

const saveSchema = z.object({ employee_id: z.string().uuid(), template_id: z.string().uuid(), kind: z.enum(kinds) });

/** Saves the form values (client ops/admin or EOR ops). Creates the letter row on first save. */
export async function saveLetterValues(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = saveSchema.safeParse({ employee_id: formData.get("employee_id"), template_id: formData.get("template_id"), kind: formData.get("kind") });
  if (!parsed.success) return { error: "Invalid request" };
  const ctx = await loadContext(parsed.data.employee_id);
  if ("error" in ctx) return { error: ctx.error };
  const { sb, session, employee, ops } = ctx;

  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("v:") && typeof v === "string") values[k.slice(2)] = v.trim();
  }
  const { data: existing } = await sb.from("employee_letters").select("id, status").eq("employee_id", employee.id).eq("kind", parsed.data.kind).maybeSingle();
  if (existing?.status === "issued") return { error: "This letter has been issued; ask SetMyCompany to reissue it." };

  const row = { client_id: employee.client_id, employee_id: employee.id, template_id: parsed.data.template_id, kind: parsed.data.kind, values, status: "draft" as const, updated_by: session.userId, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await sb.from("employee_letters").update(row).eq("id", existing.id)
    : await sb.from("employee_letters").insert({ ...row, created_by: session.userId });
  if (error) return { error: error.message };

  if (!ops) await notifyOps(employee.client_id, `Offer letter details filled: ${employee.full_name}`, "Review, generate and issue from the employee page.", `/ops/employees/${employee.id}`);
  revalidatePath(`/app/employees/${employee.id}`);
  revalidatePath(`/ops/employees/${employee.id}`);
  return { message: ops ? "Saved." : "Saved. SetMyCompany will review and issue the letter." };
}

/** Renders the letter to a .docx in storage (EOR ops). */
export async function generateLetter(employeeId: string, kind: (typeof kinds)[number] = "offer_letter"): Promise<ActionState> {
  await requireOps();
  const ctx = await loadContext(employeeId);
  if ("error" in ctx) return { error: ctx.error };
  const { sb, session, employee, client } = ctx;
  const { data: letter } = await sb.from("employee_letters").select("*").eq("employee_id", employeeId).eq("kind", kind).maybeSingle();
  if (!letter) return { error: "Fill in the details first." };
  const { data: template } = await sb.from("letter_templates").select("*").eq("id", letter.template_id).single();
  if (!template) return { error: "Template missing." };

  const { data: file, error: dlErr } = await sb.storage.from("documents").download(template.storage_path);
  if (dlErr || !file) return { error: `Could not read template: ${dlErr?.message ?? "unknown"}` };
  const config = await getPricing(employee.client_id);
  const salary = salaryFor(employee, config);
  let out: Buffer;
  try {
    out = renderDocx(Buffer.from(await file.arrayBuffer()), renderData(employee, client, letter.values as Record<string, string>, salary));
  } catch (e) {
    return { error: `Template error: ${e instanceof Error ? e.message : String(e)}` };
  }
  const safe = employee.full_name.replace(/[^\w.\-]+/g, "_");
  const path = `${employee.client_id}/letters/${kind}-${safe}-${Date.now()}.docx`;
  const { error: upErr } = await sb.storage.from("documents").upload(path, out, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  if (upErr) return { error: `Could not save letter: ${upErr.message}` };
  await sb.from("employee_letters").update({ salary, generated_path: path, status: "generated", updated_by: session.userId, updated_at: new Date().toISOString() }).eq("id", letter.id);
  revalidatePath(`/ops/employees/${employeeId}`);
  revalidatePath(`/app/employees/${employeeId}`);
  return { message: "Letter generated. Download to review, then issue." };
}

/** Attaches the generated letter to the employee's documents so the client can download it (EOR ops). */
export async function issueLetter(employeeId: string, kind: (typeof kinds)[number] = "offer_letter"): Promise<ActionState> {
  const { userId } = await requireOps();
  const sb = await createClient();
  const { data: letter } = await sb.from("employee_letters").select("*").eq("employee_id", employeeId).eq("kind", kind).maybeSingle();
  if (!letter?.generated_path) return { error: "Generate the letter first." };
  const { data: employee } = await sb.from("employees").select("id, client_id, full_name").eq("id", employeeId).single();
  if (!employee) return { error: "Employee not found." };

  const { data: doc, error } = await sb
    .from("documents")
    .insert({ client_id: employee.client_id, employee_id: employee.id, kind: kind === "offer_letter" ? "offer_letter" : kind === "employment_contract" ? "employment_contract" : "other", name: `${kind.replace(/_/g, " ")} - ${employee.full_name}.docx`, storage_path: letter.generated_path, status: "verified", uploaded_by: userId, verified_by: userId, verified_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !doc) return { error: error?.message ?? "Could not issue" };
  await sb.from("employee_letters").update({ status: "issued", document_id: doc.id, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", letter.id);
  if (kind === "offer_letter") await sb.from("employees").update({ status: "offer_pending" }).eq("id", employee.id).in("status", ["requested", "estimate_sent", "estimate_approved"]);
  const admin = createAdminClient();
  await admin.from("activity_log").insert({ client_id: employee.client_id, actor_id: userId, verb: "letter.issued", summary: `${kind.replace(/_/g, " ")} issued to ${employee.full_name}`, subject_table: "employees", subject_id: employee.id });
  await notifyClient(employee.client_id, `${kind === "offer_letter" ? "Offer letter" : "Letter"} ready: ${employee.full_name}`, "Download it from the employee's page.", `/app/employees/${employee.id}`);
  revalidatePath(`/ops/employees/${employeeId}`);
  revalidatePath(`/app/employees/${employeeId}`);
  return { message: "Issued. The client can download it from the employee's page." };
}
