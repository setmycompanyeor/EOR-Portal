"use server";

import { revalidatePath } from "next/cache";
import { requireOps } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listInvoicesForCustomer, mapStatus, zohoConfigured } from "@/lib/zoho";

/**
 * Pulls invoices from Zoho Books for every client that has a zoho_contact_id and
 * upserts them into the portal. Zoho is the source of truth for anything it holds.
 */
export async function syncZohoInvoices(): Promise<{ message: string }> {
  const { userId } = await requireOps();
  if (!zohoConfigured()) return { message: "Zoho Books is not configured. Add the ZOHO_* variables to .env.local." };

  const sb = await createClient();
  const { data: clients } = await sb.from("clients").select("id, name, zoho_contact_id").not("zoho_contact_id", "is", null);
  if (!clients || clients.length === 0) return { message: "No clients are linked to a Zoho customer yet. Set zoho_contact_id on the client." };

  let upserted = 0;
  const errors: string[] = [];
  for (const c of clients) {
    try {
      const invoices = await listInvoicesForCustomer(c.zoho_contact_id as string);
      for (const z of invoices) {
        const row = {
          client_id: c.id,
          number: z.invoice_number,
          kind: "monthly" as const,
          issue_date: z.date,
          due_date: z.due_date,
          subtotal: z.sub_total,
          gst: z.tax_total,
          total: z.total,
          status: mapStatus(z.status),
          paid_at: z.status === "paid" ? z.last_payment_date ?? null : null,
          zoho_invoice_id: z.invoice_id,
        };
        const { data: existing } = await sb.from("invoices").select("id").eq("zoho_invoice_id", z.invoice_id).maybeSingle();
        const { error } = existing ? await sb.from("invoices").update(row).eq("id", existing.id) : await sb.from("invoices").insert(row);
        if (error) errors.push(`${z.invoice_number}: ${error.message}`);
        else upserted++;
      }
    } catch (e) {
      errors.push(`${c.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await sb.from("activity_log").insert({ client_id: null, actor_id: userId, verb: "zoho.sync", summary: `Zoho sync: ${upserted} invoices updated${errors.length ? `, ${errors.length} errors` : ""}` });
  revalidatePath("/ops/billing");
  revalidatePath("/app/billing");
  return { message: `${upserted} invoice${upserted === 1 ? "" : "s"} synced${errors.length ? `. Errors: ${errors.slice(0, 3).join("; ")}` : "."}` };
}
