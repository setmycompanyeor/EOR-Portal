"use server";

import { revalidatePath } from "next/cache";
import { requireOps } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyClient } from "@/lib/notify";
import { toDateInput } from "@/lib/format";
import {
  CLAIM_APPROVAL, LEAVE_STATUS, claimTotal, kekaConfigured, leaveSummary, listEmployees, listExpenseCategories, listExpenseClaims, listLeaveRequests, markClaimPaid,
} from "@/lib/keka";

type Result = { message: string };

/**
 * Pulls pending leave requests and expense claims from Keka into `approvals`.
 * - Employees without keka_employee_id are matched once by work or personal email.
 * - Items already logged (same keka_reference) are skipped.
 * - Items we hold as pending that Keka now shows decided were handled inside
 *   Keka directly; they are marked synced with that decision.
 */
export async function syncKekaApprovals(): Promise<Result> {
  const { userId } = await requireOps();
  if (!kekaConfigured()) return { message: "Keka is not configured. Add KEKA_COMPANY, KEKA_CLIENT_ID, KEKA_CLIENT_SECRET and KEKA_API_KEY to .env.local." };

  const sb = await createClient();
  const errors: string[] = [];
  let matched = 0;
  let created = 0;
  let reconciled = 0;

  try {
    // 1. Map Keka employees to ours by email where not yet linked.
    const { data: ours } = await sb.from("employees").select("id, client_id, full_name, email, keka_employee_id").in("status", ["active", "offboarding", "contract_sent", "offer_pending"]);
    const unlinked = (ours ?? []).filter((e) => !e.keka_employee_id && e.email);
    if (unlinked.length > 0) {
      const kekaEmployees = await listEmployees();
      const byEmail = new Map<string, string>();
      for (const k of kekaEmployees) {
        for (const em of [k.email, k.personalEmail]) if (em) byEmail.set(em.toLowerCase(), k.id);
      }
      for (const e of unlinked) {
        const kid = byEmail.get(String(e.email).toLowerCase());
        if (kid) {
          await sb.from("employees").update({ keka_employee_id: kid }).eq("id", e.id);
          e.keka_employee_id = kid;
          matched++;
        }
      }
    }
    const linked = (ours ?? []).filter((e) => e.keka_employee_id);
    if (linked.length === 0) return { message: `No employees are linked to Keka yet (${matched} matched this run). Add work emails that match Keka, or set keka_employee_id.` };
    const byKeka = new Map(linked.map((e) => [e.keka_employee_id as string, e]));
    const kekaIds = linked.map((e) => e.keka_employee_id as string);

    const { data: existingRows } = await sb.from("approvals").select("id, keka_reference, status, client_id, kind, title").not("keka_reference", "is", null);
    const existing = new Map((existingRows ?? []).map((r) => [r.keka_reference as string, r]));

    const reconcile = async (ref: string, kekaDecided: "approved" | "rejected" | null) => {
      const row = existing.get(ref);
      if (!row || !kekaDecided || row.status !== "pending") return;
      await sb.from("approvals").update({ status: "synced", decided_at: new Date().toISOString(), decision_note: `Decided in Keka (${kekaDecided})`, synced_by: userId, synced_at: new Date().toISOString() }).eq("id", row.id);
      reconciled++;
    };

    // 2. Leave requests in a 90-day window around today.
    const from = new Date(Date.now() - 20 * 86400000);
    const to = new Date(Date.now() + 69 * 86400000);
    const leaves = await listLeaveRequests(from, to, kekaIds);
    for (const l of leaves) {
      const emp = byKeka.get(l.employeeIdentifier);
      if (!emp) continue;
      const ref = `keka-leave:${l.id}`;
      if (l.status === LEAVE_STATUS.approved || l.status === LEAVE_STATUS.rejected) {
        await reconcile(ref, l.status === LEAVE_STATUS.approved ? "approved" : "rejected");
        continue;
      }
      if (l.status !== LEAVE_STATUS.pending && l.status !== LEAVE_STATUS.inApproval) continue;
      if (existing.has(ref)) continue;
      const { type, days } = leaveSummary(l);
      const title = `${type}${days ? `, ${days} day${days === 1 ? "" : "s"}` : ""}`;
      const { error } = await sb.from("approvals").insert({
        client_id: emp.client_id, employee_id: emp.id, kind: "leave", title,
        detail: l.note || null, from_date: String(l.fromDate).slice(0, 10), to_date: String(l.toDate).slice(0, 10), leave_type: type,
        keka_reference: ref, created_by: userId,
      });
      if (error) errors.push(`leave ${l.id}: ${error.message}`);
      else {
        created++;
        await notifyClient(emp.client_id, `Leave request: ${emp.full_name}`, title, "/app/approvals");
      }
    }

    // 3. Expense claims awaiting approval.
    const [claims, categories] = await Promise.all([listExpenseClaims(kekaIds), listExpenseCategories()]);
    for (const c of claims) {
      const emp = byKeka.get(c.employeeIdentifier);
      if (!emp) continue;
      const ref = `keka-claim:${c.id}`;
      if (c.approvalStatus === CLAIM_APPROVAL.approved || c.approvalStatus === CLAIM_APPROVAL.paid) {
        await reconcile(ref, "approved");
        continue;
      }
      if (c.approvalStatus === CLAIM_APPROVAL.rejected) {
        await reconcile(ref, "rejected");
        continue;
      }
      if (![CLAIM_APPROVAL.pending, CLAIM_APPROVAL.submitted, CLAIM_APPROVAL.inApproval].includes(c.approvalStatus as 1 | 2 | 6)) continue;
      if (existing.has(ref)) continue;
      const total = claimTotal(c);
      if (total <= 0) continue;
      const cats = Array.from(new Set((c.expenses ?? []).map((e) => categories.get(e.expenseCategoryId ?? "") ?? "").filter(Boolean)));
      const detail = (c.expenses ?? []).map((e) => `${e.title ?? "Expense"}${e.date ? ` (${String(e.date).slice(0, 10)})` : ""}: ₹${(Number(e.amount) || 0).toLocaleString("en-IN")}${e.comment ? ` · ${e.comment}` : ""}`).join("\n");
      const title = c.title || `Expense claim ${c.claimNumber ?? ""}`.trim();
      const { error } = await sb.from("approvals").insert({
        client_id: emp.client_id, employee_id: emp.id, kind: "reimbursement", title,
        detail: detail || null, amount: total, category: cats.join(", ") || null, keka_reference: ref, created_by: userId,
      });
      if (error) errors.push(`claim ${c.id}: ${error.message}`);
      else {
        created++;
        await notifyClient(emp.client_id, `Reimbursement request: ${emp.full_name}`, `₹${total.toLocaleString("en-IN")} · ${title}`, "/app/approvals");
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  await sb.from("activity_log").insert({ client_id: null, actor_id: userId, verb: "keka.sync", summary: `Keka sync: ${created} new, ${reconciled} decided in Keka, ${matched} employees linked${errors.length ? `, ${errors.length} errors` : ""}` });
  revalidatePath("/ops/approvals");
  revalidatePath("/app/approvals");
  revalidatePath("/app");
  return {
    message: `${created} new request${created === 1 ? "" : "s"} pulled, ${reconciled} already decided in Keka, ${matched} employee${matched === 1 ? "" : "s"} linked.${errors.length ? ` Errors: ${errors.slice(0, 3).join("; ")}` : ""}`,
  };
}

/** Tells Keka a reimbursement has been paid (after it was billed to the client). */
export async function markApprovalPaidInKeka(approvalId: string): Promise<Result> {
  const { userId } = await requireOps();
  if (!kekaConfigured()) return { message: "Keka is not configured." };
  const sb = await createClient();
  const { data: a } = await sb.from("approvals").select("id, client_id, title, kind, keka_reference, invoice_id").eq("id", approvalId).single();
  if (!a || a.kind !== "reimbursement") return { message: "Not a reimbursement." };
  const claimId = a.keka_reference?.startsWith("keka-claim:") ? a.keka_reference.slice("keka-claim:".length) : null;
  if (!claimId) return { message: "This item was logged by hand; mark it paid inside Keka." };
  try {
    await markClaimPaid(claimId, new Date(), `Paid via SetMyCompany invoice ${a.invoice_id ? "" : "(pending)"}`.trim());
  } catch (e) {
    return { message: e instanceof Error ? e.message : String(e) };
  }
  await sb.from("activity_log").insert({ client_id: a.client_id, actor_id: userId, verb: "keka.paid", summary: `${a.title} marked paid in Keka`, subject_table: "approvals", subject_id: a.id });
  revalidatePath("/ops/approvals");
  return { message: `Marked paid in Keka on ${toDateInput(new Date())}.` };
}
